const { CustomError } = require('../utils/errors');

const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  if (err instanceof CustomError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details
      }
    });
  }

  res.status(500).json({
    error: {
      message: 'An unexpected error occurred',
      code: 'internal_server_error'
    }
  });
};

module.exports = errorMiddleware;