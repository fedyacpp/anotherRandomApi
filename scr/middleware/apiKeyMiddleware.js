const config = require('../config');

const apiKeyMiddleware = (req, res, next) => {
  if (config.environment === 'development') {
    return next();
  }

  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
  if (!config.validApiKeys.includes(token)) {
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