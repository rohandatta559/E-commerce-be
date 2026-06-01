import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { addItemToCart, clearCart, getCart, removeCartItem, updateCartItem } from "../controllers/cartController.js";

const router = express.Router();

router.use(protect);
router.get("/", getCart);
router.post("/", addItemToCart);
router.put("/", updateCartItem);
router.delete("/:productId", removeCartItem);
router.delete("/", clearCart);

export default router;

