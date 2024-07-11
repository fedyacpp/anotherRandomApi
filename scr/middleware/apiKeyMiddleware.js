const config = require('../config');
const NodeCache = require('node-cache');
const Logger = require('../helpers/logger');

const apiKeyCache = new NodeCache({ stdTTL: 300 }); // 5 minutes

const apiKeyMiddleware = (req, res, next) => {
  if (config.environment === 'development') {
    return next();
  }

  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    Logger.warn('Invalid Authorization header', { ip: req.ip });
    return res.status(401).json({
      error: {
        message: "Invalid API key provided",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key"
      }
    });
  }

  const token = authHeader.split(' ')[1];
  
  const cachedResult = apiKeyCache.get(token);
  if (cachedResult !== undefined) {
    if (cachedResult) {
      return next();
    } else {
      Logger.warn('Invalid API key used', { ip: req.ip });
      return res.status(401).json({
        error: {
          message: "Invalid API key provided",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key"
        }
      });
    }
  }

  const isValid = config.validApiKeys.includes(token);
  apiKeyCache.set(token, isValid);

  if (!isValid) {
    Logger.warn('Invalid API key used', { ip: req.ip });
    return res.status(401).json({
      error: {
        message: "Invalid API key provided",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key"
      }
    });
  }

  next();
};

module.exports = apiKeyMiddleware;