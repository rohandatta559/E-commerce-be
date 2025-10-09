// backend/ProductRoutes.js
import express from "express";
import { getProducts, createProduct, deleteProduct, updateProduct } from "../controllers/ProductController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getProducts);
router.post("/", protect, createProduct);
router.delete("/", protect, deleteProduct);
router.put("/", protect, updateProduct);

export default router;
