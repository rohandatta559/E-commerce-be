import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

const normalizeLineId = (productId, variantId) => `${String(productId)}:${variantId || "base"}`;

const toCartResponse = (cartDoc) => {
  const items = (cartDoc?.items || []).map((item) => {
    const product = item.product;
    const selectedVariant = item.variantId
      ? (product?.variants || []).find((variant) => String(variant._id) === String(item.variantId))
      : null;
    return {
      lineId: normalizeLineId(product?._id || item.product, item.variantId),
      productId: product?._id || item.product,
      variantId: item.variantId || null,
      name: product?.name,
      image: selectedVariant?.image || product?.image,
      price: Number(selectedVariant?.price ?? product?.price ?? 0),
      selectedVariant: selectedVariant
        ? {
            _id: selectedVariant._id,
            label: selectedVariant.label,
            sku: selectedVariant.sku,
            size: selectedVariant.size,
            color: selectedVariant.color,
            price: selectedVariant.price,
            image: selectedVariant.image,
          }
        : null,
      quantity: Number(item.quantity || 1),
    };
  });
  return { items };
};

export const getCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  return res.json({ success: true, ...toCartResponse(cart) });
};

export const addItemToCart = async (req, res) => {
  const { productId, variantId = null, quantity = 1 } = req.body;
  if (!productId || Number(quantity) < 1) {
    return res.status(400).json({ success: false, message: "productId and valid quantity are required" });
  }

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });

  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

  const existing = cart.items.find(
    (item) => String(item.product) === String(productId) && String(item.variantId || "") === String(variantId || "")
  );
  if (existing) existing.quantity += Number(quantity);
  else cart.items.push({ product: productId, variantId, quantity: Number(quantity) });

  await cart.save();
  const populated = await Cart.findById(cart._id).populate("items.product");
  return res.json({ success: true, ...toCartResponse(populated) });
};

export const updateCartItem = async (req, res) => {
  const { productId, variantId = null, quantity } = req.body;
  if (!productId || Number(quantity) < 1) {
    return res.status(400).json({ success: false, message: "productId and valid quantity are required" });
  }

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

  const item = cart.items.find(
    (entry) => String(entry.product) === String(productId) && String(entry.variantId || "") === String(variantId || "")
  );
  if (!item) return res.status(404).json({ success: false, message: "Cart item not found" });
  item.quantity = Number(quantity);

  await cart.save();
  const populated = await Cart.findById(cart._id).populate("items.product");
  return res.json({ success: true, ...toCartResponse(populated) });
};

export const removeCartItem = async (req, res) => {
  const { productId } = req.params;
  const variantId = req.query.variantId || null;
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

  cart.items = cart.items.filter(
    (item) => !(String(item.product) === String(productId) && String(item.variantId || "") === String(variantId || ""))
  );
  await cart.save();
  const populated = await Cart.findById(cart._id).populate("items.product");
  return res.json({ success: true, ...toCartResponse(populated) });
};

export const clearCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.json({ success: true, items: [] });
  cart.items = [];
  await cart.save();
  return res.json({ success: true, items: [] });
};

