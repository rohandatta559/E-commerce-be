import express from 'express';
import { 
  signup, 
  login, 
  getProfile, 
  updateProfile,
  logout 
} from '../controllers/authController.js';
import { 
  sendVerificationOTP, 
  verifyPhoneNumber, 
  resendVerificationOTP,
  checkVerificationStatus
} from '../controllers/phoneVerificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);

// Phone Verification Routes
router.post('/send-otp', sendVerificationOTP);
router.post('/verify-otp', verifyPhoneNumber);
router.post('/resend-otp', resendVerificationOTP);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/me', protect, getProfile);
router.get('/check-verification', protect, checkVerificationStatus);

export default router;
