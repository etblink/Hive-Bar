'use strict';

const { randomBytes } = require('node:crypto');
const { ConflictError, NotFoundError } = require('../lib/errors');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function clone(record) {
  return record ? structuredClone(record) : null;
}

class OnboardingRequestStore {
  constructor({ ttlMs = 15 * 60 * 1000, now = Date.now, createId } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.createId = createId || (() => randomBytes(32).toString('base64url'));
    this.records = new Map();
  }

  create({ username, publicKeys }) {
    const nowMs = this.now();
    let id;
    do {
      id = this.createId();
    } while (this.records.has(id));

    if (!REQUEST_ID_PATTERN.test(id)) throw new TypeError('Onboarding request id is invalid');

    const record = {
      id,
      username,
      publicKeys: { ...publicKeys },
      status: 'pending',
      createdAt: nowMs,
      expiresAt: nowMs + this.ttlMs,
      cashConfirmedAt: null,
      preparedAt: null,
      prepared: null,
      signingStartedAt: null,
      broadcastRecordedAt: null,
      transactionId: null,
      ambiguous: false,
      completedAt: null,
      conflictReason: null,
    };
    this.records.set(id, record);
    return clone(record);
  }

  get(id) {
    if (!REQUEST_ID_PATTERN.test(String(id || ''))) throw new NotFoundError('Onboarding request not found');
    const record = this.records.get(id);
    if (!record) throw new NotFoundError('Onboarding request not found');
    this.#expire(record);
    return clone(record);
  }

  update(id, updater) {
    if (!REQUEST_ID_PATTERN.test(String(id || ''))) throw new NotFoundError('Onboarding request not found');
    const record = this.records.get(id);
    if (!record) throw new NotFoundError('Onboarding request not found');
    this.#expire(record);
    const next = updater(clone(record));
    if (!next || next.id !== record.id) throw new TypeError('Onboarding request update is invalid');
    this.records.set(id, next);
    return clone(next);
  }

  requireLive(id) {
    const record = this.get(id);
    if (record.status === 'expired') {
      throw new ConflictError('This onboarding request has expired. Start a new account request.', {
        code: 'ONBOARDING_EXPIRED',
      });
    }
    if (record.status === 'conflict') {
      throw new ConflictError('This onboarding request conflicts with current Hive state.', {
        code: 'ONBOARDING_CONFLICT',
      });
    }
    return record;
  }

  #expire(record) {
    if (
      this.now() >= record.expiresAt &&
      !['complete', 'conflict', 'expired'].includes(record.status)
    ) {
      record.status = 'expired';
    }
  }
}

module.exports = { OnboardingRequestStore, REQUEST_ID_PATTERN };
