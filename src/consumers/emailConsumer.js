import { getChannel } from '../config/rabbitmq.js';
import { sendEmail } from '../services/emailService.js';

const processEmail = async (msg) => {
  try {
    const { type, email, data } = JSON.parse(msg.content.toString());
    console.log(`Processing ${type} email for ${email}`);
    
    // Handle different types of email notifications
    switch (type) {
      case 'order_confirmation':
        await sendEmail({
          to: email,
          subject: 'Order Confirmation',
          text: `Your order #${data.orderId} has been received.`,
          html: `<h1>Thank you for your order!</h1><p>Your order #${data.orderId} has been received and is being processed.</p>`
        });
        break;
      
      case 'password_reset':
        await sendEmail({
          to: email,
          subject: 'Password Reset',
          text: `Click here to reset your password: ${data.resetUrl}`,
          html: `<p>Click <a href="${data.resetUrl}">here</a> to reset your password.</p>`
        });
        break;
      
      default:
        console.warn(`Unknown email type: ${type}`);
    }
    
    // Acknowledge the message
    getChannel().ack(msg);
  } catch (error) {
    console.error('Error processing email:', error);
    // You might want to implement a dead-letter queue here
  }
};

export const startEmailConsumer = async () => {
  try {
    const channel = getChannel();
    await channel.consume('email_notifications', processEmail);
    console.log('Email consumer started');
  } catch (error) {
    console.error('Error starting email consumer:', error);
  }
};
