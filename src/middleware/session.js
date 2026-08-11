'use strict';

const { AuthorizationError } = require('../lib/errors');
const { SESSION_COOKIE_NAME, parseCookies } = require('../auth/session-store');

function sessionContext(sessionStore) {
  return (req, res, next) => {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE_NAME] || '';
    const session = sessionStore.get(token);
    req.hiveSession = session;
    req.hiveSessionToken = token;
    res.locals.hiveSession = session
      ? { account: session.account, expiresAt: session.expiresAt }
      : null;
    next();
  };
}

function requireSession(req, _res, next) {
  if (!req.hiveSession) {
    return next(
      new AuthorizationError('Sign in with Hive Keychain before using this action', {
        code: 'SESSION_REQUIRED',
        statusCode: 401,
      }),
    );
  }
  return next();
}

function requireCsrf(req, _res, next) {
  if (!req.hiveSession) return requireSession(req, _res, next);
  const supplied = String(req.get('x-csrf-token') || '');
  if (!supplied || supplied !== req.hiveSession.csrfToken) {
    return next(new AuthorizationError('The request security token is invalid', { code: 'CSRF_INVALID' }));
  }
  return next();
}

function requireAppOrigin(config) {
  return (req, _res, next) => {
    if (req.get('origin') !== config.auth.appOrigin) {
      return next(
        new AuthorizationError('The request origin is not allowed', {
          code: 'ORIGIN_NOT_ALLOWED',
        }),
      );
    }
    return next();
  };
}

module.exports = { requireAppOrigin, requireCsrf, requireSession, sessionContext };
