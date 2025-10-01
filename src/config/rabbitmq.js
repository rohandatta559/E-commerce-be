import amqplib from 'amqplib';

let channel = null;

const connectRabbitMQ = async () => {
  try {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();
    console.log('Connected to RabbitMQ');
    
    // Declare queues
    await channel.assertQueue('order_processing', { durable: true });
    await channel.assertQueue('email_notifications', { durable: true });
    
    return channel;
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
    throw error;
  }
};

const getChannel = () => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
};

export { connectRabbitMQ, getChannel };
