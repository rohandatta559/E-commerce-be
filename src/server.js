// backend/src/server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import { securityMiddleware, csrfProtection } from './middleware/securityMiddleware.js';

// Import routes
import productRoutes from './routes/ProductRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import searchRoutes from './routes/searchRoutes.js';

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Apply security middleware
app.use(securityMiddleware);

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// CSRF protection for non-API routes
app.use(csrfProtection);

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});
