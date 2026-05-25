import Product from "../models/Product.js";
import { sendEmailWithAttachment } from "./emailService.js";

const ALERT_COOLDOWN_HOURS = Number(process.env.LOW_STOCK_ALERT_COOLDOWN_HOURS || 12);

export const maybeTriggerLowStockAlert = async ({ productId, productName, scope = "product", variantLabel, stock }) => {
  const thresholdDefault = Number(process.env.LOW_STOCK_THRESHOLD || 5);
  if (Number.isNaN(Number(stock))) return;

  const product = await Product.findById(productId).select("name lowStockThreshold lastLowStockAlertAt");
  if (!product) return;

  const threshold = Number(product.lowStockThreshold ?? thresholdDefault);
  if (Number(stock) > threshold) return;

  const now = Date.now();
  const last = product.lastLowStockAlertAt ? new Date(product.lastLowStockAlertAt).getTime() : 0;
  const cooldownMs = ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (last && now - last < cooldownMs) return;

  product.lastLowStockAlertAt = new Date(now);
  await product.save();

  const message = `[LOW_STOCK_ALERT] ${productName || product.name} | scope=${scope}${variantLabel ? ` | variant=${variantLabel}` : ""} | stock=${stock} | threshold=${threshold}`;
  console.warn(message);

  const to = process.env.INVENTORY_ALERT_EMAIL;
  if (!to) return;

  try {
    await sendEmailWithAttachment({
      to,
      subject: `Low Stock Alert: ${productName || product.name}`,
      text: message,
      html: `<p>${message}</p>`,
    });
  } catch (error) {
    console.error("Low stock alert email failed:", error.message);
  }
};
