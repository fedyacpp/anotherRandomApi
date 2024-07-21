const { TimeoutError } = require('../utils/errors');
const Logger = require('../helpers/logger');
const config = require('../config');

const timeoutMiddleware = (defaultTimeout) => (req, res, next) => {
  const timeout = req.headers['x-request-timeout'] 
    ? parseInt(req.headers['x-request-timeout'], 10) 
    : defaultTimeout;

  const minTimeout = 1000;
  const maxTimeout = 60000;
  const safeTimeout = Math.max(minTimeout, Math.min(timeout, maxTimeout));

  res.setTimeout(safeTimeout, () => {
    const timeoutError = new TimeoutError('Request timeout');
    Logger.warn('Request timeout', { 
      url: req.url, 
      method: req.method, 
      ip: req.ip, 
      timeout: safeTimeout 
    });

    if (!res.headersSent) {
      res.status(504).json({
        error: {
          message: "Request timeout",
          type: "timeout_error",
          param: null,
          code: "request_timeout"
        }
      });
    }
  });

  res.setHeader('X-Timeout-Value', safeTimeout);

  next();
};

module.exports = timeoutMiddleware;