import mongoose from "mongoose";
import bcrypt from "bcrypt";

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "Home" },
    fullName: { type: String, trim: true, required: true },
    phoneNumber: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    postalCode: { type: String, trim: true, required: true },
    country: { type: String, trim: true, default: "India" },
    isDefault: { type: Boolean, default: false },
    profileId: { type: mongoose.Schema.Types.ObjectId }
  },
  { _id: true }
);

const profileSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "Personal" },
    fullName: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true },
    phoneNumber: { type: String, trim: true },
    isDefault: { type: Boolean, default: false }
  },
  { _id: true }
);

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, trim: true },
    ip: { type: String, trim: true }
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    email: { 
      type: String, 
      required: [true, 'Email is required'], 
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: { 
      type: String, 
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long']
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [/^\+?[1-9]\d{9,14}$/, 'Please enter a valid phone number with country code']
    },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    phoneVerificationCode: String,
  wishlist: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
    phoneVerificationExpires: Date,
    fullName: { type: String },
    googleId: { type: String, trim: true, index: true },
    authProviders: [{ type: String, enum: ['password', 'google', 'otp'], default: 'password' }],
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    addresses: [addressSchema],
    profiles: [profileSchema],
    refreshTokens: [refreshTokenSchema]
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
