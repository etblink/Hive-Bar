'use strict';

const { AppError, NotFoundError } = require('../lib/errors');

function notFoundHandler(_req, _res, next) {
  next(new NotFoundError('We couldn’t find that page. Check the address or return to the community.'));
}

function wantsJson(req) {
  return (
    req.originalUrl.startsWith('/api/') ||
    req.originalUrl.startsWith('/auth/') ||
    req.accepts(['html', 'json']) === 'json'
  );
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

function errorPresentation({ statusCode, code, message, retryUrl, isDynamic = false }) {
  if (code === 'SESSION_REQUIRED') {
    return {
      pageTitle: 'Sign in required',
      stateKind: 'access',
      stateLabel: 'Private account page',
      message,
      announceRole: 'status',
      primaryAction: { href: '/#hive-sign-in', label: 'Go to sign in' },
      secondaryAction: { href: '/', label: 'Return home' },
    };
  }

  if (code === 'PROFILE_OWNER_REQUIRED') {
    return {
      pageTitle: 'This page belongs to another account',
      stateKind: 'access',
      stateLabel: 'Owner-only page',
      message,
      announceRole: 'status',
      primaryAction: { href: '/', label: 'Return home' },
      secondaryAction: null,
    };
  }

  if (statusCode === 404) {
    return {
      pageTitle: 'Page not found',
      stateKind: 'info',
      stateLabel: 'Nothing here',
      message,
      announceRole: 'status',
      primaryAction: { href: '/community', label: 'Browse the community' },
      secondaryAction: { href: '/', label: 'Return home' },
    };
  }

  if (statusCode === 503) {
    return {
      pageTitle: 'This page is temporarily unavailable',
      stateKind: 'warning',
      stateLabel: 'Please try again',
      message,
      announceRole: 'status',
      primaryAction: { href: retryUrl, label: 'Try again' },
      secondaryAction: { href: '/', label: 'Return home' },
    };
  }

  return {
    pageTitle: 'Something went wrong',
    stateKind: 'error',
    stateLabel: `${statusCode} · ${code}`,
    message,
    announceRole: isDynamic ? 'alert' : 'status',
    primaryAction: { href: retryUrl, label: 'Try again' },
    secondaryAction: { href: '/', label: 'Return home' },
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

  const isDynamic = req.get('HX-Request') === 'true';
  const view = isDynamic ? 'common/error-fragment' : 'error';
  const retryUrl =
    req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//')
      ? req.originalUrl
      : '/';
  const presentation = errorPresentation({ statusCode, code, message, retryUrl, isDynamic });
  return res.render(view, {
    ...presentation,
    statusCode,
    errorCode: code,
    requestId: req.id,
    retryUrl,
  });
}

module.exports = {
  classifyError,
  errorPresentation,
  errorHandler,
  notFoundHandler,
};
