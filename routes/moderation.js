'use strict';

const express = require('express');
const { AuthorizationError, FeatureUnavailableError } = require('../src/lib/errors');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');

function requireModerationOperator(config) {
  return (req, _res, next) => {
    if (!config.moderation.enabled) {
      return next(
        new FeatureUnavailableError('Merchant-local moderation is not enabled.', {
          code: 'MODERATION_DISABLED',
        }),
      );
    }
    if (!req.hiveSession || !config.moderation.operatorAccounts.includes(req.hiveSession.account)) {
      return next(
        new AuthorizationError('This verified Hive account is not a moderation operator.', {
          code: 'MODERATION_OPERATOR_REQUIRED',
        }),
      );
    }
    return next();
  };
}

function createModerationRouter({ config }) {
  const router = express.Router();
  const requireOperator = requireModerationOperator(config);
  const protectedWrite = [
    requireAppOrigin(config),
    requireSession,
    requireCsrf,
    requireOperator,
  ];

  router.get('/moderation', requireSession, requireOperator, (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const data = req.app.locals.services.moderation.managementData();
      return res.render('pages/moderation/index', {
        pageTitle: `Moderation — ${config.site.name}`,
        moderationOperator: req.hiveSession.account,
        ...data,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/moderation/hide', ...protectedWrite, (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const result = req.app.locals.services.moderation.hide({
        targetType: req.body?.targetType,
        author: req.body?.author,
        permlink: req.body?.permlink,
        reason: req.body?.reason,
        operator: req.hiveSession.account,
      });
      return res.status(result.changed ? 201 : 200).json({
        ...result,
        message: result.changed
          ? 'Hidden from Fourth Street Bar. Hive content was not changed.'
          : 'This target was already hidden from Fourth Street Bar.',
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/moderation/unhide', ...protectedWrite, (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const result = req.app.locals.services.moderation.unhide({
        targetId: req.body?.targetId,
        reason: req.body?.reason,
        operator: req.hiveSession.account,
      });
      return res.json({
        ...result,
        message: result.changed
          ? 'Restored to Fourth Street Bar presentation. Hive content was not changed.'
          : 'This target was already visible on Fourth Street Bar.',
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createModerationRouter, requireModerationOperator };
