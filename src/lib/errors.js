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

class ConflictError extends AppError {
  constructor(message = 'The request conflicts with current state', { code = 'CONFLICT' } = {}) {
    super(message, { statusCode: 409, code, expose: true });
  }
}

class FeatureUnavailableError extends AppError {
  constructor(
    message = 'This feature is not available yet',
    { code = 'FEATURE_UNAVAILABLE', cause } = {},
  ) {
    super(message, { statusCode: 503, code, expose: true, cause });
  }
}

class UpstreamError extends AppError {
  constructor(message = 'Hive data is temporarily unavailable', { cause, code = 'HIVE_RPC_UNAVAILABLE' } = {}) {
    super(message, { statusCode: 503, code, expose: true, cause });
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Hive identity could not be verified', { code = 'AUTHENTICATION_FAILED', statusCode = 401, cause } = {}) {
    super(message, { statusCode, code, expose: true, cause });
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'This action is not authorized', { code = 'NOT_AUTHORIZED', statusCode = 403 } = {}) {
    super(message, { statusCode, code, expose: true });
  }
}

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  FeatureUnavailableError,
  NotFoundError,
  UpstreamError,
  ValidationError,
};
