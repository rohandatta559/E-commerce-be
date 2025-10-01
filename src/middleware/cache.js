import { getAsync, setAsync } from '../config/redis.js';

export const cache = (duration = 3600) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl || req.url}`;
    
    try {
      const cachedData = await getAsync(key);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = (body) => {
        setAsync(key, JSON.stringify(body), 'EX', duration);
        return originalJson.call(res, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache error:', error);
      next();
    }
  };
};
