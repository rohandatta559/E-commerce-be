import Product from "../models/Product.js";

export const getProducts = async (req, res) => {
  try {
    console.log('Fetching all products...');
    const products = await Product.find();
    console.log(`Found ${products.length} products`);
    res.json(products);
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
  const { name, price, description, category, stock } = req.body;
  try {
    console.log('Creating new product:', { name, price, description, category, stock });
    const product = new Product({ name, price, description, category, stock });
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
  const { name, price, description, category, stock } = req.body;
  try {
    console.log('Updating product:', { name, price, description, category, stock });
    const product = await Product.findOneAndUpdate({ name }, { name, price, description, category, stock });
    console.log('Product updated successfully:', product);
    res.status(201).json(product);
  } catch (err) {
    console.error('Error updating product:', err.message);
    res.status(400).json({ message: err.message });
  }
}
