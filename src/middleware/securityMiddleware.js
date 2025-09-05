import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import { body, validationResult } from 'express-validator';

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Security headers
const securityHeaders = [
  helmet(),
  helmet.xssFilter(),
  helmet.frameguard({ action: 'deny' }),
  helmet.noSniff(),
  helmet.hidePoweredBy(),
  helmet.referrerPolicy({ policy: 'same-origin' }),
  helmet.permittedCrossDomainPolicies()
];

// Data sanitization
const sanitizeData = [
  // Sanitize request data
  mongoSanitize(),
  xss(),
  
  // Prevent parameter pollution
  hpp({
    whitelist: [
      'price',
      'ratingsAverage',
      'ratingsQuantity',
      'category',
      'brand'
    ]
  })
];

// Input validation middleware
export const validateInput = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      success: false,
      errors: errors.array()
    });
  };
};

// Common validation rules
export const validationRules = {
  signup: [
    body('firstName')
      .trim()
      .notEmpty().withMessage('First name is required')
      .isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
      
    body('lastName')
      .trim()
      .notEmpty().withMessage('Last name is required')
      .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
      
    body('email')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
      
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[0-9]/).withMessage('Password must contain a number')
      .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter'),
      
    body('phoneNumber')
      .matches(/^\+?[1-9]\d{9,14}$/).withMessage('Please enter a valid phone number')
  ],
  
  login: [
    body('email')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
      
    body('password')
      .notEmpty().withMessage('Password is required')
  ],
  
  product: [
    body('name')
      .trim()
      .notEmpty().withMessage('Product name is required'),
      
    body('price')
      .isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
      
    body('description')
      .optional()
      .trim(),
      
    body('category')
      .optional()
      .trim(),
      
    body('stock')
      .optional()
      .isInt({ min: 0 }).withMessage('Stock cannot be negative'),
      
    body('brand')
      .optional()
      .trim()
  ]
};

export const securityMiddleware = [
  // Apply rate limiting to all requests
  limiter,
  
  // Set security headers
  ...securityHeaders,
  
  // Data sanitization against NoSQL query injection
  ...sanitizeData
];

// CSRF protection
export const csrfProtection = (req, res, next) => {
  // Skip CSRF for API routes or specific paths
  if (req.path.startsWith('/api/') || 
      req.path === '/health' || 
      req.method === 'GET' || 
      req.method === 'HEAD' || 
      req.method === 'OPTIONS') {
    return next();
  }
  
  // Get CSRF token from header, body, or query
  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
  
  // Verify the token exists and matches the session
  if (!csrfToken || !req.session || csrfToken !== req.session.csrfToken) {
    console.error('CSRF token validation failed:', {
      providedToken: csrfToken,
      sessionToken: req.session?.csrfToken,
      url: req.originalUrl,
      method: req.method
    });
    
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
      error: 'CSRF token validation failed'
    });
  }
  
  next();
};
