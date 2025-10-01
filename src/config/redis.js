import { createClient } from 'redis';
import { promisify } from 'util';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('Redis Client Error', err));

// Promisify Redis methods
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);

// Connect to Redis
const connectRedis = async () => {
  if (!client.isOpen) {
    await client.connect();
    console.log('Redis connected successfully');
  }
  return client;
};

export { client, connectRedis, getAsync, setAsync, delAsync };
