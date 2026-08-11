'use strict';

const path = require('node:path');
const compression = require('compression');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const { loadConfig } = require('./config');
const { plainTextExcerpt } = require('./content/markdown');
const { HiveRpcPool } = require('./hive/rpc-pool');
const { createLogger } = require('./lib/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const { requestContext } = require('./middleware/request-context');
const { createHealthRouter } = require('./routes/health');
const hiveClient = require('../utils/hiveClient');

function securityMiddleware(config) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'", 'https://www.google.com'],
        imgSrc: [
          "'self'",
          'data:',
          'https://fourthstreetbar.com',
          'https://images.hive.blog',
          'https://images.unsplash.com',
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: config.isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  });
}

function createApp(options = {}) {
  const config = options.config || loadConfig();
  const logger = options.logger || createLogger(config);
  const rpcPool =
    options.rpcPool ||
    new HiveRpcPool({
      nodes: config.hive.rpcNodes,
      timeoutMs: config.hive.rpcTimeoutMs,
      failureThreshold: config.hive.rpcFailureThreshold,
      cooldownMs: config.hive.rpcCooldownMs,
      logger,
    });

  hiveClient.configureHiveClient(rpcPool);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');

  app.locals.config = config;
  app.locals.siteName = config.site.name;
  app.locals.communityId = config.hive.communityId;
  app.locals.threadsContainerAccount = config.hive.threadsContainerAccount;
  app.locals.writesEnabled = config.hive.writesEnabled;
  app.locals.currentYear = new Date().getUTCFullYear();
  app.locals.plainTextExcerpt = plainTextExcerpt;
  app.locals.formatPayout = (item) => {
    const value = item?.pending_payout_value ?? item?.estimated_payout ?? 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
  };

  app.locals.services = { logger, rpcPool };

  app.use(requestContext(logger));
  app.use(securityMiddleware(config));
  app.use(
    rateLimit({
      windowMs: config.server.rateLimit.windowMs,
      limit: config.server.rateLimit.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path === '/healthz' || req.path === '/readyz',
      handler: (req, res) =>
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests; please try again shortly',
            requestId: req.id,
          },
        }),
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '32kb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }));

  const staticOptions = {
    dotfiles: 'deny',
    etag: true,
    fallthrough: true,
    maxAge: config.isProduction ? '1d' : 0,
  };
  app.use(express.static(path.join(__dirname, '..', 'public'), staticOptions));
  app.use('/htmx', express.static(path.dirname(require.resolve('htmx.org')), staticOptions));

  app.use(createHealthRouter({ config, rpcPool }));

  const indexRouter = require('../routes/index');
  const communityRouter = require('../routes/community');
  const profileRouter = require('../routes/profile');
  const commonRouter = require('../routes/common');
  const apiRouter = require('../routes/api');

  app.use('/', indexRouter);
  app.use('/community', communityRouter);
  app.use('/profile', profileRouter);
  app.use('/', commonRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
