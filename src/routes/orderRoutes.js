import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  createOrder, 
  getOrderById, 
  updateOrderToPaid, 
  getMyOrders,
  markOrderPaid,
  getOrderInvoice,
  getAllOrders
} from '../controllers/orderController.js';

const router = express.Router();

// Public routes (if any)

// Protected routes
router.use(protect);

// Create a new order & get logged in user orders
router.route('/')
  .post(createOrder)
  .get(getMyOrders);

// Admin routes
router.get('/all', getAllOrders);

// Get order by ID
router.get('/:id', getOrderById);

// Update order to paid
router.put('/:id/pay', updateOrderToPaid);

// Mark order as paid (admin)
router.post('/:orderId/pay', markOrderPaid);

// Download invoice
router.get('/:orderId/invoice', getOrderInvoice);

export default router;
