import Product from '../models/Product.js';

export const searchProducts = async (req, res) => {
  try {
    const { 
      q: query = '', 
      category, 
      brand, 
      minPrice, 
      maxPrice, 
      inStock,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    const result = await Product.search(query, {
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      sortBy,
      sortOrder,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      data: result.products,
      pagination: {
        total: result.total,
        page: result.currentPage,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      },
      filters: {
        query,
        category,
        brand,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        inStock: inStock === 'true',
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: error.message
    });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    // Search in product names, categories, and brands
    const products = await Product.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(5)
    .select('name category brand');

    // Extract unique suggestions
    const suggestions = [];
    const added = new Set();

    products.forEach(product => {
      // Add product name
      if (product.name && !added.has(product.name.toLowerCase())) {
        suggestions.push({
          type: 'product',
          value: product.name,
          id: product._id
        });
        added.add(product.name.toLowerCase());
      }

      // Add category
      if (product.category && !added.has(`category:${product.category}`)) {
        suggestions.push({
          type: 'category',
          value: product.category,
          id: product.category.toLowerCase().replace(/\s+/g, '-')
        });
        added.add(`category:${product.category}`);
      }

      // Add brand
      if (product.brand && !added.has(`brand:${product.brand}`)) {
        suggestions.push({
          type: 'brand',
          value: product.brand,
          id: `brand-${product.brand.toLowerCase().replace(/\s+/g, '-')}`
        });
        added.add(`brand:${product.brand}`);
      }
    });

    res.json({
      success: true,
      suggestions: suggestions.slice(0, 10) // Limit to 10 suggestions
    });
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting search suggestions',
      error: error.message
    });
  }
};

export const getFilterOptions = async (req, res) => {
  try {
    const [categories, brands] = await Promise.all([
      Product.distinct('category').sort(),
      Product.distinct('brand').filter(Boolean).sort()
    ]);

    // Get price range
    const priceRange = await Product.aggregate([
      {
        $group: {
          _id: null,
          min: { $min: '$price' },
          max: { $max: '$price' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        categories,
        brands,
        priceRange: priceRange[0] || { min: 0, max: 1000 }
      }
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting filter options',
      error: error.message
    });
  }
};
