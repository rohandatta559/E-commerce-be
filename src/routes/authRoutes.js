import express from 'express';
import { 
  signup, 
  login, 
  loginWithGoogle,
  requestOtpLogin,
  verifyOtpLogin,
  refreshSession,
  getProfile, 
  updateProfile,
  logout,
  changePassword,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getProfiles,
  addProfile,
  updateProfileEntry,
  deleteProfileEntry
} from '../controllers/authController.js';
import { 
  sendVerificationOTP, 
  verifyPhoneNumber, 
  resendVerificationOTP,
  checkVerificationStatus
} from '../controllers/phoneVerificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authLimiter, otpLimiter } from '../middleware/securityMiddleware.js';

const router = express.Router();

// Public routes
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/login/google', authLimiter, loginWithGoogle);
router.post('/login/otp/request', otpLimiter, requestOtpLogin);
router.post('/login/otp/verify', authLimiter, verifyOtpLogin);
router.post('/refresh', authLimiter, refreshSession);

// Phone Verification Routes
router.post('/send-otp', otpLimiter, sendVerificationOTP);
router.post('/verify-otp', verifyPhoneNumber);
router.post('/resend-otp', otpLimiter, resendVerificationOTP);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getProfile);
router.get('/check-verification', protect, checkVerificationStatus);
router.get('/addresses', protect, getAddresses);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:addressId', protect, updateAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);
router.get('/profiles', protect, getProfiles);
router.post('/profiles', protect, addProfile);
router.put('/profiles/:profileId', protect, updateProfileEntry);
router.delete('/profiles/:profileId', protect, deleteProfileEntry);

export default router;
