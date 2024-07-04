const Logger = require('../helpers/logger');
const config = require('../config');

module.exports = (err, req, res, next) => {
  Logger.error(`Error occurred: ${err.message}`, { stack: err.stack, url: req.url, method: req.method, ip: req.ip });
  
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const errorMessage = config.environment === 'production' && statusCode === 500 
    ? 'Internal server error' 
    : err.message || 'Internal server error';
  const errorType = err.type || 'api_error';
  const errorCode = err.code || 'internal_error';

  const errorResponse = {
    error: {
      message: errorMessage,
      type: errorType,
      param: null,
      code: errorCode,
    }
  };

  if (config.environment === 'development') {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};