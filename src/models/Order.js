import mongoose from 'mongoose';

const ORDER_STATUSES = ['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'];
const SHIPMENT_EVENT_STATUSES = ['placed', 'paid', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'exception'];
const RETURN_STATUSES = ['none', 'requested', 'approved', 'rejected', 'picked_up', 'refunded', 'closed'];
const RETURN_REASON_CODES = ['damaged', 'wrong_item', 'not_as_described', 'missing_parts', 'size_issue', 'quality_issue', 'other'];

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
   phoneNumber: {
      type: String,
      required: true
    }, 
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    variantId: {
      type: String
    },
    variant: {
      label: { type: String, trim: true },
      sku: { type: String, trim: true },
      size: { type: String, trim: true },
      color: { type: String, trim: true }
    }
  }],
  shippingAddress: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  paymentMethod: {
    type: String,
    required: true
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    index: true,
  },
  shipment: {
    courier: { type: String, trim: true },
    trackingId: { type: String, trim: true, index: true },
    trackingUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: SHIPMENT_EVENT_STATUSES,
      default: 'placed',
      index: true
    },
    timeline: [
      {
        status: { type: String, enum: SHIPMENT_EVENT_STATUSES, required: true },
        description: { type: String, trim: true },
        location: { type: String, trim: true },
        source: { type: String, enum: ['system', 'admin', 'webhook'], default: 'system' },
        courier: { type: String, trim: true },
        trackingId: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now, required: true }
      }
    ]
  },
  returnRequest: {
    status: {
      type: String,
      enum: RETURN_STATUSES,
      default: 'none',
      index: true
    },
    reasonCode: {
      type: String,
      enum: RETURN_REASON_CODES
    },
    reasonNote: { type: String, trim: true },
    evidenceUrls: [{ type: String, trim: true }],
    requestedAt: { type: Date },
    slaDueAt: { type: Date, index: true },
    decisionAt: { type: Date },
    decisionNote: { type: String, trim: true },
    refundAmount: { type: Number, min: 0 },
    events: [
      {
        status: { type: String, enum: RETURN_STATUSES, required: true },
        note: { type: String, trim: true },
        actor: { type: String, enum: ['user', 'admin', 'system'], default: 'system' },
        timestamp: { type: Date, default: Date.now, required: true }
      }
    ]
  },
  status: {
    type: String,
    enum: ORDER_STATUSES,
    default: 'placed',
    index: true
  },
  paymentResult: {
    id: { type: String },
    status: { type: String },
    update_time: { type: String },
    email_address: { type: String },
    phoneNumber: { type: String }
  },
  itemsPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  taxPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  cgstPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  sgstPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  shippingPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  totalPrice: {
    type: Number,
    required: true,
    default: 0.0
  },
  isPaid: {
    type: Boolean,
    required: true,
    default: false
  },
  paidAt: {
    type: Date
  },
  isDelivered: {
    type: Boolean,
    required: true,
    default: false
  },
  deliveredAt: {
    type: Date
  },
  discount: {
    code: { type: String, trim: true, uppercase: true },
    type: { type: String, enum: ['percentage', 'flat'] },
    value: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

orderSchema.pre('save', function(next) {
  if (this.status === 'paid' || this.status === 'packed' || this.status === 'shipped' || this.status === 'delivered') {
    this.isPaid = true;
    this.paidAt = this.paidAt || new Date();
  }

  if (this.status === 'delivered') {
    this.isDelivered = true;
    this.deliveredAt = this.deliveredAt || new Date();
  }

  if (this.status === 'cancelled') {
    this.isDelivered = false;
  }

  next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
export { ORDER_STATUSES };
