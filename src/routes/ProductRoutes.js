// backend/ProductRoutes.js
import express from "express";
import { getProducts, createProduct, deleteProduct, updateProduct } from "../controllers/ProductController.js";

const router = express.Router();

router.get("/", getProducts);
router.post("/", createProduct);
router.delete("/", deleteProduct);
router.put("/", updateProduct);

export default router;
