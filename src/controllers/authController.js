import crypto from "crypto";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { sendOTP, verifyOTP } from "../services/smsService.js";

dotenv.config();

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_DAYS || 30);

const ensureProvider = (user, provider) => {
  user.authProviders = Array.isArray(user.authProviders) ? user.authProviders : [];
  if (!user.authProviders.includes(provider)) user.authProviders.push(provider);
};

const signAccessToken = (userId) =>
  jwt.sign({ id: userId, tokenType: "access" }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

const signRefreshToken = (userId, jti) =>
  jwt.sign({ id: userId, tokenType: "refresh", jti }, process.env.JWT_SECRET, { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` });

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  const isProd = process.env.NODE_ENV === "production";
  const cookieBase = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  };

  res.cookie("token", accessToken, {
    ...cookieBase,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieBase,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res) => {
  const isProd = process.env.NODE_ENV === "production";
  const cookieBase = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  };
  res.clearCookie("token", cookieBase);
  res.clearCookie("refreshToken", cookieBase);
};

const issueSessionTokens = async (user, req, res) => {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id, jti);
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  user.refreshTokens = Array.isArray(user.refreshTokens) ? user.refreshTokens : [];
  user.refreshTokens = user.refreshTokens
    .filter((entry) => entry.expiresAt && new Date(entry.expiresAt) > new Date())
    .slice(-4);
  user.refreshTokens.push({
    tokenHash: refreshTokenHash,
    expiresAt,
    userAgent: req.headers["user-agent"] || "unknown",
    ip: req.ip || req.connection?.remoteAddress || "unknown",
  });
  await user.save();

  setAuthCookies(res, { accessToken, refreshToken });
  return { accessToken, refreshToken };
};

const getSafeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  role: user.role,
  isPhoneVerified: user.isPhoneVerified,
});

export const signup = async (req, res) => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      if (existingUser.email === email) return res.status(400).json({ success: false, message: "Email is already registered" });
      if (existingUser.phoneNumber === phoneNumber) return res.status(400).json({ success: false, message: "Phone number is already registered" });
    }

    const user = await User.create({
      email,
      password,
      phoneNumber,
      fullName,
      isPhoneVerified: false,
      authProviders: ["password"],
      profiles: [{ label: "Personal", fullName, email, phoneNumber, isDefault: true }],
    });

    try {
      await sendOTP(phoneNumber);
    } catch (error) {
      console.error("Failed to send verification OTP:", error);
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your phone number.",
      requiresVerification: true,
      ...getSafeUser(user),
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ success: false, message: "Server error during signup" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Please provide email and password" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ success: false, message: "Invalid email or password" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid email or password" });

    if (!user.isPhoneVerified) {
      try {
        await sendOTP(user.phoneNumber);
      } catch (error) {
        console.error("Failed to send verification OTP:", error);
      }
      return res.status(200).json({ success: true, requiresVerification: true, message: "Please verify your phone number", ...getSafeUser(user) });
    }

    ensureProvider(user, "password");
    const { accessToken } = await issueSessionTokens(user, req, res);

    return res.status(200).json({ success: true, token: accessToken, ...getSafeUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
};

export const loginWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, message: "idToken is required" });

    const googleResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const googleData = await googleResp.json();
    if (!googleResp.ok || !googleData?.sub || !googleData?.email) {
      return res.status(401).json({ success: false, message: "Invalid Google token" });
    }

    if (process.env.GOOGLE_CLIENT_ID && googleData.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ success: false, message: "Google token audience mismatch" });
    }

    let user = await User.findOne({ $or: [{ googleId: googleData.sub }, { email: googleData.email.toLowerCase() }] });
    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString("hex");
      user = await User.create({
        fullName: googleData.name || "Google User",
        email: googleData.email.toLowerCase(),
        password: randomPassword,
        phoneNumber: `+1000${Date.now().toString().slice(-10)}`,
        isPhoneVerified: true,
        googleId: googleData.sub,
        authProviders: ["google"],
        profiles: [{ label: "Personal", fullName: googleData.name || "Google User", email: googleData.email.toLowerCase(), isDefault: true }],
      });
    } else {
      user.googleId = user.googleId || googleData.sub;
      ensureProvider(user, "google");
      user.isPhoneVerified = Boolean(user.isPhoneVerified);
      await user.save();
    }

    const { accessToken } = await issueSessionTokens(user, req, res);
    return res.status(200).json({ success: true, token: accessToken, ...getSafeUser(user) });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({ success: false, message: "Google login failed" });
  }
};

export const requestOtpLogin = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone number is required" });

    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ success: false, message: "No user found with this phone number" });

    await sendOTP(phoneNumber);
    return res.json({ success: true, message: "OTP sent for login" });
  } catch (error) {
    console.error("requestOtpLogin error:", error);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

export const verifyOtpLogin = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) return res.status(400).json({ success: false, message: "phoneNumber and code are required" });

    const result = await verifyOTP(phoneNumber, code);
    if (!result.success) return res.status(400).json(result);

    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    ensureProvider(user, "otp");
    const { accessToken } = await issueSessionTokens(user, req, res);
    return res.json({ success: true, token: accessToken, ...getSafeUser(user) });
  } catch (error) {
    console.error("verifyOtpLogin error:", error);
    return res.status(500).json({ success: false, message: "OTP login failed" });
  }
};

export const refreshSession = async (req, res) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!incomingToken) return res.status(401).json({ success: false, message: "Refresh token missing" });

    const decoded = jwt.verify(incomingToken, process.env.JWT_SECRET);
    if (decoded.tokenType !== "refresh") return res.status(401).json({ success: false, message: "Invalid refresh token" });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    const incomingHash = hashToken(incomingToken);
    const exists = (user.refreshTokens || []).find((entry) => entry.tokenHash === incomingHash);
    if (!exists) return res.status(401).json({ success: false, message: "Refresh token revoked" });

    user.refreshTokens = (user.refreshTokens || []).filter((entry) => entry.tokenHash !== incomingHash);
    const { accessToken } = await issueSessionTokens(user, req, res);

    return res.json({ success: true, token: accessToken, ...getSafeUser(user) });
  } catch (error) {
    console.error("refreshSession error:", error);
    return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    console.error("Error fetching user profile", error);
    return res.status(500).json({ message: "Error fetching profile" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phoneNumber } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (email && email !== user.email) {
      const existingEmailUser = await User.findOne({ email });
      if (existingEmailUser) return res.status(400).json({ success: false, message: "Email is already in use" });
      user.email = email;
    }

    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhoneUser = await User.findOne({ phoneNumber });
      if (existingPhoneUser) return res.status(400).json({ success: false, message: "Phone number is already in use" });
      user.phoneNumber = phoneNumber;
      user.isPhoneVerified = false;
    }

    if (fullName !== undefined) user.fullName = fullName;

    const updatedUser = await user.save();
    return res.status(200).json({ success: true, message: "Profile updated successfully", user: getSafeUser(updatedUser) });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

export const logout = async (req, res) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (incomingToken) {
      const incomingHash = hashToken(incomingToken);
      await User.updateOne({ _id: req.user?._id }, { $pull: { refreshTokens: { tokenHash: incomingHash } } }).catch(() => {});
    }
    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, message: "Server error during logout" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: "Current and new password are required" });

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });

    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();
    clearAuthCookies(res);

    return res.status(200).json({ success: true, message: "Password updated successfully. Please login again." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

export const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("addresses");
    return res.json({ success: true, addresses: user?.addresses || [] });
  } catch (error) {
    console.error("Get addresses error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch addresses" });
  }
};

export const addAddress = async (req, res) => {
  try {
    const { label, fullName, phoneNumber, line1, line2, city, state, postalCode, country, isDefault, profileId } = req.body;
    if (!fullName || !phoneNumber || !line1 || !city || !state || !postalCode) {
      return res.status(400).json({ success: false, message: "Missing required address fields" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (isDefault) {
      user.addresses = user.addresses.map((address) => ({ ...address.toObject(), isDefault: false }));
    }

    user.addresses.push({
      label,
      fullName,
      phoneNumber,
      line1,
      line2,
      city,
      state,
      postalCode,
      country: country || "India",
      isDefault: Boolean(isDefault),
      profileId,
    });

    if (user.addresses.length === 1) user.addresses[0].isDefault = true;

    await user.save();
    return res.status(201).json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error("Add address error:", error);
    return res.status(500).json({ success: false, message: "Failed to add address" });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const address = user.addresses.id(addressId);
    if (!address) return res.status(404).json({ success: false, message: "Address not found" });

    Object.assign(address, req.body);
    if (req.body.isDefault) {
      user.addresses.forEach((item) => {
        item.isDefault = item._id.toString() === addressId;
      });
    }

    await user.save();
    return res.json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error("Update address error:", error);
    return res.status(500).json({ success: false, message: "Failed to update address" });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const address = user.addresses.id(addressId);
    if (!address) return res.status(404).json({ success: false, message: "Address not found" });

    const wasDefault = address.isDefault;
    user.addresses.pull(addressId);
    if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;

    await user.save();
    return res.json({ success: true, addresses: user.addresses });
  } catch (error) {
    console.error("Delete address error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete address" });
  }
};

export const getProfiles = async (req, res) => {
  const user = await User.findById(req.user._id).select("profiles");
  return res.json({ success: true, profiles: user?.profiles || [] });
};

export const addProfile = async (req, res) => {
  const { label, fullName, email, phoneNumber, isDefault } = req.body;
  if (!fullName) return res.status(400).json({ success: false, message: "fullName is required" });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  if (isDefault) {
    user.profiles = (user.profiles || []).map((profile) => ({ ...profile.toObject(), isDefault: false }));
  }

  user.profiles.push({ label, fullName, email, phoneNumber, isDefault: Boolean(isDefault) });
  if (user.profiles.length === 1) user.profiles[0].isDefault = true;

  await user.save();
  return res.status(201).json({ success: true, profiles: user.profiles });
};

export const updateProfileEntry = async (req, res) => {
  const { profileId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  const profile = user.profiles.id(profileId);
  if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

  Object.assign(profile, req.body);
  if (req.body.isDefault) {
    user.profiles.forEach((item) => {
      item.isDefault = item._id.toString() === profileId;
    });
  }

  await user.save();
  return res.json({ success: true, profiles: user.profiles });
};

export const deleteProfileEntry = async (req, res) => {
  const { profileId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  const profile = user.profiles.id(profileId);
  if (!profile) return res.status(404).json({ success: false, message: "Profile not found" });

  const wasDefault = profile.isDefault;
  user.profiles.pull(profileId);
  if (wasDefault && user.profiles.length > 0) user.profiles[0].isDefault = true;

  await user.save();
  return res.json({ success: true, profiles: user.profiles });
};
