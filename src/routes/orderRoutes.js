import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { admin } from '../middleware/adminMiddleware.js';
import { 
  createOrder, 
  getOrderById, 
  updateOrderToPaid, 
  getMyOrders,
  getOrderStats,
  markOrderPaid,
  markOrderDelivered,
  getOrderInvoice,
  sendOrderInvoiceEmail,
  getAllOrders,
  updateOrderStatus
} from '../controllers/orderController.js';

const router = express.Router();

// Public routes (if any)

// Protected routes
router.use(protect);

// Create a new order & get logged in user orders
router.route('/')
  .post(createOrder)
  .get(getMyOrders);

// Get order statistics
router.get('/stats/overview', getOrderStats);

// Admin routes
router.get('/all', admin, getAllOrders);
router.put('/:orderId/status', admin, updateOrderStatus);

// Get order by ID
router.get('/:id', getOrderById);

// Update order to paid
router.put('/:id/pay', updateOrderToPaid);

// Mark order as paid (admin)
router.post('/:orderId/pay', markOrderPaid);
router.put('/:orderId/deliver', markOrderDelivered);

// Download invoice
router.get('/:orderId/invoice', getOrderInvoice);

// Send invoice email
router.post('/:orderId/send-invoice', sendOrderInvoiceEmail);

export default router;
