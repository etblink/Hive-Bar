'use strict';

const express = require('express');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');
const {
  BROWSER_MODULE_MOUNTS,
  ONBOARDING_IMPORT_MAP_TEXT,
  authorizeOnboardingImportMap,
} = require('../src/onboarding/browser-modules');
const { parseOnboardingConfig } = require('../src/onboarding/config');
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
  if (req.app.locals.services.onboardingService) return req.app.locals.services.onboardingService;
  const environment = req.app.locals.onboardingEnvironment || process.env;
  const config = parseOnboardingConfig(environment, req.app.locals.config.hive);
  const service = new OnboardingService({
    rpcPool: req.app.locals.services.rpcPool,
    config,
    now: req.app.locals.onboardingNow || Date.now,
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
      if (onboarding.active) authorizeOnboardingImportMap(res);
      res.render('pages/onboarding/index', {
        pageTitle: `Create a Hive account — ${res.app.locals.siteName}`,
        onboarding,
        onboardingImportMap: onboarding.active ? ONBOARDING_IMPORT_MAP_TEXT : '',
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/onboarding/staff/:requestId', (req, res, next) => {
    try {
      const service = getService(req);
      const view = service.staffView(req.params.requestId, req.hiveSession?.account || null);
      res.render('pages/onboarding/staff', {
        pageTitle: `Bartender account setup — ${res.app.locals.siteName}`,
        onboarding: service.publicConfig(),
        ...view,
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

  router.post('/api/onboarding/requests', requireAppOriginFromRequest, async (req, res, next) => {
    try {
      const request = await getService(req).createRequest(req.body);
      res.status(201).json({
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
    (req, res, next) => {
      try {
        res.json(getService(req).beginBroadcast(req.params.requestId, {
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
          request: await getService(req).observe(req.params.requestId, {
            staffAccount: req.hiveSession.account,
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function requireAppOriginFromRequest(req, res, next) {
  return requireAppOrigin(req.app.locals.config)(req, res, next);
}

module.exports = { createOnboardingRouter, getService };
