import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      let decoded;
      try {
        if (!process.env.JWT_SECRET) {
          console.error('JWT_SECRET is not set in environment variables');
          return res.status(500).json({ message: 'Server configuration error' });
        }
        
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from the token
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          console.log('User not found for token:', { id: decoded.id });
          return res.status(401).json({ message: 'User not found' });
        }
        
        req.user = user;
        next();
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError.message);
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ message: 'Session expired. Please log in again.' });
        } else if (jwtError.name === 'JsonWebTokenError') {
          return res.status(401).json({ 
            message: 'Invalid token. Please log in again.',
            error: jwtError.message 
          });
        }
        return res.status(401).json({ message: 'Not authorized, token verification failed' });
      }
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  // Fallback: Check HttpOnly cookie
  if (!token && req.cookies && req.cookies.token) {
    try {
      token = req.cookies.token;
      
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not set in environment variables');
        return res.status(500).json({ message: 'Server configuration error' });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        console.log('User not found for cookie token:', { id: decoded.id });
        return res.status(401).json({ message: 'User not found' });
      }
      
      req.user = user;
      return next();
    } catch (error) {
      console.error('Cookie token verification failed:', error.message);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ 
        message: 'Not authorized, please log in again',
        error: error.message 
      });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

