'use strict';

const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ConflictError, NotFoundError, ValidationError } = require('../lib/errors');

const ONBOARDING_SCHEMA_VERSION = 1;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/;
const LIVE_STATUSES = Object.freeze(['pending', 'prepared', 'signing', 'observing']);
const EXPIRABLE_STATUSES = Object.freeze(['pending', 'prepared']);
const MUTATION_LANE_STATUSES = Object.freeze(['prepared', 'signing', 'observing']);
const TERMINAL_STATUSES = Object.freeze(['complete', 'conflict', 'expired', 'cancelled']);
const DAY_MS = 24 * 60 * 60 * 1000;

function onboardingId() {
  return randomBytes(32).toString('base64url');
}

function normalizeOpaque(value, pattern, label) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) throw new ValidationError(`${label} is invalid`);
  return normalized;
}

function normalizeTransactionId(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!TRANSACTION_ID_PATTERN.test(normalized)) {
    throw new ValidationError('Hive transaction id is invalid');
  }
  return normalized;
}

function publicKeysJson(publicKeys) {
  return JSON.stringify({
    owner: publicKeys.owner,
    active: publicKeys.active,
    posting: publicKeys.posting,
    memo: publicKeys.memo,
  });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Onboarding store contains invalid ${label}`, { cause: error });
  }
}

function assertSafeDatabaseTarget(filename, { requireExisting = false } = {}) {
  if (filename === ':memory:') return;
  const directory = path.dirname(filename);
  let directoryStat;
  try {
    directoryStat = fs.lstatSync(directory);
  } catch (error) {
    throw new Error('Onboarding database directory is unavailable', { cause: error });
  }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('Onboarding database directory is unsafe');
  }
  if (!fs.existsSync(filename)) {
    if (requireExisting) throw new Error('Onboarding database must already exist');
    return;
  }
  const fileStat = fs.lstatSync(filename);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error('Onboarding database target is unsafe');
  }
}

function rowToRecord(row) {
  if (!row) return null;
  const prepared = row.operations_json
    ? {
        operations: parseJson(row.operations_json, 'prepared operations'),
        fingerprint: row.fingerprint,
        authority: row.authority,
        delegationVests: row.delegation_vests,
      }
    : null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    username: row.username,
    publicKeys: parseJson(row.public_keys_json, 'public keys'),
    status: row.status,
    creator: row.creator,
    starterHp: row.starter_hp,
    cashFeeUsd: row.cash_fee_usd,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    cashConfirmedAt: row.cash_confirmed_at,
    preparedAt: row.prepared_at,
    prepared,
    signingStartedAt: row.signing_started_at,
    broadcastRecordedAt: row.broadcast_recorded_at,
    transactionId: row.transaction_id,
    ambiguous: row.ambiguous === 1,
    completedAt: row.completed_at,
    conflictReason: row.conflict_reason,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

function sameCreatePayload(row, { username, publicKeys, creator, starterHp, cashFeeUsd }) {
  return (
    row.username === username &&
    row.public_keys_json === publicKeysJson(publicKeys) &&
    row.creator === creator &&
    row.starter_hp === starterHp &&
    row.cash_fee_usd === cashFeeUsd
  );
}

function inspectOnboardingStore(filename) {
  assertSafeDatabaseTarget(filename, { requireExisting: true });
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.enableDefensive?.(true);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const integrity = db.prepare('PRAGMA quick_check').get();
    const integrityValue = integrity && Object.values(integrity)[0];
    if (integrityValue !== 'ok') throw new Error('Onboarding database integrity check failed');
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length > 0) throw new Error('Onboarding database foreign-key check failed');
    const version = db
      .prepare("SELECT version FROM hive_bar_schema WHERE name = 'onboarding'")
      .get()?.version;
    if (version !== ONBOARDING_SCHEMA_VERSION) {
      throw new Error('Unsupported Hive-Bar onboarding schema version');
    }
    return Object.freeze({ schemaVersion: version, integrity: 'ok' });
  } finally {
    db.close();
  }
}

class OnboardingRequestStore {
  constructor({
    filename = ':memory:',
    ttlMs = 15 * 60 * 1000,
    now = Date.now,
    createId = onboardingId,
    database,
    requireExisting = false,
    maxLiveRequests = 25,
    maxDailyRequests = 50,
  } = {}) {
    this.filename = filename;
    this.ttlMs = ttlMs;
    this.now = now;
    this.createId = createId;
    this.maxLiveRequests = maxLiveRequests;
    this.maxDailyRequests = maxDailyRequests;
    if (!database) assertSafeDatabaseTarget(filename, { requireExisting });
    this.db = database || new DatabaseSync(filename);
    this.db.enableDefensive?.(true);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (filename !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    }
    this.#migrate();
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hive_bar_schema (
        name TEXT PRIMARY KEY,
        version INTEGER NOT NULL
      ) STRICT;
      INSERT OR IGNORE INTO hive_bar_schema (name, version)
      VALUES ('onboarding', ${ONBOARDING_SCHEMA_VERSION});

      CREATE TABLE IF NOT EXISTS onboarding_requests (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        public_keys_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'pending', 'prepared', 'signing', 'observing',
          'complete', 'conflict', 'expired', 'cancelled'
        )),
        creator TEXT NOT NULL,
        starter_hp TEXT NOT NULL,
        cash_fee_usd TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        cash_confirmed_at INTEGER,
        prepared_at INTEGER,
        operations_json TEXT,
        fingerprint TEXT,
        authority TEXT,
        delegation_vests TEXT,
        signing_started_at INTEGER,
        broadcast_recorded_at INTEGER,
        transaction_id TEXT UNIQUE,
        ambiguous INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous IN (0, 1)),
        completed_at INTEGER,
        conflict_reason TEXT,
        cancelled_at INTEGER,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        CHECK (
          (operations_json IS NULL AND fingerprint IS NULL AND authority IS NULL AND delegation_vests IS NULL) OR
          (operations_json IS NOT NULL AND fingerprint IS NOT NULL AND authority = 'Active' AND delegation_vests IS NOT NULL)
        )
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS onboarding_requests_live_username_idx
        ON onboarding_requests (username)
        WHERE status IN ('pending', 'prepared', 'signing', 'observing');
      CREATE UNIQUE INDEX IF NOT EXISTS onboarding_requests_creator_lane_idx
        ON onboarding_requests (creator)
        WHERE status IN ('prepared', 'signing', 'observing');
      CREATE INDEX IF NOT EXISTS onboarding_requests_created_idx
        ON onboarding_requests (created_at DESC, id);
      CREATE INDEX IF NOT EXISTS onboarding_requests_status_idx
        ON onboarding_requests (status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS onboarding_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL REFERENCES onboarding_requests(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        detail TEXT NOT NULL DEFAULT ''
      ) STRICT;
      CREATE INDEX IF NOT EXISTS onboarding_events_request_idx
        ON onboarding_events (request_id, id ASC);

      CREATE TRIGGER IF NOT EXISTS onboarding_events_no_update
      BEFORE UPDATE ON onboarding_events
      BEGIN
        SELECT RAISE(ABORT, 'onboarding events are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS onboarding_events_no_delete
      BEFORE DELETE ON onboarding_events
      BEGIN
        SELECT RAISE(ABORT, 'onboarding events are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS onboarding_transaction_id_immutable
      BEFORE UPDATE OF transaction_id ON onboarding_requests
      WHEN OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS NOT OLD.transaction_id
      BEGIN
        SELECT RAISE(ABORT, 'onboarding transaction id is immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS onboarding_prepared_payload_immutable
      BEFORE UPDATE OF operations_json, fingerprint, authority, delegation_vests ON onboarding_requests
      WHEN OLD.operations_json IS NOT NULL AND (
        NEW.operations_json IS NOT OLD.operations_json OR
        NEW.fingerprint IS NOT OLD.fingerprint OR
        NEW.authority IS NOT OLD.authority OR
        NEW.delegation_vests IS NOT OLD.delegation_vests
      )
      BEGIN
        SELECT RAISE(ABORT, 'onboarding prepared payload is immutable');
      END;
    `);
    const version = this.schemaVersion();
    if (version !== ONBOARDING_SCHEMA_VERSION) {
      throw new Error('Unsupported Hive-Bar onboarding schema version');
    }
  }

  schemaVersion() {
    return this.db
      .prepare("SELECT version FROM hive_bar_schema WHERE name = 'onboarding'")
      .get()?.version;
  }

  health() {
    const integrity = this.db.prepare('PRAGMA quick_check').get();
    const integrityValue = integrity && Object.values(integrity)[0];
    if (integrityValue !== 'ok') throw new Error('Onboarding database integrity check failed');
    const foreignKeys = this.db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length > 0) throw new Error('Onboarding database foreign-key check failed');
    const schemaVersion = this.schemaVersion();
    if (schemaVersion !== ONBOARDING_SCHEMA_VERSION) {
      throw new Error('Unsupported Hive-Bar onboarding schema version');
    }
    return Object.freeze({ schemaVersion, integrity: 'ok' });
  }

  create({ username, publicKeys, idempotencyKey, creator, starterHp, cashFeeUsd }) {
    const key = normalizeOpaque(idempotencyKey, IDEMPOTENCY_KEY_PATTERN, 'Onboarding idempotency key');
    const nowMs = this.now();
    const publicKeysValue = publicKeysJson(publicKeys);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.#expireDueTx(nowMs);
      const existing = this.db
        .prepare('SELECT * FROM onboarding_requests WHERE idempotency_key = ?')
        .get(key);
      if (existing) {
        if (!sameCreatePayload(existing, { username, publicKeys, creator, starterHp, cashFeeUsd })) {
          throw new ConflictError('This onboarding retry key is already bound to a different request', {
            code: 'ONBOARDING_IDEMPOTENCY_CONFLICT',
          });
        }
        this.db.exec('COMMIT;');
        return { record: rowToRecord(existing), reused: true };
      }

      const liveCount = this.db.prepare(`
        SELECT COUNT(*) AS count FROM onboarding_requests
        WHERE status IN ('pending', 'prepared', 'signing', 'observing')
      `).get().count;
      if (liveCount >= this.maxLiveRequests) {
        throw new ConflictError('Onboarding is at its current live-request limit. Ask staff before starting another request.', {
          code: 'ONBOARDING_LIVE_LIMIT',
        });
      }
      const dailyCount = this.db.prepare(`
        SELECT COUNT(*) AS count FROM onboarding_requests
        WHERE created_at >= ?
      `).get(nowMs - DAY_MS).count;
      if (dailyCount >= this.maxDailyRequests) {
        throw new ConflictError('Onboarding has reached its current daily request limit.', {
          code: 'ONBOARDING_DAILY_LIMIT',
        });
      }
      const liveUsername = this.db.prepare(`
        SELECT id FROM onboarding_requests
        WHERE username = ? AND status IN ('pending', 'prepared', 'signing', 'observing')
        LIMIT 1
      `).get(username);
      if (liveUsername) {
        throw new ConflictError('There is already a live onboarding request for that Hive username.', {
          code: 'ONBOARDING_USERNAME_REQUEST_EXISTS',
        });
      }

      const id = this.createId();
      if (!REQUEST_ID_PATTERN.test(id)) throw new TypeError('Onboarding request id is invalid');
      const expiresAt = nowMs + this.ttlMs;
      this.db.prepare(`
        INSERT INTO onboarding_requests (
          id, idempotency_key, username, public_keys_json, status, creator,
          starter_hp, cash_fee_usd, created_at, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        key,
        username,
        publicKeysValue,
        creator,
        starterHp,
        cashFeeUsd,
        nowMs,
        expiresAt,
        nowMs,
      );
      this.#event(id, 'created', nowMs);
      const row = this.#row(id);
      this.db.exec('COMMIT;');
      return { record: rowToRecord(row), reused: false };
    } catch (error) {
      this.#rollback();
      if (String(error?.code || '').startsWith('ERR_SQLITE_CONSTRAINT')) {
        throw new ConflictError('The onboarding request conflicts with current durable state', {
          code: 'ONBOARDING_STORE_CONFLICT',
        });
      }
      throw error;
    }
  }

  get(id) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    this.expireDue();
    const row = this.#row(requestId);
    if (!row) throw new NotFoundError('Onboarding request not found');
    return rowToRecord(row);
  }

  getByIdempotency(idempotencyKey) {
    const key = normalizeOpaque(
      idempotencyKey,
      IDEMPOTENCY_KEY_PATTERN,
      'Onboarding idempotency key',
    );
    this.expireDue();
    const row = this.db
      .prepare('SELECT * FROM onboarding_requests WHERE idempotency_key = ?')
      .get(key);
    if (!row) throw new NotFoundError('Onboarding request not found');
    return rowToRecord(row);
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
    if (record.status === 'cancelled') {
      throw new ConflictError('This onboarding request was cancelled. Start a new account request.', {
        code: 'ONBOARDING_CANCELLED',
      });
    }
    return record;
  }

  mutationLane(creator) {
    this.expireDue();
    const row = this.db.prepare(`
      SELECT * FROM onboarding_requests
      WHERE creator = ? AND status IN ('prepared', 'signing', 'observing')
      ORDER BY prepared_at ASC, id ASC
      LIMIT 1
    `).get(creator);
    return rowToRecord(row);
  }

  prepare(id, { cashConfirmedAt, operations, fingerprint, authority, delegationVests }) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.#expireDueTx(nowMs);
      const row = this.#requiredRow(requestId);
      if (row.status === 'prepared') {
        this.db.exec('COMMIT;');
        return rowToRecord(row);
      }
      this.#assertMutablePreBroadcast(row);
      if (row.status !== 'pending') {
        throw new ConflictError('This onboarding request cannot be prepared again.', {
          code: 'ONBOARDING_NO_RETRY',
        });
      }
      const lane = this.db.prepare(`
        SELECT id FROM onboarding_requests
        WHERE creator = ? AND status IN ('prepared', 'signing', 'observing') AND id != ?
        LIMIT 1
      `).get(row.creator, requestId);
      if (lane) {
        throw new ConflictError('Another onboarding request already holds the creator transaction lane.', {
          code: 'ONBOARDING_CREATOR_LANE_BUSY',
        });
      }
      this.db.prepare(`
        UPDATE onboarding_requests
        SET status = 'prepared', cash_confirmed_at = ?, prepared_at = ?,
            operations_json = ?, fingerprint = ?, authority = ?, delegation_vests = ?,
            updated_at = ?, revision = revision + 1
        WHERE id = ? AND status = 'pending'
      `).run(
        cashConfirmedAt,
        nowMs,
        JSON.stringify(operations),
        fingerprint,
        authority,
        delegationVests,
        nowMs,
        requestId,
      );
      this.#event(requestId, 'prepared', nowMs);
      const updated = this.#requiredRow(requestId);
      this.db.exec('COMMIT;');
      return rowToRecord(updated);
    } catch (error) {
      this.#rollback();
      if (String(error?.code || '').startsWith('ERR_SQLITE_CONSTRAINT')) {
        throw new ConflictError('Another onboarding request already holds the creator transaction lane.', {
          code: 'ONBOARDING_CREATOR_LANE_BUSY',
        });
      }
      throw error;
    }
  }

  beginBroadcast(id) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.#expireDueTx(nowMs);
      const row = this.#requiredRow(requestId);
      this.#assertMutablePreBroadcast(row);
      if (row.status !== 'prepared' || !row.operations_json) {
        throw new ConflictError('This onboarding request is not ready for Keychain.', {
          code: 'ONBOARDING_NOT_PREPARED',
        });
      }
      const result = this.db.prepare(`
        UPDATE onboarding_requests
        SET status = 'signing', signing_started_at = ?, updated_at = ?, revision = revision + 1
        WHERE id = ? AND status = 'prepared'
      `).run(nowMs, nowMs, requestId);
      if (result.changes !== 1) {
        throw new ConflictError('This onboarding request has already reached Keychain.', {
          code: 'ONBOARDING_NO_RETRY',
        });
      }
      this.#event(requestId, 'signing-started', nowMs);
      const updated = this.#requiredRow(requestId);
      this.db.exec('COMMIT;');
      return rowToRecord(updated);
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  recordBroadcast(id, { transactionId = null, ambiguous = false, cancelled = false } = {}) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    const normalizedTransactionId = normalizeTransactionId(transactionId);
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const row = this.#requiredRow(requestId);
      if (cancelled) {
        if (row.status === 'cancelled') {
          this.db.exec('COMMIT;');
          return rowToRecord(row);
        }
        if (row.status !== 'signing' || normalizedTransactionId || ambiguous) {
          throw new ConflictError('Only a definite Keychain cancellation may cancel a signing request.', {
            code: 'ONBOARDING_CANCELLATION_CONFLICT',
          });
        }
        this.db.prepare(`
          UPDATE onboarding_requests
          SET status = 'cancelled', cancelled_at = ?, updated_at = ?, revision = revision + 1
          WHERE id = ? AND status = 'signing'
        `).run(nowMs, nowMs, requestId);
        this.#event(requestId, 'keychain-cancelled', nowMs);
        const updated = this.#requiredRow(requestId);
        this.db.exec('COMMIT;');
        return rowToRecord(updated);
      }

      if (!['signing', 'observing'].includes(row.status)) {
        throw new ConflictError('This onboarding request has not entered the Keychain signing step.', {
          code: 'ONBOARDING_NOT_SIGNING',
        });
      }
      if (row.transaction_id && normalizedTransactionId && row.transaction_id !== normalizedTransactionId) {
        throw new ConflictError('This onboarding request already has a different transaction id.', {
          code: 'ONBOARDING_TRANSACTION_ID_CONFLICT',
        });
      }
      const firstRecord = row.broadcast_recorded_at === null;
      const nextTransactionId = normalizedTransactionId || row.transaction_id;
      const nextAmbiguous = ambiguous || row.ambiguous === 1 ? 1 : 0;
      this.db.prepare(`
        UPDATE onboarding_requests
        SET status = 'observing', broadcast_recorded_at = COALESCE(broadcast_recorded_at, ?),
            transaction_id = ?, ambiguous = ?, updated_at = ?, revision = revision + 1
        WHERE id = ? AND status IN ('signing', 'observing')
      `).run(nowMs, nextTransactionId, nextAmbiguous, nowMs, requestId);
      if (firstRecord || normalizedTransactionId) {
        this.#event(requestId, 'broadcast-recorded', nowMs, normalizedTransactionId ? 'transaction-id-recorded' : 'outcome-ambiguous');
      }
      const updated = this.#requiredRow(requestId);
      this.db.exec('COMMIT;');
      return rowToRecord(updated);
    } catch (error) {
      this.#rollback();
      if (String(error?.code || '').startsWith('ERR_SQLITE_CONSTRAINT')) {
        throw new ConflictError('This Hive transaction id is already bound to another onboarding request.', {
          code: 'ONBOARDING_TRANSACTION_ID_CONFLICT',
        });
      }
      throw error;
    }
  }

  cancel(id) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.#expireDueTx(nowMs);
      const row = this.#requiredRow(requestId);
      if (row.status === 'cancelled') {
        this.db.exec('COMMIT;');
        return rowToRecord(row);
      }
      if (!['pending', 'prepared'].includes(row.status)) {
        throw new ConflictError('This onboarding request cannot be cancelled after Keychain begins.', {
          code: 'ONBOARDING_NOT_CANCELLABLE',
        });
      }
      this.db.prepare(`
        UPDATE onboarding_requests
        SET status = 'cancelled', cancelled_at = ?, updated_at = ?, revision = revision + 1
        WHERE id = ? AND status IN ('pending', 'prepared')
      `).run(nowMs, nowMs, requestId);
      this.#event(requestId, 'cancelled', nowMs);
      const updated = this.#requiredRow(requestId);
      this.db.exec('COMMIT;');
      return rowToRecord(updated);
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  markComplete(id) {
    return this.#terminalTransition(id, 'complete', { completedAt: this.now() });
  }

  markConflict(id, reason) {
    const normalizedReason = String(reason || '').trim().slice(0, 160) || 'hive-state-conflict';
    return this.#terminalTransition(id, 'conflict', { conflictReason: normalizedReason });
  }

  expireDue() {
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const count = this.#expireDueTx(nowMs);
      this.db.exec('COMMIT;');
      return count;
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  listRecent(limit = 50) {
    this.expireDue();
    const bounded = Math.min(100, Math.max(1, Number(limit) || 50));
    return this.db.prepare(`
      SELECT * FROM onboarding_requests
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(bounded).map(rowToRecord);
  }

  history(id) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    this.#requiredRow(requestId);
    return this.db.prepare(`
      SELECT id, event_type, recorded_at, detail
      FROM onboarding_events
      WHERE request_id = ?
      ORDER BY id ASC
    `).all(requestId).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      recordedAt: row.recorded_at,
      detail: row.detail,
    }));
  }

  close() {
    this.db.close();
  }

  #terminalTransition(id, status, values) {
    const requestId = normalizeOpaque(id, REQUEST_ID_PATTERN, 'Onboarding request id');
    const nowMs = this.now();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const row = this.#requiredRow(requestId);
      if (row.status === status) {
        this.db.exec('COMMIT;');
        return rowToRecord(row);
      }
      if (TERMINAL_STATUSES.includes(row.status)) {
        throw new ConflictError('This onboarding request is already in a terminal state.', {
          code: 'ONBOARDING_TERMINAL_STATE',
        });
      }
      if (status === 'complete' && !['signing', 'observing'].includes(row.status)) {
        throw new ConflictError('This onboarding request cannot complete before the Keychain gate.', {
          code: 'ONBOARDING_COMPLETION_CONFLICT',
        });
      }
      if (status === 'complete') {
        this.db.prepare(`
          UPDATE onboarding_requests
          SET status = 'complete', completed_at = ?, ambiguous = 0,
              updated_at = ?, revision = revision + 1
          WHERE id = ?
        `).run(values.completedAt, nowMs, requestId);
      } else {
        this.db.prepare(`
          UPDATE onboarding_requests
          SET status = 'conflict', conflict_reason = ?, updated_at = ?, revision = revision + 1
          WHERE id = ?
        `).run(values.conflictReason, nowMs, requestId);
      }
      this.#event(requestId, status, nowMs, status === 'conflict' ? values.conflictReason : '');
      const updated = this.#requiredRow(requestId);
      this.db.exec('COMMIT;');
      return rowToRecord(updated);
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  #expireDueTx(nowMs) {
    const rows = this.db.prepare(`
      SELECT id FROM onboarding_requests
      WHERE status IN ('pending', 'prepared') AND expires_at <= ?
      ORDER BY id ASC
    `).all(nowMs);
    if (rows.length === 0) return 0;
    this.db.prepare(`
      UPDATE onboarding_requests
      SET status = 'expired', updated_at = ?, revision = revision + 1
      WHERE status IN ('pending', 'prepared') AND expires_at <= ?
    `).run(nowMs, nowMs);
    for (const row of rows) this.#event(row.id, 'expired', nowMs);
    return rows.length;
  }

  #assertMutablePreBroadcast(row) {
    if (row.status === 'expired') {
      throw new ConflictError('This onboarding request has expired. Start a new account request.', {
        code: 'ONBOARDING_EXPIRED',
      });
    }
    if (row.status === 'conflict') {
      throw new ConflictError('This onboarding request conflicts with current Hive state.', {
        code: 'ONBOARDING_CONFLICT',
      });
    }
    if (row.status === 'cancelled') {
      throw new ConflictError('This onboarding request was cancelled. Start a new account request.', {
        code: 'ONBOARDING_CANCELLED',
      });
    }
    if (row.status === 'complete') {
      throw new ConflictError('This Hive account has already been created.', {
        code: 'ONBOARDING_COMPLETE',
      });
    }
    if (['signing', 'observing'].includes(row.status)) {
      throw new ConflictError('This onboarding request has already reached Keychain. Do not broadcast it again.', {
        code: 'ONBOARDING_NO_RETRY',
      });
    }
  }

  #requiredRow(id) {
    const row = this.#row(id);
    if (!row) throw new NotFoundError('Onboarding request not found');
    return row;
  }

  #row(id) {
    return this.db.prepare('SELECT * FROM onboarding_requests WHERE id = ?').get(id);
  }

  #event(requestId, eventType, recordedAt, detail = '') {
    this.db.prepare(`
      INSERT INTO onboarding_events (request_id, event_type, recorded_at, detail)
      VALUES (?, ?, ?, ?)
    `).run(requestId, eventType, recordedAt, String(detail || ''));
  }

  #rollback() {
    try {
      this.db.exec('ROLLBACK;');
    } catch {
      // Preserve the original error if SQLite has already rolled the transaction back.
    }
  }
}

module.exports = {
  DAY_MS,
  EXPIRABLE_STATUSES,
  IDEMPOTENCY_KEY_PATTERN,
  LIVE_STATUSES,
  MUTATION_LANE_STATUSES,
  ONBOARDING_SCHEMA_VERSION,
  OnboardingRequestStore,
  REQUEST_ID_PATTERN,
  TERMINAL_STATUSES,
  TRANSACTION_ID_PATTERN,
  assertSafeDatabaseTarget,
  inspectOnboardingStore,
  normalizeTransactionId,
};
