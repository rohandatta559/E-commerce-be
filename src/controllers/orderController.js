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
    const {
      items = [],
      shippingAddress,
      paymentMethod,
      taxPrice = 0,
      shippingPrice = 0
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item' });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: 'paymentMethod is required' });
    }

    if (!shippingAddress || !shippingAddress.address || !shippingAddress.city || !shippingAddress.postalCode || !shippingAddress.country) {
      return res.status(400).json({ message: 'Complete shippingAddress is required' });
    }

    // Compute itemsPrice from items (quantity * price)
    const itemsPrice = items.reduce((sum, it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      return sum + qty * price;
    }, 0);

    const totalPrice = Number(itemsPrice) + Number(taxPrice || 0) + Number(shippingPrice || 0);

    const order = await Order.create({
      user: req.user._id,
      items,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice
    });

    const created = await order.populate([
      { path: 'user', select: 'email fullName' },
      { path: 'items.product', select: 'name' }
    ]);

    return res.status(201).json(created);
  } catch (error) {
    console.error('createOrder error:', error);
    return res.status(500).json({ message: 'Error creating order' });
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
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if the order belongs to the user or if user is admin
    if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: 'Not authorized to view this order' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error getting order by ID:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
export const updateOrderToPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if the order belongs to the user
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized to update this order' });
    }
    
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id,
      status: req.body.status,
      update_time: req.body.update_time,
      email_address: req.body.payer.email_address
    };
    
    const updatedOrder = await order.save();
    
    // Publish to order processing queue
    await publishToQueue('order_processing', updatedOrder);
    
    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order to paid:', error);
    res.status(500).json({ message: 'Server error' });
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