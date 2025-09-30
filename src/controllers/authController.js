import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const setAuthCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 
  });
};

export const signup = async (req, res) => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;
    
    // Check if user with email or phone already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        { phoneNumber }
      ]
    });
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'Email is already registered' });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ message: 'Phone number is already registered' });
      }
    }

    const user = await User.create({
      email,
      password,
      phoneNumber,
      fullName
    });

    if (user) {
      const token = generateToken(user._id);
      setAuthCookie(res, token);
      res.status(201).json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        token,
      });
    console.log('✅ New User Signup:', {
      userId: user._id,
      name: user.fullName,
      email: user.email,
      phone: user.phoneNumber,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });
    }
  } catch (error) {
    console.log("Error creating user");
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {

    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = generateToken(user._id);
    console.log('🔑 User Login:', {
      userId: user._id,
      email: user.email,
      name: user.fullName,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });
    setAuthCookie(res, token);
    res.status(200).json({
      success: true,
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      token,
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      console.log("✅ User profile fetched successfully", {
        timestamp: new Date().toISOString(),
        userId: user._id,
        name: user.fullName,
        email: user.email,
        phone: user.phoneNumber,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress
      });
      res.json(user);
    } else {
      console.log("❌ User not found", {
        timestamp: new Date().toISOString(),
        userId: req.user._id,
        name: req.user.fullName,
        email: req.user.email,
        phone: req.user.phoneNumber,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress
      });
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.log("❌ Error fetching user profile", {
      timestamp: new Date().toISOString(),
      userId: req.user._id,
      name: req.user.fullName,
      email: req.user.email,
      phone: req.user.phoneNumber,
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error during logout' });
  }
};
