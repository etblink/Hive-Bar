'use strict';

const { AppError, NotFoundError } = require('../lib/errors');

function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`No route matches ${req.method} ${req.path}`));
}

function wantsJson(req) {
  return req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
}

function classifyError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.expose ? error.message : 'An unexpected error occurred',
    };
  }

  if (error?.type === 'entity.too.large' || error?.type === 'parameters.too.many') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body is too large',
    };
  }

  if (error instanceof SyntaxError && error?.status === 400 && error?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'The JSON request body is invalid',
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const { statusCode, code, message } = classifyError(error);

  req.log.error({ err: error, statusCode, code }, 'request failed');
  res.status(statusCode);

  if (wantsJson(req)) {
    return res.json({ error: { code, message, requestId: req.id } });
  }

  const view = req.get('HX-Request') === 'true' ? 'common/error-fragment' : 'error';
  return res.render(view, {
    pageTitle: statusCode === 404 ? 'Page not found' : 'Something went wrong',
    statusCode,
    errorCode: code,
    message,
    requestId: req.id,
    retryUrl:
      req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//')
        ? req.originalUrl
        : '/',
  });
}

module.exports = {
  classifyError,
  errorHandler,
  notFoundHandler,
};
