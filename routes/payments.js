'use strict';

const express = require('express');
const { requireControlledAction, requireControlledMode } = require('./social');
const { FeatureUnavailableError } = require('../src/lib/errors');
const { requireAppOrigin, requireCsrf, requireSession } = require('../src/middleware/session');
const { decodeHivePaymentInvoice } = require('../src/payments/invoice-decoder');
const { RECEIPT_STATES } = require('../src/payments/receipt-store');

function responseRecord(record, config, message) {
  const confirmed = record.state === RECEIPT_STATES.CHAIN_CONFIRMED;
  const rebateAvailable = confirmed && config.distriator.enabled;
  return {
    ...record,
    paid: confirmed,
    rebate: {
      available: rebateAvailable,
      url: rebateAvailable ? config.distriator.claimUrl : null,
      external: true,
    },
    message,
  };
}

function requireMerchantBinding(config) {
  return (_req, _res, next) => {
    if (!config.payments.enabled || config.payments.merchantAccounts.length === 0) {
      return next(
        new FeatureUnavailableError(
          'Pay Tab is disabled until controlled mode and the merchant allowlist are configured',
        ),
      );
    }
    return next();
  };
}

function createPaymentRouter({ config, now = Date.now }) {
  const router = express.Router();
  const protectedReceipt = [
    requireAppOrigin(config),
    requireSession,
    requireCsrf,
  ];
  const protectedPayment = [
    ...protectedReceipt,
    requireControlledMode(config),
    requireControlledAction(config, 'payment'),
    requireMerchantBinding(config),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/recent', requireSession, (req, res, next) => {
    try {
      const record = req.app.locals.services.receiptStore.latest(
        req.hiveSession.id,
        req.hiveSession.account,
      );
      res.json(record ? responseRecord(record, config, 'Most recent durable receipt loaded.') : null);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', requireSession, (req, res, next) => {
    try {
      const record = req.app.locals.services.receiptStore.get(
        req.params.id,
        req.hiveSession.id,
        req.hiveSession.account,
      );
      res.json(responseRecord(record, config, 'Durable receipt loaded.'));
    } catch (error) {
      next(error);
    }
  });

  router.post('/preflight', ...protectedPayment, (req, res, next) => {
    try {
      const envelope = decodeHivePaymentInvoice(req.body?.uri, {
        account: req.hiveSession.account,
        merchantAccounts: config.payments.merchantAccounts,
        maxHbd: config.payments.maxHbd,
      });
      const record = req.app.locals.services.receiptStore.createValidated({
        sessionId: req.hiveSession.id,
        envelope,
      });
      res.status(201).json(
        responseRecord(
          record,
          config,
          'Invoice validated. Review the immutable transfer before opening Hive Keychain.',
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/awaiting-signature', ...protectedPayment, (req, res, next) => {
    try {
      const record = req.app.locals.services.receiptStore.markAwaitingSignature(
        req.params.id,
        req.hiveSession.id,
        req.hiveSession.account,
      );
      res.json(responseRecord(record, config, 'Exact review accepted; one Keychain request may open.'));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/cancel', ...protectedReceipt, (req, res, next) => {
    try {
      const record = req.app.locals.services.receiptStore.cancel(
        req.params.id,
        req.hiveSession.id,
        req.hiveSession.account,
      );
      res.json(responseRecord(record, config, 'Cancelled before broadcast. Nothing was paid.'));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/accepted', ...protectedPayment, (req, res, next) => {
    try {
      const record = req.app.locals.services.receiptStore.markBroadcastAccepted(
        req.params.id,
        req.hiveSession.id,
        req.body?.transactionId,
        req.hiveSession.account,
      );
      req.log.info(
        {
          account: record.account,
          merchant: record.merchant,
          amount: record.amount,
          fingerprint: record.fingerprint,
          transactionId: record.transactionId,
        },
        'controlled Pay Tab broadcast accepted by Keychain',
      );
      res.json(
        responseRecord(
          record,
          config,
          record.transactionId
            ? 'Broadcast accepted by Keychain; payment is pending exact confirmation on two Hive nodes.'
            : 'Broadcast accepted without a transaction id. Do not retry; the receipt remains pending for manual reconciliation.',
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/observe', ...protectedReceipt, async (req, res, next) => {
    try {
      let record = req.app.locals.services.receiptStore.get(
        req.params.id,
        req.hiveSession.id,
        req.hiveSession.account,
      );
      const observation = record.transactionId
        ? await req.app.locals.services.paymentObserver.observe(record)
        : {
            status: 'pending',
            diagnostic: 'No transaction id was returned; do not retry and reconcile this pending receipt manually',
          };
      record = req.app.locals.services.receiptStore.applyObservation(
        req.params.id,
        req.hiveSession.id,
        observation,
        req.hiveSession.account,
      );
      const broadcastAtMs = Date.parse(record.broadcastAt || '');
      if (
        record.state === RECEIPT_STATES.BROADCAST_ACCEPTED &&
        Number.isFinite(broadcastAtMs) &&
        now() - broadcastAtMs >= config.payments.confirmationTimeoutMs
      ) {
        record = req.app.locals.services.receiptStore.markConfirmationTimeout(
          req.params.id,
          req.hiveSession.id,
          undefined,
          req.hiveSession.account,
        );
      }

      let message = record.diagnostic || 'Payment remains pending. Recheck the chain before paying again.';
      if (record.state === RECEIPT_STATES.CHAIN_CONFIRMED) {
        message = `Paid — exact transfer confirmed independently in Hive block ${record.blockNumber}.`;
        req.log.info(
          {
            account: record.account,
            merchant: record.merchant,
            amount: record.amount,
            fingerprint: record.fingerprint,
            transactionId: record.transactionId,
            blockNumber: record.blockNumber,
          },
          'controlled Pay Tab transfer confirmed on two Hive nodes',
        );
      } else if (record.state === RECEIPT_STATES.CONFIRMATION_TIMEOUT) {
        message = 'Confirmation timed out. The receipt is still pending; recheck the chain and do not pay again.';
      }
      res.json(responseRecord(record, config, message));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createPaymentRouter, requireMerchantBinding, responseRecord };
