import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { admin } from '../middleware/adminMiddleware.js';
import { 
  getSalesAnalytics, 
  getUsers, 
  getProducts, 
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders, 
  updateOrderStatus 
} from '../controllers/adminController.js';

const router = express.Router();

// Protect all routes with admin middleware
router.use(protect);
router.use(admin);

// Analytics Routes
router.get('/analytics', getSalesAnalytics);

// User Management Routes
router.get('/users', getUsers);

// Product Management Routes
router.get('/products', getProducts);
router.post('/products', createProduct);
router.put('/products/:productId', updateProduct);
router.delete('/products/:productId', deleteProduct);

// Order Management Routes
router.get('/orders', getOrders);
router.put('/orders/:orderId/status', updateOrderStatus);

export default router;
