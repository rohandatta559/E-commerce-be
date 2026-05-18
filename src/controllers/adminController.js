import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const normalizeVariants = (variants = []) => {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant) => ({
      _id: variant?._id && mongoose.Types.ObjectId.isValid(String(variant._id))
        ? new mongoose.Types.ObjectId(String(variant._id))
        : new mongoose.Types.ObjectId(),
      label: variant?.label?.toString().trim() || '',
      sku: variant?.sku?.toString().trim() || '',
      size: variant?.size?.toString().trim() || '',
      color: variant?.color?.toString().trim() || '',
      price: Number.isNaN(Number(variant?.price)) ? undefined : Number(variant.price),
      stock: Number.isNaN(Number(variant?.stock)) ? 0 : Number(variant.stock),
      image: variant?.image?.toString().trim() || '',
    }))
    .filter((variant) => variant.label || variant.sku || variant.size || variant.color);
};

// Sales Analytics
export const getSalesAnalytics = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Total sales
    const totalSales = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'packed', 'shipped', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);

    // Monthly sales
    const monthlySales = await Order.aggregate([
      { 
        $match: { 
          status: { $in: ['paid', 'packed', 'shipped', 'delivered'] },
          createdAt: { $gte: startOfMonth }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);

    // Top selling products
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: '$product.name',
          totalSold: 1,
          totalRevenue: 1,
          image: '$product.image'
        }
      }
    ]);

    res.json({
      totalSales: totalSales[0]?.total || 0,
      monthlySales: monthlySales[0]?.total || 0,
      topProducts
    });
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({ message: 'Error fetching sales analytics' });
  }
};

// User Management
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// Product Management
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Product.countDocuments();
    
    res.json({
      products,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Error fetching products' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description = '',
      category = '',
      brand = '',
      price = 0,
      stock = 0,
      image = '',
      images = [],
      video = '',
      attributes = [],
      variants = [],
      isActive = true,
    } = req.body;

    if (!name || Number.isNaN(Number(price))) {
      return res.status(400).json({ message: 'name and valid price are required' });
    }

    const normalizedImages = Array.isArray(images)
      ? images.map((img) => String(img).trim()).filter(Boolean)
      : [];
    const normalizedAttributes = Array.isArray(attributes) ? attributes : [];
    const normalizedVariants = normalizeVariants(variants);

    const product = await Product.create({
      name: String(name).trim(),
      description,
      category,
      brand,
      price: Number(price),
      stock: Number(stock) || 0,
      image: image || normalizedImages[0] || '',
      images: normalizedImages,
      video: video ? String(video).trim() : '',
      attributes: normalizedAttributes,
      variants: normalizedVariants,
      isActive: Boolean(isActive),
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    return res.status(500).json({ message: 'Error creating product' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      name,
      description,
      category,
      brand,
      price,
      stock,
      image,
      images,
      video,
      attributes,
      variants,
      isActive,
    } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (name !== undefined) product.name = String(name).trim();
    if (description !== undefined) product.description = description;
    if (category !== undefined) product.category = category;
    if (brand !== undefined) product.brand = brand;
    if (price !== undefined && !Number.isNaN(Number(price))) product.price = Number(price);
    if (stock !== undefined && !Number.isNaN(Number(stock))) product.stock = Number(stock);
    if (image !== undefined) product.image = image;
    if (Array.isArray(images)) product.images = images.map((img) => String(img).trim()).filter(Boolean);
    if (video !== undefined) product.video = video ? String(video).trim() : '';
    if (Array.isArray(attributes)) product.attributes = attributes;
    if (Array.isArray(variants)) product.variants = normalizeVariants(variants);
    if (isActive !== undefined) product.isActive = Boolean(isActive);

    await product.save();
    return res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    return res.status(500).json({ message: 'Error updating product' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const deleted = await Product.findByIdAndDelete(productId);
    if (!deleted) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({ message: 'Error deleting product' });
  }
};

// Order Management
export const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    const orders = await Order.find(query)
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Order.countDocuments(query);
    
    res.json({
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const valid = ['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const updateData = { status };
    if (['paid', 'packed', 'shipped', 'delivered'].includes(status)) {
      updateData.isPaid = true;
      updateData.paidAt = new Date();
    }
    if (status === 'delivered') {
      updateData.isDelivered = true;
      updateData.deliveredAt = new Date();
    }

    const order = await Order.findByIdAndUpdate(orderId, updateData, { new: true });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Error updating order status' });
  }
};
