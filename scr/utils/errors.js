const ERROR_CODES = {
  VALIDATION: { statusCode: 400, code: 'invalid_request_error' },
  NOT_FOUND: { statusCode: 404, code: 'not_found' },
  UNAUTHORIZED: { statusCode: 401, code: 'invalid_api_key' },
  FORBIDDEN: { statusCode: 403, code: 'permission_denied' },
  TIMEOUT: { statusCode: 504, code: 'timeout' }
};

class CustomError extends Error {
  constructor(message, { statusCode, code, details = {} }) {
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
    super(message, { ...ERROR_CODES.VALIDATION, details });
  }
}

class NotFoundError extends CustomError {
  constructor(message) {
    super(message, ERROR_CODES.NOT_FOUND);
  }
}

class UnauthorizedError extends CustomError {
  constructor(message) {
    super(message, ERROR_CODES.UNAUTHORIZED);
  }
}

class ForbiddenError extends CustomError {
  constructor(message) {
    super(message, ERROR_CODES.FORBIDDEN);
  }
}

class TimeoutError extends CustomError {
  constructor(message) {
    super(message, ERROR_CODES.TIMEOUT);
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