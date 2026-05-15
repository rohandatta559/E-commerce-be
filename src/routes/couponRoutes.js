import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { validateCoupon } from "../controllers/couponController.js";

const router = express.Router();

router.post("/validate", protect, validateCoupon);

export default router;
