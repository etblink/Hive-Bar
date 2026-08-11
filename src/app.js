'use strict';

const path = require('node:path');
const compression = require('compression');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const { loadConfig } = require('./config');
const { HiveReadService } = require('./hive/read-service');
const { HiveRpcPool } = require('./hive/rpc-pool');
const { createLogger } = require('./lib/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const { requestContext } = require('./middleware/request-context');
const { createHealthRouter } = require('./routes/health');

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
        frameSrc: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https://images.hive.blog'],
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

  const hiveReads = options.hiveReadService || new HiveReadService(rpcPool, { now: options.now });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');

  app.locals.config = config;
  app.locals.siteName = config.site.name;
  app.locals.business = config.site.business;
  app.locals.communityId = config.hive.communityId;
  app.locals.threadsContainerAccount = config.hive.threadsContainerAccount;
  app.locals.writesEnabled = config.hive.writesEnabled;
  app.locals.currentYear = new Date().getUTCFullYear();
  app.locals.formatPayout = (item) => {
    const value = item?.payout ?? 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
  };
  app.locals.formatHiveDate = (value) => {
    const date = new Date(value && !String(value).endsWith('Z') ? `${value}Z` : value);
    if (!Number.isFinite(date.getTime())) return 'Date unavailable';
    return `${new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date)} UTC`;
  };
  app.locals.formatNumber = (value, digits = 3) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('en-US', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })
      : Number(0).toFixed(digits);
  };

  app.locals.services = { hiveReads, logger, rpcPool };

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
