import { v4 as uuidv4 } from 'uuid';
import fast2sms from 'fast2sms';
import User from '../models/User.js';

// For development, we'll log OTPs to console
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Generate a 4-digit OTP
 * @returns {string} 4-digit OTP
 */
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Send OTP to the given phone number
 * @param {string} phoneNumber - Phone number with country code (e.g., '+919876543210')
 * @returns {Promise<Object>} Result of the operation
 */
export const sendOTP = async (phoneNumber) => {
  try {
    // Generate OTP and set expiration (10 minutes from now)
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP to user's document
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      {
        phoneVerificationCode: otp,
        phoneVerificationExpires: expiresAt,
        isPhoneVerified: false
      },
      { new: true, upsert: false }
    );

    if (!user) {
      throw new Error('User not found');
    }

    if (isProduction) {
      const apiKey = process.env.FAST2SMS_API_KEY;
      if (!apiKey) {
        throw new Error('FAST2SMS_API_KEY is missing in environment variables');
      }

      const options = {
        authorization: apiKey,
        message: `Your verification code is ${otp}. Valid for 5 minutes.`,
        numbers: [phoneNumber],
      };

      const response = await fast2sms.sendMessage(options);
      console.log(`[PRODUCTION] SMS sent to ${phoneNumber}`, response);
    } else {
      // In development, just log the OTP
      console.log(`[DEVELOPMENT] OTP for ${phoneNumber}: ${otp}`);
    }
    
    return {
      success: true,
      message: 'OTP sent successfully',
      // Include OTP in development for testing
      otp: !isProduction ? otp : undefined
    };
  } catch (error) {
    console.error('Error in sendOTP:', error);
    throw new Error('Failed to send OTP. Please try again.');
  }
};

/**
 * Verify OTP for the given phone number
 * @param {string} phoneNumber - Phone number with country code
 * @param {string} code - OTP to verify
 * @returns {Promise<Object>} Result of the verification
 */
export const verifyOTP = async (phoneNumber, code) => {
  try {
    const user = await User.findOne({
      phoneNumber,
      phoneVerificationCode: code,
      phoneVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired OTP'
      };
    }

    // Mark phone as verified and clear OTP data
    user.isPhoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpires = undefined;
    await user.save();

    return {
      success: true,
      message: 'Phone number verified successfully'
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw new Error('Failed to verify OTP. Please try again.');
  }
};

/**
 * Resend OTP to the given phone number
 * @param {string} phoneNumber - Phone number with country code
 * @returns {Promise<Object>} Result of the operation
 */
export const resendOTP = async (phoneNumber) => {
  return sendOTP(phoneNumber);
};