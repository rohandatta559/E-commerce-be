import { sendOTP, verifyOTP, resendOTP } from '../services/smsService.js';
import User from '../models/User.js';

/**
 * @desc    Send OTP to user's phone number
 * @route   POST /api/auth/send-otp
 * @access  Public
 */
export const sendVerificationOTP = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const result = await sendOTP(phoneNumber);
    
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      // Only include OTP in development for testing
      ...(process.env.NODE_ENV === 'development' && { otp: result.otp })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyPhoneNumber = async (req, res, next) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP code are required'
      });
    }

    const result = await verifyOTP(phoneNumber, code);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
export const resendVerificationOTP = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const result = await resendOTP(phoneNumber);
    
    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
      // Only include OTP in development for testing
      ...(process.env.NODE_ENV === 'development' && { otp: result.otp })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if phone number is verified
 * @route   GET /api/auth/check-verification
 * @access  Private
 */
export const checkVerificationStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('isPhoneVerified phoneNumber');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      isPhoneVerified: user.isPhoneVerified,
      phoneNumber: user.phoneNumber
    });
  } catch (error) {
    next(error);
  }
};
