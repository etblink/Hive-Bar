'use strict';

const path = require('node:path');
const express = require('express');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');
const { parseOnboardingConfig } = require('../src/onboarding/config');
const { OnboardingService } = require('../src/onboarding/service');

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

  router.get('/vendor/hive-tx/index.mjs', (_req, res, next) => {
    try {
      const dist = path.dirname(require.resolve('hive-tx'));
      res.sendFile(path.join(dist, 'index.mjs'));
    } catch (error) {
      next(error);
    }
  });

  router.get('/create-account', (req, res, next) => {
    try {
      const onboarding = getService(req).publicConfig();
      res.render('pages/onboarding/index', {
        pageTitle: `Create a Hive account — ${res.app.locals.siteName}`,
        onboarding,
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
