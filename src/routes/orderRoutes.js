import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createOrder, markOrderPaid, getOrderInvoice, getAllOrders} from '../controllers/orderController.js';

const router = express.Router();

// Create a new order
router.post('/', protect, createOrder);

router.get('/all', protect, getAllOrders);
// Mark order as paid (user or admin)
router.post('/:orderId/pay', protect, markOrderPaid);

// Download invoice PDF (user or admin)
router.get('/:orderId/invoice', protect, getOrderInvoice);

export default router;
