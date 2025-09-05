import express from 'express';
import { 
  searchProducts, 
  getSearchSuggestions, 
  getFilterOptions 
} from '../controllers/searchController.js';

const router = express.Router();

// Search products with filters
router.get('/', searchProducts);

// Get search suggestions
router.get('/suggestions', getSearchSuggestions);

// Get filter options (categories, brands, price range)
router.get('/filters', getFilterOptions);

export default router;
