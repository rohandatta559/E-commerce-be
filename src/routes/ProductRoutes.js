// backend/ProductRoutes.js
import express from "express";
import { getProducts, getProductById, createProduct, createProductsBulk, deleteProduct, updateProduct } from "../controllers/ProductController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", protect, createProduct);
router.post("/bulk", protect, createProductsBulk);
router.delete("/", protect, deleteProduct);
router.put("/", protect, updateProduct);

export default router;
