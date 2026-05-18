import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { admin } from "../middleware/adminMiddleware.js";
import { createCoupon, validateCoupon } from "../controllers/couponController.js";

const router = express.Router();

router.post("/validate", protect, validateCoupon);
router.post("/", protect, admin, createCoupon);

export default router;
