// backend/ProductRoutes.js
import express from "express";
import { getProducts, createProduct, deleteProduct, updateProduct } from "../controllers/ProductController.js";
import { protect } from "../middleware/authMiddleware.js";
import { admin } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/", getProducts);
router.post("/", protect, admin, createProduct);
router.delete("/", protect, admin, deleteProduct);
router.put("/", protect, admin, updateProduct);

export default router;
