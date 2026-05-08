// backend/src/config/db.js
import mongoose from "mongoose";


let isConnected = false;

const redactMongoUri = (uri = '') => {
  // Hide password while keeping host/db visible in logs.
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)/, '$1***$3');
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in environment variables');
  }

  mongoose.set('strictQuery', true);
  // Fail fast on disconnected DB instead of buffering model operations.
  mongoose.set('bufferCommands', false);

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    console.log(`MongoDB Connected: ${redactMongoUri(process.env.MONGO_URI)}`);
    isConnected = true;
  } catch (error) {
    const extraHint = error.message?.includes('IP that isn\'t whitelisted')
      ? ' Hint: Add your current public IP in MongoDB Atlas Network Access, or temporarily allow 0.0.0.0/0 for local dev.'
      : '';
    throw new Error(`MongoDB connection failed: ${error.message}.${extraHint}`);
  }
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
    isConnected = false;
  });

  mongoose.connection.on('reconnected', () => {
    console.info('MongoDB reconnected');
    isConnected = true;
  });
  
};

export default connectDB;
