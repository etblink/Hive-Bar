'use strict';

const path = require('node:path');
const express = require('express');
const { createApp } = require('../../src/app');
const { SessionStore } = require('../../src/auth/session-store');
const { createStaticAssetUrl } = require('../../src/release/static-assets');
const { configFrom, logger } = require('./test-app');
const { createUx1aRpc } = require('./ux-1a-fixture');

const ROOT = path.join(__dirname, '..', '..');
const ACCOUNT = 'etblink';

function createUx1bVisualFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: 'ux-1b-visual-session-secret-that-is-at-least-32-bytes',
  });
  const rpcPool = createUx1aRpc({ populated: true });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(ACCOUNT);
  const application = createApp({ config, logger, rpcPool, sessionStore });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'UX_1B_VISUAL_MUTATION_FORBIDDEN' } });
  });
  app.use(application);
  return { account: ACCOUNT, app, config, mutationAttempts, rpcPool, token };
}

module.exports = { createUx1bVisualFixture };
