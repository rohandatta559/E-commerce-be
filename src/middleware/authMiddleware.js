import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  const headerToken =
    req.headers.authorization && req.headers.authorization.startsWith('Bearer')
      ? req.headers.authorization.split(' ')[1]
      : null;
  const cookieToken = req.cookies?.token || null;
  const token = headerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.status(401).json({ message: 'Invalid access token type' });
    }
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Session expired. Please refresh token.' });
    return res.status(401).json({ message: 'Invalid token. Please log in again.' });
  }
};
