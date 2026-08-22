'use strict';

const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { NotFoundError, ValidationError } = require('../lib/errors');
const { requireHiveAccount, requirePermlink } = require('../http/validation');

const MODERATION_SCHEMA_VERSION = 1;
const TARGET_TYPES = Object.freeze(['account', 'content']);
const MAX_REASON_BYTES = 240;

function moderationId() {
  return randomBytes(18).toString('base64url');
}

function normalizeReason(value) {
  const reason = String(value || '').trim();
  if (Buffer.byteLength(reason, 'utf8') > MAX_REASON_BYTES) {
    throw new ValidationError(`Moderation reason must be ${MAX_REASON_BYTES} bytes or fewer`);
  }
  return reason;
}

function normalizeTarget({ targetType, author, permlink }) {
  const type = String(targetType || '').trim().toLowerCase();
  if (!TARGET_TYPES.includes(type)) throw new ValidationError('Moderation target type is invalid');
  const account = requireHiveAccount(author, 'Moderation target account');
  if (type === 'account') {
    return {
      targetType: type,
      author: account,
      permlink: null,
      identityKey: `account:${account}`,
    };
  }
  const contentPermlink = requirePermlink(permlink);
  return {
    targetType: type,
    author: account,
    permlink: contentPermlink,
    identityKey: `content:${account}/${contentPermlink}`,
  };
}

function assertSafeDatabaseTarget(filename, { requireExisting = false } = {}) {
  if (filename === ':memory:') return;
  const directory = path.dirname(filename);
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('Moderation database directory is unsafe');
  }
  if (!fs.existsSync(filename)) {
    if (requireExisting) throw new Error('Moderation database must already exist');
    return;
  }
  const fileStat = fs.lstatSync(filename);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error('Moderation database target is unsafe');
  }
}

