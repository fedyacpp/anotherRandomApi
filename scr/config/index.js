require('dotenv').config();

module.exports = {
  port: process.env.SERVER_PORT || 8000,
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  validApiKeys: process.env.VALID_API_KEYS ? process.env.VALID_API_KEYS.split(',') : [],
  maxWorkers: process.env.MAX_WORKERS || 'auto',
  dbConnection: process.env.DB_CONNECTION_STRING,
  redisUrl: process.env.REDIS_URL,
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || 15 * 60 * 1000,
  rateLimitMax: process.env.RATE_LIMIT_MAX || 100,
};