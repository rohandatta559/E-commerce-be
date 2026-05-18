import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

const calculateDiscount = (coupon, subtotal) => {
  if (coupon.type === "percentage") {
    const raw = (subtotal * coupon.value) / 100;
    return coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
  }
  return coupon.value;
};

const hasUserUsedCoupon = (coupon, userId) =>
  Array.isArray(coupon.usedByUsers) &&
  coupon.usedByUsers.some((id) => String(id) === String(userId));

const isCouponAssignedToUser = (coupon, userId) => {
  if (!Array.isArray(coupon.assignedUsers) || coupon.assignedUsers.length === 0) return true;
  return coupon.assignedUsers.some((id) => String(id) === String(userId));
};

const isFirstOrderUser = async (userId) => {
  const existingOrder = await Order.exists({
    user: userId,
    status: { $in: ["placed", "paid", "packed", "shipped", "delivered"] },
  });
  return !existingOrder;
};

export const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }

    if (coupon.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Coupon has expired" });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }

    if (!isCouponAssignedToUser(coupon, req.user._id)) {
      return res.status(403).json({ success: false, message: "This coupon is not assigned to your account" });
    }

    if (coupon.onePerUser && hasUserUsedCoupon(coupon, req.user._id)) {
      return res.status(400).json({ success: false, message: "You have already used this coupon" });
    }

    if (coupon.isFirstOrderOnly) {
      const firstOrderEligible = await isFirstOrderUser(req.user._id);
      if (!firstOrderEligible) {
        return res.status(400).json({ success: false, message: "This coupon is valid only for first-time orders" });
      }
    }

    const orderSubtotal = Number(subtotal) || 0;
    if (orderSubtotal < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value is ${coupon.minOrderValue}`,
      });
    }

    const discountAmount = Number(calculateDiscount(coupon, orderSubtotal).toFixed(2));
    return res.json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        onePerUser: coupon.onePerUser,
        isFirstOrderOnly: coupon.isFirstOrderOnly,
        discountAmount,
      },
    });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(500).json({ success: false, message: "Failed to validate coupon" });
  }
};

export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minOrderValue = 0,
      maxDiscount,
      expiresAt,
      usageLimit,
      isActive = true,
      onePerUser = false,
      isFirstOrderOnly = false,
      assignedUsers = [],
    } = req.body;

    if (!code || !type || value === undefined || !expiresAt) {
      return res.status(400).json({ success: false, message: "code, type, value and expiresAt are required" });
    }

    if (!["percentage", "flat"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be percentage or flat" });
    }

    const parsedExpiresAt = new Date(expiresAt);
    if (Number.isNaN(parsedExpiresAt.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid expiresAt" });
    }

    if (parsedExpiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: "expiresAt must be in the future" });
    }

    const normalizedAssignedUsers = Array.isArray(assignedUsers)
      ? assignedUsers
          .map((id) => id?.toString().trim())
          .filter(Boolean)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type,
      value: Number(value),
      minOrderValue: Number(minOrderValue) || 0,
      maxDiscount: maxDiscount === undefined ? undefined : Number(maxDiscount),
      expiresAt: parsedExpiresAt,
      usageLimit: usageLimit === undefined ? undefined : Number(usageLimit),
      isActive: Boolean(isActive),
      onePerUser: Boolean(onePerUser),
      isFirstOrderOnly: Boolean(isFirstOrderOnly),
      assignedUsers: normalizedAssignedUsers,
      usedByUsers: [],
      usedCount: 0,
    });

    return res.status(201).json({ success: true, coupon });
  } catch (error) {
    console.error("Create coupon error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Coupon code already exists" });
    }
    return res.status(500).json({ success: false, message: "Failed to create coupon" });
  }
};
