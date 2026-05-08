import Order from '../models/Order.js';
import User from '../models/User.js';
import { generateInvoicePDF } from '../services/invoiceService.js';
import { sendEmailWithAttachment } from '../services/emailService.js';
import { publishToQueue } from '../services/queue/messageService.js';

// Create a new order for the authenticated user
// @desc    Create new order
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    // Debug log to see the raw request body
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));

    // Handle both orderItems (from frontend) and items (legacy)
    const items = req.body.orderItems || req.body.items || [];
    
    const {
      shippingAddress = {},
      paymentMethod,
      taxPrice = 0,
      shippingPrice = 0,
    } = req.body;

    const phoneNumber = req.body.phoneNumber || shippingAddress.phone;
     
    if(!phoneNumber){
      return res.status(400).json({
        message:'Phone Number is required',
        field: 'phoneNumber'
      })
    }


    // Debug log to see the extracted items
    console.log('Extracted items:', items);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        message: 'Order must have at least one item',
        receivedBody: req.body // Include received body for debugging
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: 'paymentMethod is required' });
    }

    const normalizedShippingAddress = {
      address: shippingAddress.address || shippingAddress.line1,
      city: shippingAddress.city,
      postalCode: shippingAddress.postalCode,
      country: shippingAddress.country || shippingAddress.state || 'India',
    };

    if (!normalizedShippingAddress.address || !normalizedShippingAddress.city ||
        !normalizedShippingAddress.postalCode || !normalizedShippingAddress.country) {
      return res.status(400).json({ message: 'Complete shippingAddress is required' });
    }

    // Compute itemsPrice from items (quantity * price)
    const itemsPrice = items.reduce((sum, it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      return sum + qty * price;
    }, 0);

    const totalPrice = Number(itemsPrice) + Number(taxPrice || 0) + Number(shippingPrice || 0);

    // Debug log before creating order
    console.log('Creating order with:', {
      user: req.user?._id,
      itemsCount: items.length,
      itemsPrice,
      shippingPrice,
      taxPrice,
      totalPrice,
      phoneNumber
    });

    const order = await Order.create({
      user: req.user._id,
      items,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      phoneNumber
    });

    // Populate user and product details
    const created = await order.populate([
      { path: 'user', select: 'email fullName' },
      { path: 'items.product', select: 'name image price' }
    ]);

    // Log successful order creation
    console.log(`Order created: ${created._id} for user ${req.user._id}`);

    res.status(201).json(created);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      message: 'Error creating order',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// Mark order as paid and email invoice
// @desc    Get logged in user orders
// @route   GET /api/orders
// @access  Private
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email _id'); // Make sure to include _id in the populated fields

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Add debug logs
    console.log('Order user ID:', order.user?._id);
    console.log('Request user ID:', req.user?._id);
    console.log('Is admin:', req.user?.isAdmin);

    // Check if the order belongs to the user or if user is admin
    if (
      order.user?._id?.toString() !== req.user?._id?.toString() && 
      !req.user?.isAdmin
    ) {
      return res.status(401).json({ 
        message: 'Not authorized to view this order',
        orderUserId: order.user?._id,
        requestUserId: req.user?._id
      });
    }

    res.json(order);
  } catch (error) {
    console.error('Error getting order by ID:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
};

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
export const updateOrderToPaid = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log('Updating order to paid. Order ID:', orderId);
    
    // Log the request body for debugging
    console.log('Request body:', req.body);
    
    // Find the order
    const order = await Order.findById(orderId);
    console.log('Found order:', order ? 'Yes' : 'No');
    
    if (!order) {
      console.log('Order not found with ID:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order fields
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id || 'test_payment_id',
      status: req.body.status || 'completed',
      update_time: req.body.update_time || new Date().toISOString(),
      email_address: req.body.email_address || req.user.email
    };

    const updatedOrder = await order.save();
    console.log('Order updated successfully:', updatedOrder._id);
    
    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order to paid:', error);
    res.status(500).json({ 
      message: 'Error updating order', 
      error: error.message 
    });
  }
};
// @desc    Mark order as paid (admin)
// @route   POST /api/orders/:orderId/pay
// @access  Private/Admin
export const markOrderPaid = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentResult } = req.body; // { id, status, update_time, email_address , phoneNumber }

    let order = await Order.findById(orderId)
      .populate('user', 'email fullName')
      .populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ensure the requester is the owner or admin
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this order' });
    }

    order.isPaid = true;
    order.paidAt = new Date();
    if (paymentResult) {
      order.paymentResult = {
        id: paymentResult.id,
        status: paymentResult.status,
        update_time: paymentResult.update_time,
        email_address: paymentResult.email_address,
        phoneNumber: paymentResult.phoneNumber
      };
    }

    await order.save();

    // Generate invoice
    const pdfBuffer = await generateInvoicePDF(order);

    // Email invoice (only if email is enabled and configured)
    const emailEnabled = process.env.ENABLE_EMAIL_INVOICES !== 'false';
    let emailSent = false;

    if (emailEnabled) {
      try {
        await sendEmailWithAttachment({
          to: order.user.email,
          subject: `Your Invoice for Order ${order._id}`,
          text: 'Please find attached your invoice.',
          html: `<p>Hi ${order.user.fullName || ''},</p><p>Thanks for your purchase. Your invoice is attached.</p>`,
          attachments: [
            {
              filename: `invoice-${order._id}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });
        emailSent = true;
      } catch (emailErr) {
        // Log but don't fail the request - email issues shouldn't break order processing
        console.error('Failed to send invoice email:', emailErr.message);
        console.error('Email error details:', emailErr);
      }
    } else {
      console.log('Email invoices disabled - skipping email send');
    }

    res.json({
      success: true,
      message: 'Order marked as paid' + (emailSent ? ' and invoice sent' : emailEnabled ? ' but email failed' : ' (email disabled)'),
      order,
      emailSent
    });
  } catch (error) {
    console.error('markOrderPaid error:', error);
    res.status(500).json({ message: 'Error marking order as paid' });
  }
};



export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'email fullName')
      .populate('items.product', 'name');
    res.json(orders);
  } catch (error) {
    console.error('getAllOrders error:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
};



// Download invoice as PDF
export const getOrderInvoice = async (req, res) => {
    try {
      const { orderId } = req.params;
      console.log('Fetching invoice for order:', orderId);
  
      const order = await Order.findById(orderId)
        .populate('user', 'email fullName phoneNumber')
        .populate('items.product', 'name');
  
      if (!order) {
        console.log('Order not found');
        return res.status(404).json({ message: 'Order not found' });
      }
  
      console.log('Order found, checking permissions...');
  
      // Check permissions
      if (String(order.user._id) !== String(req.user._id) && req.user.role !== 'admin') {
        console.log('Permission denied for user:', req.user._id);
        return res.status(403).json({ message: 'Not authorized to view this invoice' });
      }
  
          console.log('Generating PDF invoice...');
      
      // Use the imported generateInvoicePDF function
      const pdfBuffer = await generateInvoicePDF(order);
      
      console.log('PDF generated, sending response...');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id}.pdf`);
      return res.send(pdfBuffer);
    } catch (error) {
      console.error('getOrderInvoice error:', error);
      res.status(500).json({ 
        message: 'Error generating invoice',
        error: error.message 
      });
    }
  };
