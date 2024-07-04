class CustomError extends Error {
    constructor(message, statusCode, code, details = {}) {
      super(message);
      this.name = this.constructor.name;
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  class ValidationError extends CustomError {
    constructor(message, details) {
      super(message, 400, 'invalid_request_error', details);
    }
  }
  
  class NotFoundError extends CustomError {
    constructor(message) {
      super(message, 404, 'not_found');
    }
  }
  
  class UnauthorizedError extends CustomError {
    constructor(message) {
      super(message, 401, 'invalid_api_key');
    }
  }
  
  class ForbiddenError extends CustomError {
    constructor(message) {
      super(message, 403, 'permission_denied');
    }
  }
  
  class TimeoutError extends CustomError {
    constructor(message) {
      super(message, 504, 'timeout');
    }
  }
  
  module.exports = {
    CustomError,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    TimeoutError
  };