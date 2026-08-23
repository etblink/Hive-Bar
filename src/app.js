'use strict';

const path = require('node:path');
const compression = require('compression');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const { ChallengeStore, SessionStore } = require('./auth/session-store');
const { KeychainAuthService } = require('./auth/keychain-auth');
const { isBetaAction } = require('./beta/actions');
const { loadConfig } = require('./config');
const { PostingAuthorityVerifier } = require('./hive/posting-authority');
const { HiveReadService } = require('./hive/read-service');
const { HiveRpcPool } = require('./hive/rpc-pool');
const { PaymentObserver } = require('./payments/payment-observer');
const { ReceiptStore } = require('./payments/receipt-store');
const { createLogger } = require('./lib/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const { requestContext } = require('./middleware/request-context');
const { sessionContext } = require('./middleware/session');
const { ModerationService } = require('./moderation/moderation-service');
const { ModerationStore } = require('./moderation/moderation-store');
const { parseOnboardingConfig } = require('./onboarding/config');
const { ONBOARDING_SCHEMA_VERSION, OnboardingRequestStore } = require('./onboarding/request-store');
const { OnboardingService } = require('./onboarding/service');
const { readDeploymentIdentity } = require('./release/deployment-identity');
const { PreflightStore } = require('./social/preflight-store');
const { isM10OperatorArmActive } = require('./social/operator-posting-mode');
const { createHealthRouter } = require('./routes/health');
const { isV1Action } = require('./v1/actions');
const { createAuthRouter } = require('../routes/auth');
const { createM4Router } = require('../routes/m4');
const { createModerationRouter } = require('../routes/moderation');
const { createPaymentRouter } = require('../routes/payments');
const { createSocialRouter } = require('../routes/social');

function securityMiddleware(config) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'https://images.hive.blog'],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.hive.blog'],
        mediaSrc: ["'self'", 'blob:'],
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
  const deploymentIdentity =
    options.deploymentIdentity || readDeploymentIdentity({ rootDir: options.releaseRoot });
  const rpcPool =
    options.rpcPool ||
    new HiveRpcPool({
      nodes: config.hive.rpcNodes,
      timeoutMs: config.hive.rpcTimeoutMs,
      failureThreshold: config.hive.rpcFailureThreshold,
      cooldownMs: config.hive.rpcCooldownMs,
      logger,
    });

  const hiveReads =
    options.hiveReadService ||
    new HiveReadService(rpcPool, {
      now: options.now,
      messageHistoryPageSize: config.hive.messageHistoryPageSize,
    });
  const challengeStore =
    options.challengeStore ||
    new ChallengeStore({
      ttlMs: config.auth.challengeTtlMs,
      origin: config.auth.appOrigin,
      now: options.now,
    });
  const sessionStore =
    options.sessionStore ||
    new SessionStore({
      secret: config.auth.sessionSecret,
      ttlMs: config.auth.sessionTtlMs,
      now: options.now,
    });
  const authorityVerifier = options.authorityVerifier || new PostingAuthorityVerifier(rpcPool);
  const keychainAuth =
    options.keychainAuth ||
    new KeychainAuthService({ challengeStore, sessionStore, authorityVerifier });
  const preflightStore =
    options.preflightStore ||
    new PreflightStore({ ttlMs: config.auth.preflightTtlMs, now: options.now });
  const receiptStore =
    options.receiptStore ||
    new ReceiptStore({ filename: config.payments.receiptDbPath, now: options.now });
  const paymentObserver =
    options.paymentObserver ||
    (typeof rpcPool.callNode === 'function'
      ? new PaymentObserver({ rpcPool, nodeUrls: config.hive.rpcNodes })
      : {
          async observe() {
            throw new TypeError('Independent Hive RPC-node access is unavailable');
          },
        });

  let moderationStore = options.moderationStore || null;
  let moderationStoreError = null;
  if (config.moderation.enabled && !moderationStore) {
    try {
      moderationStore = new ModerationStore({
        filename: config.moderation.dbPath,
        now: options.now,
        requireExisting: config.isProduction,
      });
    } catch (error) {
      moderationStoreError = error;
      logger.error({ err: error }, 'moderation store unavailable; Community moderation will fail closed');
    }
  }
  const moderation =
    options.moderationService ||
    new ModerationService({
      config,
      hiveReads,
      store: moderationStore,
      unavailableCause: moderationStoreError,
    });

  const onboardingEnvironment = options.onboardingEnvironment || process.env;
  const onboardingConfig = options.onboardingConfig || parseOnboardingConfig(onboardingEnvironment, config.hive);
  let onboardingStore = options.onboardingStore || null;
  let onboardingStoreError = null;
  if (onboardingConfig.enabled && !onboardingStore) {
    try {
      onboardingStore = new OnboardingRequestStore({
        filename: onboardingConfig.dbPath,
        ttlMs: onboardingConfig.requestTtlMs,
        now: options.now,
        requireExisting: config.isProduction,
        maxLiveRequests: onboardingConfig.maxLiveRequests,
        maxDailyRequests: onboardingConfig.maxDailyRequests,
      });
    } catch (error) {
      onboardingStoreError = error;
      logger.error({ err: error }, 'onboarding store unavailable; in-person onboarding will fail closed');
    }
  }
  const onboardingService =
    options.onboardingService ||
    new OnboardingService({
      rpcPool,
      config: onboardingConfig,
      store: onboardingStore,
      now: options.now,
      unavailableCause: onboardingConfig.enabled
        ? onboardingStoreError
        : new Error('In-person onboarding is disabled'),
    });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');

  app.locals.config = config;
  app.locals.onboardingConfig = onboardingConfig;
  app.locals.siteName = config.site.name;
  app.locals.business = config.site.business;
  app.locals.communityId = config.hive.communityId;
  app.locals.threadsContainerAccount = config.hive.threadsContainerAccount;
  app.locals.writesEnabled = config.hive.writesEnabled;
  app.locals.signerMode = config.hive.signerMode;
  app.locals.buildLabel = deploymentIdentity.build;
  app.locals.showModerationControls = false;
  app.locals.canWriteAction = (action) => {
    if (config.hive.betaSelfSigningEnabled) return isBetaAction(action);
    if (config.hive.v1SelfSigningEnabled) return isV1Action(action);
    return (
      config.hive.writesEnabled &&
      config.hive.controlledActions.includes(action) &&
      isM10OperatorArmActive(config)
    );
  };
  app.locals.paymentsEnabled = config.payments.enabled;
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

  app.locals.services = {
    authorityVerifier,
    challengeStore,
    deploymentIdentity,
    hiveReads,
    keychainAuth,
    moderation,
    moderationStore,
    onboardingService,
    onboardingStore,
    preflightStore,
    paymentObserver,
    receiptStore,
    rpcPool,
    sessionStore,
  };

  app.use(requestContext(logger));
  app.use(securityMiddleware(config));
  app.use(sessionContext(sessionStore));
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
    maxAge: 0,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'private, no-cache, max-age=0, must-revalidate');
    },
  };
  app.use(express.static(path.join(__dirname, '..', 'public'), staticOptions));
  app.use('/htmx', express.static(path.dirname(require.resolve('htmx.org')), staticOptions));
  app.use(
    '/vendor/zxing',
    express.static(path.join(path.dirname(require.resolve('@zxing/browser')), '..', 'umd'), staticOptions),
  );

  const readinessChecks = [];
  if (onboardingConfig.enabled) {
    readinessChecks.push(() => {
      if (!onboardingStore) throw onboardingStoreError || new Error('Onboarding store unavailable');
      const health = onboardingStore.health();
      if (health.schemaVersion !== ONBOARDING_SCHEMA_VERSION) {
        throw new Error('Onboarding schema version mismatch');
      }
    });
  }
  app.use(createHealthRouter({ config, rpcPool, deploymentIdentity, readinessChecks }));

  app.use(
    '/auth',
    rateLimit({
      windowMs: config.server.rateLimit.windowMs,
      limit: config.server.authRateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({
          error: {
            code: 'AUTH_RATE_LIMITED',
            message: 'Too many sign-in attempts; please try again shortly',
            requestId: req.id,
          },
        }),
    }),
    createAuthRouter({ config }),
  );
  app.use(createModerationRouter({ config }));
  app.use('/api/social', createSocialRouter({ config }));
  app.use('/api/m4', createM4Router({ config }));
  app.use('/api/payments', createPaymentRouter({ config, now: options.now || Date.now }));

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
