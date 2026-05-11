import Order from '../models/Order.js';
import User from '../models/User.js';
import { generateInvoicePDF } from '../services/invoiceService.js';
import { sendEmailWithAttachment } from '../services/emailService.js';
import { publishToQueue } from '../services/queue/messageService.js';

const formatINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));

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

    // Send invoice email automatically after order creation
    try {
      const pdfBuffer = await generateInvoicePDF(created);
      
      const emailEnabled = process.env.ENABLE_EMAIL_INVOICES !== 'false';
      let emailSent = false;

      if (emailEnabled && created.user.email) {
        await sendEmailWithAttachment({
          to: created.user.email,
          subject: `Your Order Confirmation & Invoice - Order ${created._id.toString().substring(0, 8)}`,
          text: `Thank you for your order! Your order has been placed successfully. Please find your invoice attached.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #7c3aed;">Order Confirmation</h2>
              <p>Hi ${created.user.fullName || 'Valued Customer'},</p>
              <p>Thank you for your purchase! Your order has been placed successfully.</p>
              <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #7c3aed;">Order Details</h3>
                <p><strong>Order ID:</strong> ${created._id.toString().substring(0, 8)}</p>
                <p><strong>Total Amount:</strong> ${formatINR(created.totalPrice)}</p>
                <p><strong>Payment Method:</strong> ${created.paymentMethod}</p>
                <p><strong>Order Date:</strong> ${new Date(created.createdAt).toLocaleString('en-IN')}</p>
              </div>
              <p>Your invoice is attached to this email for your records.</p>
              <p>If you have any questions, please don't hesitate to contact our support team.</p>
              <p>Best regards,<br>The Shoply Team</p>
            </div>
          `,
          attachments: [
            {
              filename: `invoice-${created._id}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });
        emailSent = true;
        console.log(`Invoice email sent successfully for order ${created._id}`);
      } else if (!emailEnabled) {
        console.log('Email invoices disabled - skipping email send');
      } else {
        console.log('No email address found for user - skipping email send');
      }

      // Add email sent status to response
      created.emailSent = emailSent;
    } catch (emailError) {
      console.error('Failed to send invoice email:', emailError.message);
      // Don't fail the order creation if email fails
      created.emailSent = false;
    }

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
    const { status, sortBy, order } = req.query;
    
    // Build filter object
    let filter = { user: req.user._id };
    
    if (status && status !== 'all') {
      if (status === 'pending') {
        filter.isPaid = false;
      } else if (status === 'paid') {
        filter.isPaid = true;
        filter.isDelivered = false;
      } else if (status === 'delivered') {
        filter.isDelivered = true;
      } else if (status === 'shipped') {
        filter.isPaid = true;
        filter.isDelivered = false;
      }
    }

    // Get orders with filter
    let query = Order.find(filter);

    // Apply sorting
    if (sortBy === 'date') {
      query = query.sort({ createdAt: order === 'asc' ? 1 : -1 });
    } else if (sortBy === 'amount') {
      query = query.sort({ totalPrice: order === 'asc' ? 1 : -1 });
    } else {
      // Default: sort by date descending
      query = query.sort({ createdAt: -1 });
    }

    const orders = await query.exec();
    res.json(orders);
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get order statistics for logged in user
// @route   GET /api/orders/stats/overview
// @access  Private
export const getOrderStats = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    
    const stats = {
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      avgOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0) / orders.length : 0,
      deliveredOrders: orders.filter(order => order.isDelivered).length,
      pendingOrders: orders.filter(order => !order.isDelivered && !order.deliveredAt).length,
      ordersByStatus: {
        pending: orders.filter(order => !order.isPaid).length,
        paid: orders.filter(order => order.isPaid && !order.isDelivered).length,
        delivered: orders.filter(order => order.isDelivered).length,
      }
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting order statistics:', error);
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
// @desc    Send invoice email for an order
// @route   POST /api/orders/:orderId/send-invoice
// @access  Private
export const sendOrderInvoiceEmail = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('user', 'email fullName phoneNumber')
      .populate('items.product', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check permissions
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to send invoice for this order' });
    }

    // Check if user has email
    if (!order.user.email) {
      return res.status(400).json({ message: 'User does not have an email address' });
    }

    // Generate invoice PDF
    const pdfBuffer = await generateInvoicePDF(order);

    // Send email
    await sendEmailWithAttachment({
      to: order.user.email,
      subject: `Your Invoice for Order ${order._id.toString().substring(0, 8)}`,
      text: `Please find attached your invoice for order ${order._id.toString().substring(0, 8)}.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Order Invoice</h2>
          <p>Hi ${order.user.fullName || 'Valued Customer'},</p>
          <p>Please find your invoice attached for order ${order._id.toString().substring(0, 8)}.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #7c3aed;">Order Details</h3>
            <p><strong>Order ID:</strong> ${order._id.toString().substring(0, 8)}</p>
            <p><strong>Total Amount:</strong> ${formatINR(order.totalPrice)}</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString('en-IN')}</p>
          </div>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The Shoply Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `invoice-${order._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({
      success: true,
      message: 'Invoice email sent successfully',
      orderId: order._id,
      email: order.user.email
    });

  } catch (error) {
    console.error('sendOrderInvoiceEmail error:', error);
    const orderId = req.params?.orderId;
    const host = req.get('host');
    const protocol = req.protocol || 'http';
    const invoicePath = `/api/orders/${orderId}/invoice`;
    const invoiceDownloadUrl = `${protocol}://${host}${invoicePath}`;

    if (error?.code === 'SMTP_AUTH_FAILED') {
      return res.status(200).json({
        success: false,
        message: 'Email is not configured yet. You can still download the invoice PDF.',
        error: error.message,
        invoicePath,
        invoiceDownloadUrl
      });
    }

    return res.status(500).json({
      message: 'Error sending invoice email',
      error: error.message,
      invoicePath,
      invoiceDownloadUrl
    });
  }
};
