require('dotenv').config();

module.exports = {
  port: process.env.PORT || 8000,
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  validApiKeys: process.env.VALID_API_KEYS ? process.env.VALID_API_KEYS.split(',') : [],
};