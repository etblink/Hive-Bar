'use strict';

const express = require('express');
const { FeatureUnavailableError, AuthorizationError, ValidationError } = require('../src/lib/errors');
const { buildSocialOperation, createPermlink } = require('../src/hive/social-operations');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');

const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/i;
const CONTENT_ACTIONS = new Set(['post', 'thread', 'comment']);

function requireControlledMode(config) {
  return (req, _res, next) => {
    if (config.hive.writeMode !== 'controlled') {
      return next(
        new FeatureUnavailableError(
          'Hive social broadcasts are disabled. An individually authorized controlled-write run is required.',
        ),
      );
    }
    if (!config.hive.controlledAccounts.includes(req.hiveSession.account)) {
      return next(
        new AuthorizationError('This Hive account is not allowlisted for the controlled-write run', {
          code: 'CONTROLLED_ACCOUNT_NOT_ALLOWED',
        }),
      );
    }
    return next();
  };
}

function withGeneratedPermlink(action, body) {
  const payload = { ...(body || {}) };
  if (CONTENT_ACTIONS.has(action) && !payload.permlink) {
    payload.permlink = createPermlink(action === 'post' ? payload.title : payload.body);
  }
  return payload;
}

function createSocialRouter({ config }) {
  const router = express.Router();
  const protectedWrite = [
    requireAppOrigin(config),
    requireSession,
    requireCsrf,
    requireControlledMode(config),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/preflight/:action', ...protectedWrite, async (req, res, next) => {
    try {
      const action = String(req.params.action || '').toLowerCase();
      const payload = withGeneratedPermlink(action, req.body);
      let threadContainer;
      if (action === 'thread') {
        const threads = await req.app.locals.services.hiveReads.getLatestThreads(
          config.hive.threadsContainerAccount,
        );
        if (!threads.container) {
          throw new FeatureUnavailableError('No current thread container is available');
        }
        threadContainer = threads.container;
      }
      const envelope = buildSocialOperation(action, {
        account: req.hiveSession.account,
        payload,
        config,
        threadContainer,
      });
      const preflight = req.app.locals.services.preflightStore.create({
        sessionId: req.hiveSession.id,
        envelope,
      });
      res.status(201).json({ ...preflight, broadcastMode: 'controlled' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/cancel', ...protectedWrite, (req, res, next) => {
    try {
      req.app.locals.services.preflightStore.cancel(req.params.id, req.hiveSession.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/accepted', ...protectedWrite, (req, res, next) => {
    try {
      const rawTransactionId = req.body?.transactionId;
      const transactionId = rawTransactionId ? String(rawTransactionId) : null;
      if (transactionId && !TRANSACTION_ID_PATTERN.test(transactionId)) {
        throw new ValidationError('A valid Hive transaction id is required');
      }
      const preflight = req.app.locals.services.preflightStore.markAccepted(
        req.params.id,
        req.hiveSession.id,
        transactionId?.toLowerCase() || null,
      );
      req.log.info(
        {
          account: preflight.account,
          action: preflight.action,
          fingerprint: preflight.fingerprint,
          transactionId: preflight.transactionId,
        },
        'controlled Hive broadcast accepted by Keychain',
      );
      res.json({
        ...preflight,
        message: transactionId
          ? 'Broadcast accepted by Keychain; awaiting observation through Hive RPC.'
          : 'Broadcast accepted by Keychain without a transaction id; awaiting observation and automatic retry is blocked.',
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/observe', ...protectedWrite, async (req, res, next) => {
    try {
      const record = req.app.locals.services.preflightStore.get(
        req.params.id,
        req.hiveSession.id,
      );
      const observed = await req.app.locals.services.hiveReads.observeSocialOperation(record);
      const preflight = req.app.locals.services.preflightStore.markObserved(
        req.params.id,
        req.hiveSession.id,
        observed,
      );
      if (preflight.state === 'observed') {
        req.log.info(
          {
            account: preflight.account,
            action: preflight.action,
            fingerprint: preflight.fingerprint,
            transactionId: preflight.transactionId,
          },
          'controlled Hive operation observed on-chain',
        );
      }
      res.json({
        ...preflight,
        message:
          preflight.state === 'observed'
            ? 'Operation observed through Hive RPC.'
            : 'Broadcast accepted; the operation is not observable through Hive RPC yet.',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { TRANSACTION_ID_PATTERN, createSocialRouter, requireControlledMode };
