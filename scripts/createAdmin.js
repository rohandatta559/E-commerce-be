import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../src/models/User.js";

dotenv.config();

const [emailArg, passwordArg, phoneArg, nameArg] = process.argv.slice(2);

const email = (emailArg || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = (passwordArg || process.env.ADMIN_PASSWORD || "").trim();
const phoneNumber = (phoneArg || process.env.ADMIN_PHONE || "").trim();
const fullName = (nameArg || process.env.ADMIN_NAME || "Admin User").trim();

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is required in environment variables.");
  process.exit(1);
}

if (!email || !password || !phoneNumber) {
  console.error("Usage: npm run create-admin -- <email> <password> <phoneNumber> [fullName]");
  console.error("Or set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE, ADMIN_NAME in .env");
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    let user = await User.findOne({ $or: [{ email }, { phoneNumber }] });

    if (!user) {
      user = await User.create({
        email,
        password,
        phoneNumber,
        fullName,
        role: "admin",
        isPhoneVerified: true,
      });
      console.log(`Admin created: ${user.email} (${user._id})`);
    } else {
      const changed = [];
      if (user.role !== "admin") {
        user.role = "admin";
        changed.push("role");
      }
      if (!user.isPhoneVerified) {
        user.isPhoneVerified = true;
        changed.push("isPhoneVerified");
      }
      if (user.email !== email) {
        user.email = email;
        changed.push("email");
      }
      if (user.phoneNumber !== phoneNumber) {
        user.phoneNumber = phoneNumber;
        changed.push("phoneNumber");
      }
      if (password) {
        user.password = password;
        changed.push("password");
      }
      if (fullName && user.fullName !== fullName) {
        user.fullName = fullName;
        changed.push("fullName");
      }
      await user.save();
      console.log(
        changed.length
          ? `Admin user updated (${changed.join(", ")}): ${user.email} (${user._id})`
          : `Admin already up to date: ${user.email} (${user._id})`
      );
    }
  } catch (error) {
    if (error?.code === 11000) {
      console.error("Duplicate key error while creating/updating admin. Check email/phone uniqueness.");
    } else {
      console.error("Failed to create/update admin:", error.message);
    }
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
