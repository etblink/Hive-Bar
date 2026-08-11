'use strict';

const { randomBytes } = require('node:crypto');
const { AuthorizationError, ConflictError, NotFoundError } = require('../lib/errors');

function randomId() {
  return randomBytes(24).toString('base64url');
}

class PreflightStore {
  constructor({ ttlMs, now = Date.now, random = randomId } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.random = random;
    this.records = new Map();
    this.fingerprints = new Map();
  }

  create({ sessionId, envelope }) {
    this.prune();
    const duplicateKey = `${envelope.account}:${envelope.fingerprint}`;
    const duplicateId = this.fingerprints.get(duplicateKey);
    const duplicate = duplicateId ? this.records.get(duplicateId) : null;
    if (duplicate) {
      throw new ConflictError('An identical social operation is already prepared or awaiting observation', {
        code: 'DUPLICATE_OPERATION',
      });
    }

    const createdAtMs = this.now();
    const id = this.random();
    const record = {
      id,
      sessionId,
      account: envelope.account,
      action: envelope.action,
      authority: envelope.authority,
      operations: envelope.operations,
      fingerprint: envelope.fingerprint,
      summary: envelope.summary,
      state: 'prepared',
      transactionId: null,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.ttlMs).toISOString(),
      expiresAtMs: createdAtMs + this.ttlMs,
      observationChecks: 0,
      observedAt: null,
    };
    this.records.set(id, record);
    this.fingerprints.set(duplicateKey, id);
    return this.publicRecord(record);
  }

  get(id, sessionId) {
    const record = this.records.get(String(id || ''));
    if (!record) throw new NotFoundError('The social preflight was not found or has expired');
    if (record.expiresAtMs <= this.now()) {
      this.delete(record);
      throw new NotFoundError('The social preflight was not found or has expired');
    }
    if (record.sessionId !== sessionId) {
      throw new AuthorizationError('This social preflight belongs to another session', {
        code: 'PREFLIGHT_SESSION_MISMATCH',
      });
    }
    return record;
  }

  cancel(id, sessionId) {
    const record = this.get(id, sessionId);
    if (record.state !== 'prepared') {
      throw new ConflictError('A broadcast-accepted preflight cannot be cancelled', {
        code: 'PREFLIGHT_NOT_CANCELLABLE',
      });
    }
    this.delete(record);
  }

  markAccepted(id, sessionId, transactionId) {
    const record = this.get(id, sessionId);
    if (record.state === 'observed') return this.publicRecord(record);
    if (record.state === 'broadcast_accepted') {
      if (record.transactionId !== transactionId) {
        throw new ConflictError('This preflight already has a different transaction id', {
          code: 'TRANSACTION_ID_CONFLICT',
        });
      }
      return this.publicRecord(record);
    }
    record.state = 'broadcast_accepted';
    record.transactionId = transactionId;
    return this.publicRecord(record);
  }

  markObserved(id, sessionId, observed) {
    const record = this.get(id, sessionId);
    if (record.state === 'prepared') {
      throw new ConflictError('Keychain acceptance must be recorded before observation', {
        code: 'BROADCAST_ACCEPTANCE_REQUIRED',
      });
    }
    record.observationChecks += 1;
    if (observed) {
      record.state = 'observed';
      record.observedAt ||= new Date(this.now()).toISOString();
    }
    return this.publicRecord(record);
  }

  publicRecord(record) {
    return {
      id: record.id,
      account: record.account,
      action: record.action,
      authority: record.authority,
      operations: record.operations,
      fingerprint: record.fingerprint,
      summary: record.summary,
      state: record.state,
      transactionId: record.transactionId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      observationChecks: record.observationChecks,
      observedAt: record.observedAt,
    };
  }

  delete(record) {
    this.records.delete(record.id);
    this.fingerprints.delete(`${record.account}:${record.fingerprint}`);
  }

  prune() {
    const now = this.now();
    for (const record of this.records.values()) {
      if (record.expiresAtMs <= now) this.delete(record);
    }
  }
}

module.exports = { PreflightStore };
