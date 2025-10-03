import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  addToWishlist, 
  removeFromWishlist, 
  getWishlist 
} from '../controllers/WishlistController.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

// POST /api/wishlist - Add to wishlist
router.post('/', addToWishlist);

// DELETE /api/wishlist/:productId - Remove from wishlist
router.delete('/:productId', removeFromWishlist);

// GET /api/wishlist - Get user's wishlist
router.get('/', getWishlist);

export default router;
