import mongoose from 'mongoose';

const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded', 'cancelled'];
const PAYMENT_METHODS = ['cod', 'card', 'upi', 'netbanking', 'wallet', 'paypal', 'razorpay', 'stripe', 'other'];

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'INR',
  },
  method: {
    type: String,
    enum: PAYMENT_METHODS,
    default: 'other',
  },
  status: {
    type: String,
    enum: PAYMENT_STATUSES,
    default: 'pending',
    index: true,
  },
  transactionId: {
    type: String,
    trim: true,
    index: true,
  },
  providerResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
export { PAYMENT_STATUSES, PAYMENT_METHODS };
