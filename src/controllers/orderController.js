import mongoose from "mongoose";
import Order, { ORDER_STATUSES } from "../models/Order.js";
import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import { generateInvoicePDF } from "../services/invoiceService.js";
import { sendEmailWithAttachment } from "../services/emailService.js";

const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

const CGST_RATE = 0.18;
const SGST_RATE = 0.18;
const ACTIVE_PURCHASE_STATUSES = ["paid", "packed", "shipped", "delivered"];
const FIRST_ORDER_ELIGIBLE_STATUSES = ["placed", "paid", "packed", "shipped", "delivered"];
const SHIPMENT_STATUS_BY_ORDER_STATUS = {
  placed: 'placed',
  paid: 'paid',
  packed: 'packed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
};
const RETURN_REASON_CODES = ['damaged', 'wrong_item', 'not_as_described', 'missing_parts', 'size_issue', 'quality_issue', 'other'];
const RETURN_DECISION_STATUSES = ['approved', 'rejected', 'picked_up', 'refunded', 'closed'];

const applyLifecycleFields = (order, nextStatus) => {
  order.status = nextStatus;
  if (ACTIVE_PURCHASE_STATUSES.includes(nextStatus)) {
    order.isPaid = true;
    order.paidAt = order.paidAt || new Date();
  }
  if (nextStatus === "delivered") {
    order.isDelivered = true;
    order.deliveredAt = order.deliveredAt || new Date();
  }
};

const appendShipmentEvent = (order, {
  status,
  description,
  location,
  source = 'system',
  courier,
  trackingId,
  timestamp = new Date(),
}) => {
  order.shipment = order.shipment || {};
  order.shipment.timeline = Array.isArray(order.shipment.timeline) ? order.shipment.timeline : [];
  order.shipment.status = status || order.shipment.status || 'placed';
  if (courier !== undefined) order.shipment.courier = courier;
  if (trackingId !== undefined) order.shipment.trackingId = trackingId;
  order.shipment.timeline.push({
    status: order.shipment.status,
    description: description || undefined,
    location: location || undefined,
    source,
    courier: order.shipment.courier,
    trackingId: order.shipment.trackingId,
    timestamp,
  });
};

const appendReturnEvent = (order, { status, note, actor = 'system', timestamp = new Date() }) => {
  order.returnRequest = order.returnRequest || { status: 'none', events: [] };
  order.returnRequest.events = Array.isArray(order.returnRequest.events) ? order.returnRequest.events : [];
  order.returnRequest.status = status || order.returnRequest.status || 'none';
  order.returnRequest.events.push({
    status: order.returnRequest.status,
    note: note || undefined,
    actor,
    timestamp,
  });
};

const hasUserUsedCoupon = (coupon, userId) =>
  Array.isArray(coupon.usedByUsers) &&
  coupon.usedByUsers.some((id) => String(id) === String(userId));

const isCouponAssignedToUser = (coupon, userId) => {
  if (!Array.isArray(coupon.assignedUsers) || coupon.assignedUsers.length === 0) return true;
  return coupon.assignedUsers.some((id) => String(id) === String(userId));
};