class ModerationStore {
  constructor({
    filename = ':memory:',
    now = Date.now,
    random = moderationId,
    database,
    requireExisting = false,
  } = {}) {
    this.now = now;
    this.random = random;
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
      INSERT OR IGNORE INTO hive_bar_schema (name, version) VALUES ('moderation', ${MODERATION_SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS moderation_targets (
        id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL UNIQUE,
        target_type TEXT NOT NULL CHECK (target_type IN ('account', 'content')),
        author TEXT NOT NULL,
        permlink TEXT,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        reason TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (target_type = 'account' AND permlink IS NULL) OR
          (target_type = 'content' AND permlink IS NOT NULL)
        )
      ) STRICT;
      CREATE INDEX IF NOT EXISTS moderation_targets_active_idx
        ON moderation_targets (active, updated_at DESC);
      CREATE TABLE IF NOT EXISTS moderation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_id TEXT NOT NULL REFERENCES moderation_targets(id) ON DELETE RESTRICT,
        action TEXT NOT NULL CHECK (action IN ('hide', 'unhide')),
        operator TEXT NOT NULL,
        reason TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS moderation_events_recorded_idx
        ON moderation_events (recorded_at DESC, id DESC);
    `);
    const version = this.db
      .prepare("SELECT version FROM hive_bar_schema WHERE name = 'moderation'")
      .get()?.version;
    if (version !== MODERATION_SCHEMA_VERSION) {
      throw new Error('Unsupported Hive-Bar moderation schema version');
    }
  }

  snapshot() {
    const rows = this.db.prepare(`
      SELECT target_type, author, permlink
      FROM moderation_targets
      WHERE active = 1
      ORDER BY identity_key ASC
    `).all();
    return {
      accounts: rows.filter((row) => row.target_type === 'account').map((row) => row.author),
      content: rows
        .filter((row) => row.target_type === 'content')
        .map((row) => ({ author: row.author, permlink: row.permlink })),
    };
  }

  listActive() {
    return this.db.prepare(`
      SELECT id, target_type, author, permlink, reason, created_by, updated_by, created_at, updated_at
      FROM moderation_targets
      WHERE active = 1
      ORDER BY updated_at DESC, identity_key ASC
    `).all().map((row) => this.#publicTarget(row));
  }

  history(limit = 50) {
    const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    return this.db.prepare(`
      SELECT e.id, e.action, e.operator, e.reason, e.recorded_at,
             t.id AS target_id, t.target_type, t.author, t.permlink
      FROM moderation_events e
      JOIN moderation_targets t ON t.id = e.target_id
      ORDER BY e.recorded_at DESC, e.id DESC
      LIMIT ?
    `).all(boundedLimit).map((row) => ({
      id: row.id,
      action: row.action,
      operator: row.operator,
      reason: row.reason,
      recordedAt: row.recorded_at,
      target: {
        id: row.target_id,
        targetType: row.target_type,
        author: row.author,
        permlink: row.permlink,
      },
    }));
  }

  hide({ targetType, author, permlink, operator, reason = '' }) {
    const target = normalizeTarget({ targetType, author, permlink });
    const actor = requireHiveAccount(operator, 'Moderation operator');
    const normalizedReason = normalizeReason(reason);
    const now = new Date(this.now()).toISOString();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const existing = this.db
        .prepare('SELECT * FROM moderation_targets WHERE identity_key = ?')
        .get(target.identityKey);
      if (existing?.active === 1) {
        this.db.exec('COMMIT;');
        return { target: this.#publicTarget(existing), changed: false };
      }

      let id = existing?.id;
      if (existing) {
        this.db.prepare(`
          UPDATE moderation_targets
          SET active = 1, reason = ?, updated_by = ?, updated_at = ?
          WHERE id = ?
        `).run(normalizedReason, actor, now, id);
      } else {
        id = this.random();
        this.db.prepare(`
          INSERT INTO moderation_targets (
            id, identity_key, target_type, author, permlink, active, reason,
            created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `).run(
          id,
          target.identityKey,
          target.targetType,
          target.author,
          target.permlink,
          normalizedReason,
          actor,
          actor,
          now,
          now,
        );
      }
      this.db.prepare(`
        INSERT INTO moderation_events (target_id, action, operator, reason, recorded_at)
        VALUES (?, 'hide', ?, ?, ?)
      `).run(id, actor, normalizedReason, now);
      this.db.exec('COMMIT;');
      return { target: this.#publicTarget(this.#target(id)), changed: true };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  unhide({ targetId, operator, reason = '' }) {
    const id = String(targetId || '').trim();
    if (!id) throw new ValidationError('Moderation target id is required');
    const actor = requireHiveAccount(operator, 'Moderation operator');
    const normalizedReason = normalizeReason(reason);
    const now = new Date(this.now()).toISOString();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const existing = this.#target(id);
      if (!existing) throw new NotFoundError('Moderation target was not found');
      if (existing.active === 0) {
        this.db.exec('COMMIT;');
        return { target: this.#publicTarget(existing), changed: false };
      }
      this.db.prepare(`
        UPDATE moderation_targets
        SET active = 0, reason = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(normalizedReason, actor, now, id);
      this.db.prepare(`
        INSERT INTO moderation_events (target_id, action, operator, reason, recorded_at)
        VALUES (?, 'unhide', ?, ?, ?)
      `).run(id, actor, normalizedReason, now);
      this.db.exec('COMMIT;');
      return { target: this.#publicTarget(this.#target(id)), changed: true };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.db.close();
  }

  #target(id) {
    return this.db.prepare('SELECT * FROM moderation_targets WHERE id = ?').get(id);
  }

  #publicTarget(row) {
    return {
      id: row.id,
      targetType: row.target_type,
      author: row.author,
      permlink: row.permlink,
      active: row.active === 1,
      reason: row.reason,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = {
  MAX_REASON_BYTES,
  MODERATION_SCHEMA_VERSION,
  ModerationStore,
  TARGET_TYPES,
  assertSafeDatabaseTarget,
  normalizeReason,
  normalizeTarget,
};
