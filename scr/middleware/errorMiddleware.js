const Logger = require('../helpers/logger');

module.exports = (err, req, res, next) => {
  Logger.error(`Error occurred: ${err.message}\nStack: ${err.stack}`);
  
  let statusCode = err.statusCode || 500;
  let errorMessage = 'Internal Server Error';
  let errorDetails = {};

  switch (err.name) {
    case 'TimeoutError':
      statusCode = 504;
      errorMessage = 'Request Timeout';
      break;
    case 'ValidationError':
      statusCode = 400;
      errorMessage = 'Validation Error';
      errorDetails = err.errors;
      break;
    case 'UnauthorizedError':
      statusCode = 401;
      errorMessage = 'Authentication Error';
      break;
    case 'ForbiddenError':
      statusCode = 403;
      errorMessage = 'Permission Denied';
      break;
    case 'NotFoundError':
      statusCode = 404;
      errorMessage = 'Resource Not Found';
      break;
    case 'ConflictError':
      statusCode = 409;
      errorMessage = 'Resource Conflict';
      break;
    case 'RateLimitError':
      statusCode = 429;
      errorMessage = 'Too Many Requests';
      break;
    default:
      if (err.code === 'ECONNABORTED') {
        statusCode = 504;
        errorMessage = 'Gateway Timeout';
      }
  }

  const errorResponse = {
    error: {
      message: errorMessage,
      status: statusCode,
      code: err.code || 'INTERNAL_ERROR',
    }
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = { ...errorDetails, ...err.details };
  }

  res.status(statusCode).json(errorResponse);
};