export const createOrder = async (req, res) => {
  const runCreateOrder = async (session = null) => {
    const sessionOptions = session ? { session } : {};
    const items = req.body.orderItems || req.body.items || [];
    const { shippingAddress = {}, paymentMethod, shippingPrice = 0, couponCode } = req.body;
    const phoneNumber = req.body.phoneNumber || shippingAddress.phone;

    if (!phoneNumber) return res.status(400).json({ message: "Phone Number is required", field: "phoneNumber" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Order must have items" });
    if (!paymentMethod) return res.status(400).json({ message: "paymentMethod is required" });

    const normalizedShippingAddress = {
      address: shippingAddress.address || shippingAddress.line1,
      city: shippingAddress.city,
      postalCode: shippingAddress.postalCode,
      country: shippingAddress.country || shippingAddress.state || "India",
    };

    if (!normalizedShippingAddress.address || !normalizedShippingAddress.city || !normalizedShippingAddress.postalCode) {
      return res.status(400).json({ message: "Complete shippingAddress is required" });
    }

    const orderItems = [];
    for (const item of items) {
      const quantity = Number(item.quantity);
      const variantId = item.variantId?.toString?.();
      if (!item.product || !quantity || quantity < 1) {
        throw new Error("Invalid order item payload");
      }

      let product;
      let selectedVariant = null;

      if (variantId) {
        product = await Product.findOneAndUpdate(
          {
            _id: item.product,
            variants: {
              $elemMatch: {
                _id: new mongoose.Types.ObjectId(variantId),
                stock: { $gte: quantity },
              },
            },
          },
          { $inc: { "variants.$.stock": -quantity } },
          { new: true, ...sessionOptions }
        );

        if (product) {
          selectedVariant = product.variants.find((variant) => String(variant._id) === String(variantId));
        }
      } else {
        product = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true, ...sessionOptions }
        );
      }

      if (!product) {
        throw new Error(variantId ? `Insufficient variant stock for product ${item.product}` : `Insufficient stock for product ${item.product}`);
      }

      if (variantId && !selectedVariant) {
        throw new Error(`Variant ${variantId} not found for product ${item.product}`);
      }
      orderItems.push({
        product: product._id,
        variantId: variantId || undefined,
        variant: selectedVariant
          ? {
              label: selectedVariant.label,
              sku: selectedVariant.sku,
              size: selectedVariant.size,
              color: selectedVariant.color,
            }
          : undefined,
        quantity,
        price: Number(selectedVariant?.price ?? product.price),
      });
    }

    const itemsPrice = Number(
      orderItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0).toFixed(2)
    );
    const cgstPrice = Number((itemsPrice * CGST_RATE).toFixed(2));
    const sgstPrice = Number((itemsPrice * SGST_RATE).toFixed(2));
    const taxPrice = Number((cgstPrice + sgstPrice).toFixed(2));

    let discountAmount = 0;
    let discount = undefined;
    if (couponCode) {
      const couponQuery = Coupon.findOne({ code: couponCode.toUpperCase().trim(), isActive: true });
      const coupon = session ? await couponQuery.session(session) : await couponQuery;
      if (!coupon) throw new Error("Invalid coupon code");
      if (coupon.expiresAt < new Date()) throw new Error("Coupon has expired");
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error("Coupon usage limit reached");
      if (!isCouponAssignedToUser(coupon, req.user._id)) throw new Error("This coupon is not assigned to your account");
      if (coupon.onePerUser && hasUserUsedCoupon(coupon, req.user._id)) throw new Error("You have already used this coupon");
      if (coupon.isFirstOrderOnly) {
        const priorOrderQuery = Order.exists({
          user: req.user._id,
          status: { $in: FIRST_ORDER_ELIGIBLE_STATUSES },
        });
        const priorOrder = session ? await priorOrderQuery.session(session) : await priorOrderQuery;
        if (priorOrder) throw new Error("This coupon is valid only for first-time orders");
      }
      if (itemsPrice < coupon.minOrderValue) throw new Error(`Minimum order value is ${coupon.minOrderValue}`);

      discountAmount =
        coupon.type === "percentage"
          ? (itemsPrice * coupon.value) / 100
          : coupon.value;
      if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      discountAmount = Number(discountAmount.toFixed(2));

      discount = { code: coupon.code, type: coupon.type, value: coupon.value, amount: discountAmount };
      coupon.usedCount += 1;
      if (!hasUserUsedCoupon(coupon, req.user._id)) {
        coupon.usedByUsers.push(req.user._id);
      }
      await coupon.save(sessionOptions);
    }

    const totalPrice = Number((itemsPrice + taxPrice + Number(shippingPrice || 0) - discountAmount).toFixed(2));

    const [createdOrder] = await Order.create(
      [
        {
          user: req.user._id,
          phoneNumber,
          items: orderItems,
          shippingAddress: normalizedShippingAddress,
          paymentMethod,
          itemsPrice,
          cgstPrice,
          sgstPrice,
          taxPrice,
          shippingPrice,
          totalPrice,
          discount,
          status: paymentMethod.toLowerCase() === "cod" ? "placed" : "paid",
          shipment: {
            status: paymentMethod.toLowerCase() === "cod" ? "placed" : "paid",
            timeline: [
              {
                status: paymentMethod.toLowerCase() === "cod" ? "placed" : "paid",
                description: paymentMethod.toLowerCase() === "cod" ? "Order placed successfully" : "Payment received and order placed",
                source: 'system',
                timestamp: new Date(),
              },
            ],
          },
        },
      ],
      sessionOptions
    );

    const populated = await Order.findById(createdOrder._id)
      .populate("user", "email fullName")
      .populate("items.product", "name image price");

    try {
      const pdfBuffer = await generateInvoicePDF(populated);
      if (process.env.ENABLE_EMAIL_INVOICES !== "false" && populated.user?.email) {
        await sendEmailWithAttachment({
          to: populated.user.email,
          subject: `Your Order Confirmation & Invoice - Order ${populated._id.toString().substring(0, 8)}`,
          text: `Thank you for your order! Invoice attached.`,
          html: `<p>Hi ${populated.user.fullName || "Customer"},</p><p>Total: ${formatINR(populated.totalPrice)}</p>`,
          attachments: [{ filename: `invoice-${populated._id}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
        });
      }
    } catch (error) {
      console.error("Invoice email after order failed:", error.message);
    }

    return populated;
  };

  const isTransactionUnsupported = (error) =>
    typeof error?.message === "string" &&
    (error.message.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
      error.message.includes("replica set"));

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const order = await runCreateOrder(session);
    await session.commitTransaction();
    return res.status(201).json(order);
  } catch (error) {
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }

    if (isTransactionUnsupported(error)) {
      console.warn("Transactions unsupported. Retrying createOrder without transaction for local/dev.");
      try {
        const order = await runCreateOrder(null);
        return res.status(201).json(order);
      } catch (fallbackError) {
        console.error("createOrder fallback error:", fallbackError);
        return res.status(400).json({ message: fallbackError.message || "Error creating order" });
      }
    }

    console.error("createOrder error:", error);
    return res.status(400).json({ message: error.message || "Error creating order" });
  } finally {
    session?.endSession();
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const { status, sortBy, order, page = 1, limit = 20 } = req.query;
    const filter = { user: req.user._id };
    if (status && status !== "all") filter.status = status;

    const sortField = sortBy === "amount" ? "totalPrice" : "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(50, Number(limit) || 20));

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ [sortField]: sortOrder }).skip((p - 1) * l).limit(l),
      Order.countDocuments(filter),
    ]);

    return res.json({
      orders,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  } catch (error) {
    console.error("getMyOrders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getOrderStats = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    const totalSpent = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const byStatus = ORDER_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
    orders.forEach((order) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
    });

    return res.json({
      totalOrders: orders.length,
      totalSpent,
      avgOrderValue: orders.length ? totalSpent / orders.length : 0,
      deliveredOrders: byStatus.delivered || 0,
      pendingOrders: (byStatus.placed || 0) + (byStatus.paid || 0) + (byStatus.packed || 0) + (byStatus.shipped || 0),
      ordersByStatus: byStatus,
    });
  } catch (error) {
    console.error("getOrderStats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "fullName email _id role");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user?._id) !== String(req.user?._id) && req.user?.role !== "admin") {
      return res.status(401).json({ message: "Not authorized to view this order" });
    }
    return res.json(order);
  } catch (error) {
    console.error("getOrderById error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reasonCode, reasonNote, evidenceUrls = [] } = req.body;
    const order = await Order.findById(orderId).populate("user", "fullName email _id role");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user?._id) !== String(req.user?._id) && req.user?.role !== "admin") {
      return res.status(401).json({ message: "Not authorized to request return for this order" });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: "Return can only be requested after delivery" });
    }
    if (!RETURN_REASON_CODES.includes(reasonCode)) {
      return res.status(400).json({ message: "Invalid return reason code" });
    }
    if (order.returnRequest?.status && order.returnRequest.status !== 'none' && order.returnRequest.status !== 'rejected' && order.returnRequest.status !== 'closed') {
      return res.status(400).json({ message: "Return request already active for this order" });
    }

    const slaHours = Math.max(1, Number(process.env.RETURN_SLA_HOURS || 72));
    const now = new Date();
    const slaDueAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000);
    order.returnRequest = order.returnRequest || {};
    order.returnRequest.status = 'requested';
    order.returnRequest.reasonCode = reasonCode;
    order.returnRequest.reasonNote = reasonNote || '';
    order.returnRequest.evidenceUrls = Array.isArray(evidenceUrls)
      ? evidenceUrls.map((url) => String(url).trim()).filter(Boolean)
      : [];
    order.returnRequest.requestedAt = now;
    order.returnRequest.slaDueAt = slaDueAt;
    order.returnRequest.decisionAt = undefined;
    order.returnRequest.decisionNote = '';
    order.returnRequest.refundAmount = undefined;
    appendReturnEvent(order, {
      status: 'requested',
      note: `Return requested (${reasonCode})`,
      actor: req.user?.role === 'admin' ? 'admin' : 'user',
      timestamp: now,
    });

    await order.save();
    return res.status(201).json({ success: true, order });
  } catch (error) {
    console.error("requestReturn error:", error);
    return res.status(500).json({ message: "Error requesting return" });
  }
};

export const updateReturnRequest = async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { orderId } = req.params;
    const { status, decisionNote, refundAmount } = req.body;
    if (!RETURN_DECISION_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid return status update" });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.returnRequest || order.returnRequest.status === 'none') {
      return res.status(400).json({ message: "No active return request on this order" });
    }

    order.returnRequest.status = status;
    order.returnRequest.decisionAt = new Date();
    if (decisionNote !== undefined) order.returnRequest.decisionNote = String(decisionNote || '');
    if (refundAmount !== undefined && !Number.isNaN(Number(refundAmount))) {
      order.returnRequest.refundAmount = Number(refundAmount);
    }
    appendReturnEvent(order, {
      status,
      note: decisionNote || `Return status updated to ${status}`,
      actor: 'admin',
    });
    await order.save();
    return res.json({ success: true, order });
  } catch (error) {
    console.error("updateReturnRequest error:", error);
    return res.status(500).json({ message: "Error updating return request" });
  }
};

export const updateOrderToPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    applyLifecycleFields(order, "paid");
    appendShipmentEvent(order, {
      status: SHIPMENT_STATUS_BY_ORDER_STATUS.paid,
      description: 'Payment confirmed',
      source: 'system',
    });
    order.paymentResult = {
      id: req.body.id || "payment_id",
      status: req.body.status || "completed",
      update_time: req.body.update_time || new Date().toISOString(),
      email_address: req.body.email_address || req.user.email,
      phoneNumber: req.body.phoneNumber,
    };
    await order.save();
    return res.json(order);
  } catch (error) {
    console.error("updateOrderToPaid error:", error);
    return res.status(500).json({ message: "Error updating order" });
  }
};

export const markOrderPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate("user", "email fullName");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    applyLifecycleFields(order, "paid");
    appendShipmentEvent(order, {
      status: SHIPMENT_STATUS_BY_ORDER_STATUS.paid,
      description: 'Order marked paid by user/admin',
      source: req.user.role === 'admin' ? 'admin' : 'system',
    });
    if (req.body.paymentResult) order.paymentResult = req.body.paymentResult;
    await order.save();
    return res.json({ success: true, message: "Order marked as paid", order });
  } catch (error) {
    console.error("markOrderPaid error:", error);
    return res.status(500).json({ message: "Error marking order as paid" });
  }
};

export const markOrderDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate("user", "email fullName role");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    applyLifecycleFields(order, "delivered");
    appendShipmentEvent(order, {
      status: SHIPMENT_STATUS_BY_ORDER_STATUS.delivered,
      description: 'Order delivered',
      source: req.user.role === 'admin' ? 'admin' : 'system',
    });
    await order.save();
    return res.status(200).json({ success: true, message: "Order marked as delivered", order });
  } catch (error) {
    console.error("markOrderDelivered error:", error);
    return res.status(500).json({ message: "Error marking order as delivered" });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const [orders, total] = await Promise.all([
      Order.find(filter).populate("user", "email fullName").populate("items.product", "name").sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
      Order.countDocuments(filter),
    ]);
    return res.json({ orders, pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) } });
  } catch (error) {
    console.error("getAllOrders error:", error);
    return res.status(500).json({ message: "Error fetching orders" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid order status" });
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    applyLifecycleFields(order, status);
    appendShipmentEvent(order, {
      status: SHIPMENT_STATUS_BY_ORDER_STATUS[status] || 'placed',
      description: `Order status changed to ${status}`,
      source: 'admin',
    });
    await order.save();
    return res.json({ success: true, order });
  } catch (error) {
    console.error("updateOrderStatus error:", error);
    return res.status(500).json({ message: "Error updating status" });
  }
};

export const updateShipmentDetails = async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { orderId } = req.params;
    const { courier, trackingId, trackingUrl, shipmentStatus, description, location } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.shipment = order.shipment || {};
    if (courier !== undefined) order.shipment.courier = courier;
    if (trackingId !== undefined) order.shipment.trackingId = trackingId;
    if (trackingUrl !== undefined) order.shipment.trackingUrl = trackingUrl;

    if (shipmentStatus) {
      appendShipmentEvent(order, {
        status: shipmentStatus,
        description: description || `Shipment status updated to ${shipmentStatus}`,
        location,
        source: 'admin',
        courier: order.shipment.courier,
        trackingId: order.shipment.trackingId,
      });
      if (shipmentStatus === 'delivered') {
        applyLifecycleFields(order, 'delivered');
      }
      if (shipmentStatus === 'shipped' && ['placed', 'paid', 'packed'].includes(order.status)) {
        applyLifecycleFields(order, 'shipped');
      }
    }

    await order.save();
    return res.json({ success: true, order });
  } catch (error) {
    console.error("updateShipmentDetails error:", error);
    return res.status(500).json({ message: "Error updating shipment details" });
  }
};

export const shipmentWebhookSync = async (req, res) => {
  try {
    const expectedSecret = process.env.SHIPMENT_WEBHOOK_SECRET;
    if (expectedSecret) {
      const incomingSecret = req.headers['x-webhook-secret'];
      if (incomingSecret !== expectedSecret) {
        return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
      }
    }

    const { trackingId, orderId, courier, status, description, location, timestamp, trackingUrl } = req.body || {};
    if (!status || (!trackingId && !orderId)) {
      return res.status(400).json({ success: false, message: 'status and orderId/trackingId are required' });
    }

    const query = orderId ? { _id: orderId } : { 'shipment.trackingId': trackingId };
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.shipment = order.shipment || {};
    if (courier !== undefined) order.shipment.courier = courier;
    if (trackingId !== undefined) order.shipment.trackingId = trackingId;
    if (trackingUrl !== undefined) order.shipment.trackingUrl = trackingUrl;

    appendShipmentEvent(order, {
      status,
      description: description || `Webhook update: ${status}`,
      location,
      source: 'webhook',
      courier: order.shipment.courier,
      trackingId: order.shipment.trackingId,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    if (status === 'delivered') {
      applyLifecycleFields(order, 'delivered');
    } else if (status === 'shipped' && ['placed', 'paid', 'packed'].includes(order.status)) {
      applyLifecycleFields(order, 'shipped');
    }

    await order.save();
    return res.json({ success: true });
  } catch (error) {
    console.error("shipmentWebhookSync error:", error);
    return res.status(500).json({ success: false, message: 'Webhook sync failed' });
  }
};

export const getOrderInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("user", "email fullName phoneNumber").populate("items.product", "name");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to view this invoice" });
    }
    const pdfBuffer = await generateInvoicePDF(order);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order._id}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("getOrderInvoice error:", error);
    return res.status(500).json({ message: "Error generating invoice" });
  }
};

export const sendOrderInvoiceEmail = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("user", "email fullName phoneNumber").populate("items.product", "name");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user._id) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to send invoice for this order" });
    }
    if (!order.user.email) return res.status(400).json({ message: "User does not have an email address" });

    const pdfBuffer = await generateInvoicePDF(order);
    await sendEmailWithAttachment({
      to: order.user.email,
      subject: `Your Invoice for Order ${order._id.toString().substring(0, 8)}`,
      text: `Please find attached your invoice for order ${order._id.toString().substring(0, 8)}.`,
      html: `<p>Hi ${order.user.fullName || "Customer"},</p><p>Total: ${formatINR(order.totalPrice)}</p>`,
      attachments: [{ filename: `invoice-${order._id}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });
    return res.json({ success: true, message: "Invoice email sent successfully", orderId: order._id, email: order.user.email });
  } catch (error) {
    console.error("sendOrderInvoiceEmail error:", error);
    return res.status(500).json({ message: "Error sending invoice email", error: error.message });
  }
};
