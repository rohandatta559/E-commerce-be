import { getChannel } from '../config/rabbitmq.js';
import Order from '../models/Order.js';

const processOrder = async (msg) => {
  try {
    const order = JSON.parse(msg.content.toString());
    console.log('Processing order:', order._id);
    
    // Process the order (update status, send confirmation, etc.)
    await Order.findByIdAndUpdate(order._id, { status: 'processing' });
    
    // Acknowledge the message
    getChannel().ack(msg);
  } catch (error) {
    console.error('Error processing order:', error);
    // You might want to implement a dead-letter queue here
  }
};

export const startOrderConsumer = async () => {
  try {
    const channel = getChannel();
    await channel.consume('order_processing', processOrder);
    console.log('Order consumer started');
  } catch (error) {
    console.error('Error starting order consumer:', error);
  }
};
