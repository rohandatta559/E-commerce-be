import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const productVariantSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    sku: { type: String, trim: true },
    size: { type: String, trim: true },
    color: { type: String, trim: true },
    price: {
      type: Number,
      min: 0
    },
    stock: {
      type: Number,
      default: 0,
      min: 0
    },
    image: { type: String }
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true,
      trim: true,
      index: 'text' 
    },
    description: { 
      type: String,
      index: 'text'
    },
    price: { 
      type: Number, 
      required: true,
      min: 0
    },
    category: { 
      type: String,
      index: true
    },
    brand: {
      type: String,
      index: true
    },
    stock: { 
      type: Number, 
      default: 0,
      min: 0
    },
    variants: [productVariantSchema],
    image: { 
      type: String 
    },
    images: [{ type: String }],
    video: { type: String },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    numReviews: {
      type: Number,
      default: 0
    },
    reviews: [reviewSchema],
    isActive: {
      type: Boolean,
      default: true
    },
    attributes: [
      {
        name: String,
        value: String
      }
    ],
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0
    },
    lastLowStockAlertAt: {
      type: Date
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

productSchema.virtual('availableStock').get(function availableStock() {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    return this.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  }
  return Number(this.stock || 0);
});

// Create text index for search
productSchema.index({ 
  name: 'text',
  description: 'text',
  category: 'text',
  brand: 'text'
});

// Static method for search functionality
productSchema.statics.search = async function(query, filters = {}) {
  const { 
    category, 
    brand, 
    minPrice, 
    maxPrice, 
    inStock,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = filters;

  const searchQuery = {};
  
  // Text search
  if (query) {
    searchQuery.$text = { $search: query };
  }

  // Category filter
  if (category) {
    searchQuery.category = category;
  }

  // Brand filter
  if (brand) {
    searchQuery.brand = brand;
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    searchQuery.price = {};
    if (minPrice !== undefined) searchQuery.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) searchQuery.price.$lte = Number(maxPrice);
  }

  // Stock filter
  if (inStock === 'true') {
    searchQuery.$or = [{ stock: { $gt: 0 } }, { 'variants.stock': { $gt: 0 } }];
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    this.find(searchQuery)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit)),
    this.countDocuments(searchQuery)
  ]);

  return {
    products,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1
  };
};

const Product = mongoose.model("Product", productSchema);
export default Product;
