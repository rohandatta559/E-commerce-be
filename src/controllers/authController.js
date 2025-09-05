import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

export const signup = async (req, res) => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;
    
    // Check if user with email or phone already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        { phoneNumber }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'Email is already registered' });
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return res.status(400).json({ message: 'Phone number is already registered' });
      }
    }

    const user = await User.create({
      email,
      password,
      phoneNumber,
      fullName
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        token: generateToken(user._id),
      });
    }
  } catch (error) {
    console.log("Error creating user");
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        token: generateToken(user._id),
      });
    } else {
      console.log("Invalid email or password");
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.log("Error logging in user");
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      console.log("User profile fetched successfully");
      res.json(user);
    } else {
      console.log("User not found");
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.log("Error fetching user profile");
    res.status(500).json({ message: error.message });
  }
};
