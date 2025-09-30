// backend/src/config/db.js
import mongoose from "mongoose";


let isConnected = false;
const connectDB = async () => {
  
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${process.env.MONGO_URI}`);
    isConnected = true;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
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
