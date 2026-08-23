'use strict';

const express = require('express');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');
const {
  BROWSER_MODULE_MOUNTS,
  ONBOARDING_IMPORT_MAP_TEXT,
  authorizeOnboardingImportMap,
} = require('../src/onboarding/browser-modules');
const { parseOnboardingConfig } = require('../src/onboarding/config');
const { OnboardingRequestStore } = require('../src/onboarding/request-store');
const { OnboardingService } = require('../src/onboarding/service');

const browserModuleStaticOptions = Object.freeze({
  dotfiles: 'deny',
  etag: true,
  fallthrough: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0, must-revalidate');
  },
});

function getService(req) {
  const environment = req.app.locals.onboardingEnvironment;
  if (environment) {
    if (req.app.locals.onboardingEnvironmentService) return req.app.locals.onboardingEnvironmentService;
    const config = parseOnboardingConfig(environment, req.app.locals.config.hive);
    const now = req.app.locals.onboardingNow || Date.now;
    const store = config.active
      ? new OnboardingRequestStore({
          ttlMs: config.requestTtlMs,
          now,
          maxLiveRequests: config.maxLiveRequests,
          maxDailyRequests: config.maxDailyRequests,
        })
      : undefined;
    const service = new OnboardingService({
      rpcPool: req.app.locals.services.rpcPool,
      config,
      store,
      now,
      unavailableCause: config.enabled && !store
        ? new Error('Onboarding test environment store is unavailable')
        : null,
    });
    req.app.locals.onboardingEnvironmentService = service;
    return service;
  }

  if (req.app.locals.services.onboardingService) return req.app.locals.services.onboardingService;
  const config = parseOnboardingConfig(process.env, req.app.locals.config.hive);
  const service = new OnboardingService({
    rpcPool: req.app.locals.services.rpcPool,
    config,
    now: req.app.locals.onboardingNow || Date.now,
    unavailableCause: config.enabled
      ? new Error('Onboarding service was not initialized at application startup')
      : new Error('In-person onboarding is disabled'),
  });
  req.app.locals.services.onboardingService = service;
  return service;
}

function requireJavascriptModule(req, res, next) {
  if (!/\.m?js$/u.test(req.path)) {
    res.status(404).end();
    return;
  }
  next();
}

function onboardingRequestRateLimit(req, res, next) {
  const service = getService(req);
  const config = service.config;
  const now = (req.app.locals.onboardingNow || Date.now)();
  const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const buckets = req.app.locals.onboardingRequestRateBuckets || new Map();
  req.app.locals.onboardingRequestRateBuckets = buckets;

  if (buckets.size >= 1000) {
    for (const [bucketKey, candidate] of buckets) {
      if (now - candidate.startedAt >= config.requestRateWindowMs) buckets.delete(bucketKey);
    }
  }
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= config.requestRateWindowMs) {
    if (!bucket && buckets.size >= 1000) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
    bucket = { startedAt: now, count: 0 };
    buckets.set(key, bucket);
  }
  if (bucket.count >= config.requestRateMax) {
    res.status(429).json({
      error: {
        code: 'ONBOARDING_RATE_LIMITED',
        message: 'Too many onboarding requests from this connection; ask staff before trying again.',
        requestId: req.id,
      },
    });
    return;
  }
  bucket.count += 1;
  next();
}

function createOnboardingRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (
      req.path === '/create-account' ||
      req.path.startsWith('/onboarding/') ||
      req.path.startsWith('/api/onboarding/')
    ) {
      res.set('Cache-Control', 'no-store');
    }
    next();
  });

  for (const mount of BROWSER_MODULE_MOUNTS) {
    router.use(
      mount.urlPrefix,
      requireJavascriptModule,
      express.static(mount.root, browserModuleStaticOptions),
    );
  }

  router.get('/create-account', (req, res, next) => {
    try {
      const onboarding = getService(req).publicConfig();
      if (onboarding.active && onboarding.available) authorizeOnboardingImportMap(res);
      res.status(onboarding.enabled && !onboarding.available ? 503 : 200).render('pages/onboarding/index', {
        pageTitle: `Create a Hive account — ${res.app.locals.siteName}`,
        onboarding,
        onboardingImportMap: onboarding.active && onboarding.available ? ONBOARDING_IMPORT_MAP_TEXT : '',
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/onboarding/staff/:requestId', (req, res, next) => {
    try {
      const service = getService(req);
      const onboarding = service.publicConfig();
      if (onboarding.enabled && !onboarding.available) {
        res.status(503).render('pages/onboarding/staff', {
          pageTitle: `Bartender account setup — ${res.app.locals.siteName}`,
          onboarding,
          request: null,
          authorized: false,
        });
        return;
      }
      const view = service.staffView(req.params.requestId, req.hiveSession?.account || null);
      res.render('pages/onboarding/staff', {
        pageTitle: `Bartender account setup — ${res.app.locals.siteName}`,
        onboarding,
        ...view,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/onboarding/manage', requireSession, (req, res, next) => {
    try {
      const service = getService(req);
      const onboarding = service.publicConfig();
      const management = service.management(req.hiveSession.account);
      res.render('pages/onboarding/manage', {
        pageTitle: `Onboarding requests — ${res.app.locals.siteName}`,
        onboarding,
        ...management,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/onboarding/username/:username', async (req, res, next) => {
    try {
      res.json(await getService(req).checkUsername(req.params.username));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/api/onboarding/requests',
    requireAppOriginFromRequest,
    onboardingRequestRateLimit,
    async (req, res, next) => {
      try {
        const result = await getService(req).createRequest(req.body);
        const request = result.request;
        res.status(result.reused ? 200 : 201).json({
          request,
          reused: result.reused,
          staffUrl: `${req.app.locals.config.auth.appOrigin}/onboarding/staff/${request.id}`,
          statusUrl: `/api/onboarding/requests/${request.id}`,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/api/onboarding/recover/:idempotencyKey', (req, res, next) => {
    try {
      const request = getService(req).recoverByIdempotency(req.params.idempotencyKey);
      res.json({
        request,
        staffUrl: `${req.app.locals.config.auth.appOrigin}/onboarding/staff/${request.id}`,
        statusUrl: `/api/onboarding/requests/${request.id}`,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/onboarding/requests/:requestId', async (req, res, next) => {
    try {
      res.json({ request: await getService(req).status(req.params.requestId) });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/api/onboarding/requests/:requestId/resource-readiness',
    requireSession,
    async (req, res, next) => {
      try {
        res.json(await getService(req).resourceReadiness(req.params.requestId, {
          staffAccount: req.hiveSession.account,
        }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/onboarding/requests/:requestId/prepare',
    requireAppOriginFromRequest,
    requireSession,
    requireCsrf,
    async (req, res, next) => {
      try {
        const prepared = await getService(req).prepare(req.params.requestId, {
          staffAccount: req.hiveSession.account,
          cashConfirmed: req.body?.cashConfirmed === true,
        });
        res.json(prepared);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/onboarding/requests/:requestId/begin-broadcast',
    requireAppOriginFromRequest,
    requireSession,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json(await getService(req).beginBroadcast(req.params.requestId, {
          staffAccount: req.hiveSession.account,
        }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/onboarding/requests/:requestId/broadcast-result',
    requireAppOriginFromRequest,
    requireSession,
    requireCsrf,
    (req, res, next) => {
      try {
        res.json({
          request: getService(req).recordBroadcast(req.params.requestId, {
            staffAccount: req.hiveSession.account,
            transactionId: req.body?.transactionId || null,
            ambiguous: req.body?.ambiguous === true,
            cancelled: req.body?.cancelled === true,
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/onboarding/requests/:requestId/cancel',
    requireAppOriginFromRequest,
    requireSession,
    requireCsrf,
    (req, res, next) => {
      try {
        res.json({
          request: getService(req).cancel(req.params.requestId, {
            staffAccount: req.hiveSession.account,
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/api/onboarding/requests/:requestId/staff-status',
    requireSession,
    async (req, res, next) => {
      try {
        res.json({
          request: await getService(req).staffStatus(
            req.params.requestId,
            req.hiveSession.account,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/api/onboarding/manage', requireSession, (req, res, next) => {
    try {
      res.json(getService(req).management(req.hiveSession.account));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireAppOriginFromRequest(req, res, next) {
  return requireAppOrigin(req.app.locals.config)(req, res, next);
}

module.exports = {
  createOnboardingRouter,
  getService,
  onboardingRequestRateLimit,
};
