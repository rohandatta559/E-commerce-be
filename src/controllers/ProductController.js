import Product from "../models/Product.js";
import Order from "../models/Order.js";

const normalizeVariants = (variants = []) => {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant) => ({
      label: variant?.label?.toString().trim() || "",
      sku: variant?.sku?.toString().trim() || "",
      size: variant?.size?.toString().trim() || "",
      color: variant?.color?.toString().trim() || "",
      price: Number.isNaN(Number(variant?.price)) ? undefined : Number(variant.price),
      stock: Number.isNaN(Number(variant?.stock)) ? 0 : Number(variant.stock),
      image: variant?.image?.toString().trim() || "",
    }))
    .filter((variant) => variant.label || variant.sku || variant.size || variant.color);
};

export const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 12));
    const query = {};

    if (req.query.category) query.category = req.query.category;
    if (req.query.brand) query.brand = req.query.brand;
    if (req.query.inStock === "true") {
      query.$or = [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }];
    }

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(query),
    ]);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + products.length < total,
      },
    });
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ message: err.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.json(product);
  } catch (err) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
};

export const createProduct = async (req, res) => {
  const { name, price, description, category, stock, brand, image, attributes, variants } = req.body;
  try {
    const normalizedVariants = normalizeVariants(variants);
    console.log('Creating new product:', { name, price, description, category, stock, variantCount: normalizedVariants.length });
    const product = new Product({
      name,
      price,
      description,
      category,
      stock,
      brand,
      image,
      attributes: Array.isArray(attributes) ? attributes : [],
      variants: normalizedVariants
    });
    const savedProduct = await product.save();
    console.log('Product created successfully:', savedProduct);
    res.status(201).json(savedProduct);
  } catch (err) {
    console.error('Error creating product:', err.message);
    res.status(400).json({ message: err.message });
  }
};

export const createProductsBulk = async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        message: "Request body must include a non-empty 'products' array",
      });
    }

    const normalizedProducts = [];
    const validationErrors = [];

    products.forEach((item, index) => {
      const name = item?.name?.toString().trim();
      const price = Number(item?.price);

      if (!name || Number.isNaN(price)) {
        validationErrors.push({
          index,
          message: "Each product requires valid 'name' and 'price'",
          product: item,
        });
        return;
      }

      normalizedProducts.push({
        name,
        price,
        description: item.description || "",
        category: item.category || "",
        brand: item.brand || "",
        stock: Number.isNaN(Number(item.stock)) ? 0 : Number(item.stock),
        image: item.image || "",
        rating: Number.isNaN(Number(item.rating)) ? 0 : Number(item.rating),
        numReviews: Number.isNaN(Number(item.numReviews)) ? 0 : Number(item.numReviews),
        isActive: item.isActive !== false,
        attributes: Array.isArray(item.attributes) ? item.attributes : [],
        variants: normalizeVariants(item.variants),
      });
    });

    if (normalizedProducts.length === 0) {
      return res.status(400).json({
        message: "No valid products to insert",
        errors: validationErrors,
      });
    }

    const createdProducts = await Product.insertMany(normalizedProducts, { ordered: false });

    return res.status(201).json({
      message: "Bulk product insert completed",
      requestedCount: products.length,
      insertedCount: createdProducts.length,
      failedCount: validationErrors.length,
      createdProducts,
      errors: validationErrors,
    });
  } catch (err) {
    console.error("Error creating products in bulk:", err.message);
    return res.status(500).json({
      message: "Bulk product insert failed",
      error: err.message,
    });
  }
};

export const deleteProduct = async (req, res) => {
  const { name } = req.body;
  try {
    console.log('Deleting product:', { name });
    const product = await Product.findOneAndDelete({ name });
    console.log('Product deleted successfully:', product);
    res.status(201).json(product);
  } catch (err) {
    console.error('Error deleting product:', err.message);
    res.status(400).json({ message: err.message });
  }
};

export const updateProduct =async(req,res)=>{
  const { name, price, description, category, stock, brand, image, attributes, variants } = req.body;
  try {
    const normalizedVariants = normalizeVariants(variants);
    console.log('Updating product:', { name, price, description, category, stock, variantCount: normalizedVariants.length });
    const product = await Product.findOneAndUpdate(
      { name },
      {
        name,
        price,
        description,
        category,
        stock,
        brand,
        image,
        attributes: Array.isArray(attributes) ? attributes : [],
        variants: normalizedVariants
      },
      { new: true }
    );
    console.log('Product updated successfully:', product);
    res.status(201).json(product);
  } catch (err) {
    console.error('Error updating product:', err.message);
    res.status(400).json({ message: err.message });
  }
}

export const addProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    if (!rating || !comment) {
      return res.status(400).json({ message: "rating and comment are required" });
    }

    const [product, hasPurchased] = await Promise.all([
      Product.findById(productId),
      Order.exists({
        user: req.user._id,
        status: { $in: ["paid", "packed", "shipped", "delivered"] },
        "items.product": productId,
      }),
    ]);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!hasPurchased) {
      return res.status(403).json({ message: "Only verified buyers can review this product" });
    }

    const alreadyReviewed = product.reviews.find(
      (review) => review.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }

    product.reviews.push({
      user: req.user._id,
      name: req.user.fullName || req.user.email,
      rating: Number(rating),
      comment: String(comment).trim(),
    });

    product.numReviews = product.reviews.length;
    product.rating =
      product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.numReviews;

    await product.save();

    return res.status(201).json({
      message: "Review added",
      reviews: product.reviews,
      rating: product.rating,
      numReviews: product.numReviews,
    });
  } catch (error) {
    console.error("Error adding product review:", error);
    return res.status(500).json({ message: "Failed to add review" });
  }
};
