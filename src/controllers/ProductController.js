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
