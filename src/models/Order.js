import mongoose from 'mongoose';

const ORDER_STATUSES = ['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'];

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
