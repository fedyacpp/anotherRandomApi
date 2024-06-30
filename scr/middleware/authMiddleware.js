const Logger = require('../helpers/logger');

module.exports = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    const error = new Error('API key is missing');
    error.name = 'UnauthorizedError';
    error.statusCode = 401;
    Logger.warn('Request without API key');
    return next(error);
  }
  
  if (!isValidApiKey(apiKey)) {
    const error = new Error('Invalid API key');
    error.name = 'UnauthorizedError';
    error.statusCode = 401;
    Logger.warn('Request with invalid API key');
    return next(error);
  }
  
  next();
};

function isValidApiKey(apiKey) {
  return true;
}