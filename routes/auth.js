'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { clearSessionCookie, sessionCookie } = require('../src/auth/session-store');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');

function createAuthRouter({ config }) {
  const router = express.Router();
  const originRequired = requireAppOrigin(config);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/challenge', originRequired, (req, res, next) => {
    try {
      const account = requireHiveAccount(req.body?.account);
      const challenge = req.app.locals.services.keychainAuth.issueChallenge(account);
      res.status(201).json(challenge);
    } catch (error) {
      next(error);
    }
  });

  router.post('/verify', originRequired, async (req, res, next) => {
    try {
      const account = requireHiveAccount(req.body?.account);
      const { session, token } = await req.app.locals.services.keychainAuth.verify({
        challengeId: req.body?.challengeId,
        account,
        publicKey: String(req.body?.publicKey || ''),
        signature: String(req.body?.signature || ''),
      });
      res.set('Set-Cookie', sessionCookie(token, config));
      res.status(201).json({
        account: session.account,
        csrfToken: session.csrfToken,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/session', (req, res) => {
    if (!req.hiveSession) return res.json({ authenticated: false });
    return res.json({
      authenticated: true,
      account: req.hiveSession.account,
      csrfToken: req.hiveSession.csrfToken,
      issuedAt: req.hiveSession.issuedAt,
      expiresAt: req.hiveSession.expiresAt,
    });
  });

  router.post('/logout', originRequired, requireSession, requireCsrf, (req, res) => {
    req.app.locals.services.sessionStore.destroy(req.hiveSessionToken);
    res.set('Set-Cookie', clearSessionCookie(config));
    res.status(204).end();
  });

  return router;
}

module.exports = { createAuthRouter };
