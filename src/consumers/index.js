import { startOrderConsumer } from './orderConsumer.js';
import { startEmailConsumer } from './emailConsumer.js';

export const startConsumers = async () => {
  try {
    await startOrderConsumer();
    await startEmailConsumer();
    console.log('All consumers started successfully');
  } catch (error) {
    console.error('Error starting consumers:', error);
    process.exit(1);
  }
};

// Start consumers when this module is imported
startConsumers();
