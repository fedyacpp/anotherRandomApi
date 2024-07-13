const { CustomError } = require('../utils/errors');
const Logger = require('../helpers/logger');

const errorMiddleware = (err, req, res, next) => {
  if (err instanceof CustomError) {
    Logger.error(`${err.name}: ${err.message}`, err);
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details
      }
    });
  }

  Logger.error('Unexpected error:', err);
  res.status(500).json({
    error: {
      message: 'An unexpected error occurred',
      code: 'internal_server_error'
    }
  });
};

module.exports = errorMiddleware;