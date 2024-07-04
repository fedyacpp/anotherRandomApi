const { TimeoutError } = require('../utils/errors');
const Logger = require('../helpers/logger');

const timeoutMiddleware = (timeout) => (req, res, next) => {
  res.setTimeout(timeout, () => {
    const timeoutError = new TimeoutError('Request timeout');
    Logger.warn('Request timeout', { url: req.url, method: req.method, ip: req.ip });
    next(timeoutError);
  });
  next();
};

module.exports = timeoutMiddleware;