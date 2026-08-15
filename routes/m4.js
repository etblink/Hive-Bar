'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { buildM4Operation, M4_ACTIONS } = require('../src/hive/m4-operations');
const { ValidationError } = require('../src/lib/errors');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');
const { TRANSACTION_ID_PATTERN, assertControlledAction, requireControlledMode } = require('./social');

function requireM4Record(store, id, sessionId) {
  const record = store.get(id, sessionId);
  if (!M4_ACTIONS.has(record.action)) {
    throw new ValidationError('The preflight is not an M4 operation');
  }
  return record;
}

function createM4Router({ config }) {
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

  router.get('/wall-fee/:recipient', async (req, res, next) => {
    try {
      const recipient = requireHiveAccount(req.params.recipient, 'Message recipient');
      const settings = await req.app.locals.services.hiveReads.getProfileSettings(recipient, {
        defaultWallFee: config.hive.defaultWallFee,
      });
      res.json({ recipient, fee: settings.wallFee });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:action', ...protectedWrite, async (req, res, next) => {
    try {
      const action = String(req.params.action || '').toLowerCase();
      assertControlledAction(config, action);
      let envelope;
      if (action === 'profile') {
        const accountRecord = await req.app.locals.services.hiveReads.getAccountRecord(
          req.hiveSession.account,
        );
        envelope = buildM4Operation(action, {
          account: req.hiveSession.account,
          payload: req.body,
          rawMetadata: accountRecord.posting_json_metadata,
          config,
        });
      } else if (action === 'claim-rewards') {
        const accountRecord = await req.app.locals.services.hiveReads.getAccountRecord(
          req.hiveSession.account,
        );
        envelope = buildM4Operation(action, {
          account: req.hiveSession.account,
          accountRecord,
          config,
        });
      } else if (action === 'wall' || action === 'inbox') {
        const recipient = requireHiveAccount(req.body?.recipient, 'Message recipient');
        const recipientSettings = await req.app.locals.services.hiveReads.getProfileSettings(
          recipient,
          { defaultWallFee: config.hive.defaultWallFee },
        );
        envelope = buildM4Operation(action, {
          account: req.hiveSession.account,
          payload: req.body,
          recipientSettings,
          config,
        });
      } else {
        envelope = buildM4Operation(action, {
          account: req.hiveSession.account,
          payload: req.body,
          config,
        });
      }

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
      requireM4Record(
        req.app.locals.services.preflightStore,
        req.params.id,
        req.hiveSession.id,
      );
      req.app.locals.services.preflightStore.cancel(req.params.id, req.hiveSession.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/accepted', ...protectedWrite, (req, res, next) => {
    try {
      requireM4Record(
        req.app.locals.services.preflightStore,
        req.params.id,
        req.hiveSession.id,
      );
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
        'controlled M4 Hive broadcast accepted by Keychain',
      );
      res.json({
        ...preflight,
        message: transactionId
          ? 'Broadcast accepted by Keychain; awaiting exact transaction observation through Hive RPC.'
          : 'Broadcast accepted without a transaction id; automatic retry is blocked and observation cannot be completed.',
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/observe', ...protectedWrite, async (req, res, next) => {
    try {
      const record = requireM4Record(
        req.app.locals.services.preflightStore,
        req.params.id,
        req.hiveSession.id,
      );
      const observation = await req.app.locals.services.hiveReads.observeM4Operation(record);
      const preflight = req.app.locals.services.preflightStore.markObserved(
        req.params.id,
        req.hiveSession.id,
        observation,
      );
      if (preflight.state === 'observed') {
        req.log.info(
          {
            account: preflight.account,
            action: preflight.action,
            fingerprint: preflight.fingerprint,
            transactionId: preflight.transactionId,
            blockNumber: preflight.blockNumber,
          },
          'controlled M4 Hive operation observed on-chain',
        );
      }
      res.json({
        ...preflight,
        message:
          preflight.state === 'observed'
            ? `Exact operation observed in Hive block ${preflight.blockNumber || 'unknown'}.`
            : 'Broadcast accepted; the exact operation is not observable through Hive RPC yet.',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createM4Router, requireM4Record };
