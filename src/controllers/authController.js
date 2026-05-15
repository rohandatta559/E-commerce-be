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
        return res.status(400).json({ 
          success: false,
          message: 'Email is already registered' 
        });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ 
          success: false,
          message: 'Phone number is already registered' 
        });
      }
    }

    // Create user with phone verification required
    const user = await User.create({
      email,
      password,
      phoneNumber,
      fullName,
      isPhoneVerified: false // Will be set to true after verification
    });

    // Send verification OTP
    try {
      const { sendOTP } = await import('../services/smsService.js');
      await sendOTP(phoneNumber);
    } catch (error) {
      console.error('Failed to send verification OTP:', error);
      // Don't fail the signup if OTP sending fails
    }
    
    // Generate token (but don't set cookie yet - require verification first)
    const token = generateToken(user._id);
    
    // Log successful signup
    console.log('✅ New User Signup (Pending Verification):', {
      userId: user._id,
      name: user.fullName,
      email: user.email,
      phone: user.phoneNumber,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your phone number.',
      requiresVerification: true,
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isPhoneVerified: false,
      token // Send token but frontend should require verification
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during signup',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email and password' 
      });
    }

    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Generate token (don't set it in cookie yet, as we need phone verification)
    const token = generateToken(user._id);
      
    // Log successful login
    console.log('🔑 User Login:', {
      userId: user._id,
      name: user.fullName,
      email: user.email,
      phone: user.phoneNumber,
      isPhoneVerified: user.isPhoneVerified,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });

    // Check if phone is verified
    if (!user.isPhoneVerified) {
      // Send verification OTP if not verified
      try {
        const { sendOTP } = await import('../services/smsService.js');
        await sendOTP(user.phoneNumber);
      } catch (error) {
        console.error('Failed to send verification OTP:', error);
      }
      
      return res.status(200).json({
        success: true,
        requiresVerification: true,
        message: 'Please verify your phone number',
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isPhoneVerified: false,
        token
      });
    }

    // If phone is verified, set auth cookie and return user data
    setAuthCookie(res, token);
    
    res.status(200).json({
      success: true,
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isPhoneVerified: true,
      token
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
      console.log('✅ User profile fetched successfully', {
        timestamp: new Date().toISOString(),
        userId: user._id,
        name: user.fullName,
        email: user.email,
        phone: user.phoneNumber,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress
      });
      return res.json(user);
    } else {
      console.log('❌ User not found', {
        timestamp: new Date().toISOString(),
        userId: req.user._id,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress
      });
      return res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('❌ Error fetching user profile', {
      timestamp: new Date().toISOString(),
      userId: req.user?._id,
      error: error.message,
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress
    });
    return res.status(500).json({ 
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phoneNumber } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (email && email !== user.email) {
      const existingEmailUser = await User.findOne({ email });
      if (existingEmailUser) {
        return res.status(400).json({ success: false, message: 'Email is already in use' });
      }
      user.email = email;
    }

    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhoneUser = await User.findOne({ phoneNumber });
      if (existingPhoneUser) {
        return res.status(400).json({ success: false, message: 'Phone number is already in use' });
      }
      user.phoneNumber = phoneNumber;
      user.isPhoneVerified = false;
    }

    if (fullName !== undefined) {
      user.fullName = fullName;
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        isPhoneVerified: updatedUser.isPhoneVerified,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.status(200).json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during logout',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

export const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');
    return res.json({ success: true, addresses: user?.addresses || [] });
  } catch (error) {
    console.error('Get addresses error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
};

export const addAddress = async (req, res) => {
  try {
    const { label, fullName, phoneNumber, line1, line2, city, state, postalCode, country, isDefault } = req.body;
    if (!fullName || !phoneNumber || !line1 || !city || !state || !postalCode) {
      return res.status(400).json({ success: false, message: 'Missing required address fields' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (isDefault) {
      user.addresses = user.addresses.map((address) => ({ ...address.toObject(), isDefault: false }));
    }

    user.addresses.push({
      label,
      fullName,
      phoneNumber,
      line1,
      line2,
      city,
      state,
      postalCode,
      country: country || 'India',
      isDefault: Boolean(isDefault),
    });

    if (user.addresses.length === 1) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.status(201).json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error('Add address error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add address' });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = user.addresses.id(addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    Object.assign(address, req.body);
    if (req.body.isDefault) {
      user.addresses.forEach((item) => {
        item.isDefault = item._id.toString() === addressId;
      });
    }

    await user.save();
    return res.json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error('Update address error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update address' });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = user.addresses.id(addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    const wasDefault = address.isDefault;
    user.addresses.pull(addressId);
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error('Delete address error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
};
