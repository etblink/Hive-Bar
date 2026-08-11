'use strict';

class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', expose = false, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND', expose: true });
  }
}

class ValidationError extends AppError {
  constructor(message = 'The request is invalid') {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', expose: true });
  }
}

class FeatureUnavailableError extends AppError {
  constructor(message = 'This feature is not available yet') {
    super(message, { statusCode: 503, code: 'FEATURE_UNAVAILABLE', expose: true });
  }
}

class UpstreamError extends AppError {
  constructor(message = 'Hive data is temporarily unavailable', { cause, code = 'HIVE_RPC_UNAVAILABLE' } = {}) {
    super(message, { statusCode: 503, code, expose: true, cause });
  }
}

module.exports = {
  AppError,
  FeatureUnavailableError,
  NotFoundError,
  UpstreamError,
  ValidationError,
};
