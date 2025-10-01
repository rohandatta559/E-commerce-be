import { getChannel } from '../../config/rabbitmq.js';

export const publishToQueue = async (queue, message) => {
  try {
    const channel = getChannel();
    await channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    console.log(`Message sent to ${queue}:`, message);
  } catch (error) {
    console.error('Error publishing message:', error);
    throw error;
  }
};
