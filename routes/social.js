'use strict';

const express = require('express');
const { FeatureUnavailableError, AuthorizationError, ValidationError } = require('../src/lib/errors');
const { buildSocialOperation, createPermlink } = require('../src/hive/social-operations');
const { recordPilotTerminal } = require('../src/social/pilot-terminal-marker');
const { appendOperatorAudit } = require('../src/social/operator-audit');
const { assertM10OperatorArmActive } = require('../src/social/operator-posting-mode');
const { resolvePostingIdentity } = require('../src/social/delegated-posting-mode');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');

const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/i;
const CONTENT_ACTIONS = new Set(['post', 'thread', 'comment']);
const BETA_M16_3_ACTIONS = new Set(['vote']);

function requireControlledMode(config) {
  return async (req, _res, next) => {
    if (config.hive.writeMode !== 'controlled') {
      return next(
        new FeatureUnavailableError(
          'Hive social broadcasts are disabled. An individually authorized controlled-write run is required.',
        ),
      );
    }
    try {
      assertM10OperatorArmActive(config);
      req.hivePostingIdentity = await resolvePostingIdentity({
        config,
        signer: req.hiveSession.account,
        authorityVerifier: req.app.locals.services.authorityVerifier,
      });
      if (
        req.hivePostingIdentity.author === req.hivePostingIdentity.signer &&
        !config.hive.controlledAccounts.includes(req.hiveSession.account)
      ) {
        throw new AuthorizationError('This Hive account is not allowlisted for the controlled-write run', {
          code: 'CONTROLLED_ACCOUNT_NOT_ALLOWED',
        });
      }
    } catch (error) {
      return next(error);
    }
    return next();
  };
}

function requireSocialWriteMode(config) {
  const controlled = requireControlledMode(config);
  return async (req, res, next) => {
    if (config.hive.writeMode !== 'beta') {
      return controlled(req, res, next);
    }
    if (!config.hive.betaSelfSigningEnabled || config.hive.signerMode !== 'keychain') {
      return next(
        new FeatureUnavailableError('Beta self-signing requires Hive Keychain.', {
          code: 'BETA_KEYCHAIN_REQUIRED',
        }),
      );
    }
    req.hivePostingIdentity = Object.freeze({
      author: req.hiveSession.account,
      signer: req.hiveSession.account,
      mode: 'beta-self',
    });
    return next();
  };
}

function assertControlledAction(config, action) {
  if (!config.hive.controlledActions.includes(action)) {
    throw new FeatureUnavailableError(
      `The ${action} action is disabled for this controlled-write run.`,
      { code: 'CONTROLLED_ACTION_NOT_ALLOWED' },
    );
  }
}

function assertSocialAction(config, action) {
  if (config.hive.writeMode === 'beta') {
    if (!config.hive.betaSelfActions.includes(action) && !BETA_M16_3_ACTIONS.has(action)) {
      throw new FeatureUnavailableError(
        `The ${action} action is not enabled for beta self-signing.`,
        { code: 'BETA_ACTION_NOT_ALLOWED' },
      );
    }
    return;
  }
  assertControlledAction(config, action);
}

function requireControlledAction(config, action) {
  return (_req, _res, next) => {
    try {
      assertControlledAction(config, action);
      next();
    } catch (error) {
      next(error);
    }
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
    requireSocialWriteMode(config),
  ];
  const controlledRun = config.hive.writeMode === 'controlled';

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/preflight/:action', ...protectedWrite, async (req, res, next) => {
    try {
      const action = String(req.params.action || '').toLowerCase();
      assertSocialAction(config, action);
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
        account: req.hivePostingIdentity.author,
        payload,
        config,
        threadContainer,
      });
      const preflight = req.app.locals.services.preflightStore.create({
        sessionId: req.hiveSession.id,
        envelope,
        signer: req.hivePostingIdentity.signer,
      });
      if (controlledRun) appendOperatorAudit(config, 'prepared', preflight);
      res.status(201).json({
        ...preflight,
        broadcastMode: config.hive.writeMode === 'beta' ? 'beta-self' : 'controlled',
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight/:id/cancel', ...protectedWrite, (req, res, next) => {
    try {
      const preflight = req.app.locals.services.preflightStore.get(req.params.id, req.hiveSession.id);
      req.app.locals.services.preflightStore.cancel(req.params.id, req.hiveSession.id);
      if (controlledRun) {
        recordPilotTerminal(config, preflight, 'cancelled');
        appendOperatorAudit(config, 'cancelled', preflight);
      }
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
      if (controlledRun) appendOperatorAudit(config, 'keychain_accepted', preflight);
      req.log.info(
        {
          account: preflight.account,
          signer: preflight.signer,
          action: preflight.action,
          fingerprint: preflight.fingerprint,
          transactionId: preflight.transactionId,
          broadcastMode: config.hive.writeMode === 'beta' ? 'beta-self' : 'controlled',
        },
        'Hive social broadcast accepted by Keychain',
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
        if (controlledRun) {
          recordPilotTerminal(config, preflight, 'observed');
          appendOperatorAudit(config, 'observed', preflight);
        }
        req.log.info(
          {
            account: preflight.account,
            signer: preflight.signer,
            action: preflight.action,
            fingerprint: preflight.fingerprint,
            transactionId: preflight.transactionId,
            broadcastMode: config.hive.writeMode === 'beta' ? 'beta-self' : 'controlled',
          },
          'Hive social operation observed on-chain',
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

module.exports = {
  BETA_M16_3_ACTIONS,
  TRANSACTION_ID_PATTERN,
  assertControlledAction,
  assertSocialAction,
  createSocialRouter,
  requireControlledAction,
  requireControlledMode,
  requireSocialWriteMode,
};
