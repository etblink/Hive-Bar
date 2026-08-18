'use strict';

const { ConflictError, AuthorizationError, FeatureUnavailableError, ValidationError } = require('../lib/errors');
const { parseAsset } = require('../hive/assets');
const { OnboardingRequestStore } = require('./request-store');
const { accountKeysMatch, availableVests, buildOnboardingOperations, hpToVests } = require('./operations');
const { requireNewHiveAccountName, requirePublicKeySet } = require('./validation');

function safeRecord(record, config) {
  return Object.freeze({
    id: record.id,
    username: record.username,
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    creator: config.creator,
    starterHp: config.starterHp.display,
    cashFeeUsd: config.cashFeeUsd,
    transactionId: record.transactionId,
    completedAt: record.completedAt,
    conflictReason: record.conflictReason,
  });
}

function requireTransactionId(value) {
  if (value === undefined || value === null || value === '') return null;
  const transactionId = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(transactionId)) {
    throw new ValidationError('Hive transaction id is invalid');
  }
  return transactionId;
}

class OnboardingService {
  constructor({ rpcPool, config, store, now = Date.now } = {}) {
    if (!rpcPool || typeof rpcPool.call !== 'function') throw new TypeError('OnboardingService requires an RPC pool');
    this.rpcPool = rpcPool;
    this.config = config;
    this.now = now;
    this.store = store || new OnboardingRequestStore({ ttlMs: config.requestTtlMs, now });
  }

  publicConfig() {
    return Object.freeze({
      enabled: this.config.enabled,
      active: this.config.active,
      creator: this.config.creator,
      starterHp: this.config.starterHp.display,
      cashFeeUsd: this.config.cashFeeUsd,
      requestTtlMinutes: Math.round(this.config.requestTtlMs / 60000),
    });
  }

  async checkUsername(value) {
    this.#requireActive();
    const username = requireNewHiveAccountName(value);
    const accounts = await this.rpcPool.call('condenser_api', 'get_accounts', [[username]]);
    const available = !Array.isArray(accounts) || !accounts.some((account) => account?.name === username);
    return Object.freeze({ username, available });
  }

  async createRequest(payload) {
    this.#requireActive();
    const username = requireNewHiveAccountName(payload?.username);
    if (payload?.recoveryAcknowledged !== true) {
      throw new ValidationError('Save your recovery credentials before creating the bartender QR');
    }
    const publicKeys = requirePublicKeySet(payload?.publicKeys);
    const availability = await this.checkUsername(username);
    if (!availability.available) {
      throw new ConflictError('That Hive username is no longer available. Choose another name.', {
        code: 'ONBOARDING_USERNAME_TAKEN',
      });
    }
    return safeRecord(this.store.create({ username, publicKeys }), this.config);
  }

  async status(id, { observe = true } = {}) {
    let record = this.store.get(id);
    if (observe && ['signing', 'observing'].includes(record.status)) {
      record = await this.#observeRecord(record);
    }
    return safeRecord(record, this.config);
  }

  staffView(id, staffAccount) {
    const record = this.store.get(id);
    return Object.freeze({
      request: safeRecord(record, this.config),
      authorized: Boolean(staffAccount && staffAccount === this.config.creator),
      publicKeys: record.publicKeys,
    });
  }

  async prepare(id, { staffAccount, cashConfirmed }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    const record = this.store.requireLive(id);
    if (record.status === 'complete') {
      throw new ConflictError('This Hive account has already been created.', { code: 'ONBOARDING_COMPLETE' });
    }
    if (['signing', 'observing'].includes(record.status)) {
      throw new ConflictError('This onboarding request has already reached Keychain. Do not broadcast it again.', {
        code: 'ONBOARDING_NO_RETRY',
      });
    }
    if (record.prepared) return this.#preparedResponse(record);
    if (cashConfirmed !== true) {
      throw new ValidationError(`Confirm receipt of the $${this.config.cashFeeUsd} cash onboarding fee first`);
    }

    const [accounts, globalProperties] = await Promise.all([
      this.rpcPool.call('condenser_api', 'get_accounts', [[this.config.creator, record.username]]),
      this.rpcPool.call('condenser_api', 'get_dynamic_global_properties', []),
    ]);
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.some((account) => account?.name === record.username)) {
      this.store.update(id, (current) => ({
        ...current,
        status: 'conflict',
        conflictReason: 'username-taken-before-prepare',
      }));
      throw new ConflictError('That Hive username was taken before the bartender approval.', {
        code: 'ONBOARDING_USERNAME_TAKEN',
      });
    }

    const creator = rows.find((account) => account?.name === this.config.creator);
    if (!creator) throw new FeatureUnavailableError('The configured onboarding creator account is unavailable');
    if (!Number.isSafeInteger(Number(creator.pending_claimed_accounts)) || Number(creator.pending_claimed_accounts) < 1) {
      throw new FeatureUnavailableError('The onboarding creator does not currently have an account-creation token', {
        code: 'ONBOARDING_NO_ACCOUNT_TOKEN',
      });
    }

    const delegationVests = hpToVests(this.config.starterHp.units, globalProperties);
    if (availableVests(creator) < delegationVests.units) {
      throw new FeatureUnavailableError('The onboarding creator does not currently have enough available Hive Power for the starter delegation', {
        code: 'ONBOARDING_INSUFFICIENT_HP',
      });
    }

    const prepared = buildOnboardingOperations({
      creator: this.config.creator,
      username: record.username,
      publicKeys: record.publicKeys,
      delegationVests,
    });
    const nowMs = this.now();
    const updated = this.store.update(id, (current) => ({
      ...current,
      status: 'prepared',
      cashConfirmedAt: nowMs,
      preparedAt: nowMs,
      prepared: {
        operations: prepared.operations,
        fingerprint: prepared.fingerprint,
        authority: prepared.authority,
        delegationVests: delegationVests.canonical,
      },
    }));
    return this.#preparedResponse(updated);
  }

  beginBroadcast(id, { staffAccount }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    const record = this.store.requireLive(id);
    if (record.status !== 'prepared' || !record.prepared) {
      throw new ConflictError('This onboarding request is not ready for Keychain.', {
        code: 'ONBOARDING_NOT_PREPARED',
      });
    }
    const updated = this.store.update(id, (current) => ({
      ...current,
      status: 'signing',
      signingStartedAt: this.now(),
    }));
    return this.#preparedResponse(updated);
  }

  recordBroadcast(id, { staffAccount, transactionId = null, ambiguous = false }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    const record = this.store.requireLive(id);
    if (!['signing', 'observing'].includes(record.status)) {
      throw new ConflictError('This onboarding request has not entered the Keychain signing step.', {
        code: 'ONBOARDING_NOT_SIGNING',
      });
    }
    const normalizedId = requireTransactionId(transactionId);
    const updated = this.store.update(id, (current) => ({
      ...current,
      status: 'observing',
      broadcastRecordedAt: this.now(),
      transactionId: normalizedId || current.transactionId,
      ambiguous: Boolean(ambiguous) || current.ambiguous,
    }));
    return safeRecord(updated, this.config);
  }

  async observe(id, { staffAccount } = {}) {
    if (staffAccount) this.#requireStaff(staffAccount);
    const record = this.store.get(id);
    if (!['signing', 'observing', 'complete'].includes(record.status)) return safeRecord(record, this.config);
    const observed = record.status === 'complete' ? record : await this.#observeRecord(record);
    return safeRecord(observed, this.config);
  }

  #preparedResponse(record) {
    return Object.freeze({
      request: safeRecord(record, this.config),
      creator: this.config.creator,
      authority: record.prepared.authority,
      operations: record.prepared.operations,
      fingerprint: record.prepared.fingerprint,
      starterHp: this.config.starterHp.display,
      delegationVests: record.prepared.delegationVests,
      cashFeeUsd: this.config.cashFeeUsd,
    });
  }

  async #observeRecord(record) {
    const accounts = await this.rpcPool.call('condenser_api', 'get_accounts', [[record.username]]);
    const account = Array.isArray(accounts) ? accounts.find((item) => item?.name === record.username) : null;
    if (!account) return this.store.get(record.id);
    if (!accountKeysMatch(account, record.publicKeys)) {
      return this.store.update(record.id, (current) => ({
        ...current,
        status: 'conflict',
        conflictReason: 'created-account-keys-do-not-match-request',
      }));
    }

    const delegations = await this.rpcPool.call('condenser_api', 'get_vesting_delegations', [
      this.config.creator,
      record.username,
      1,
    ]);
    const delegation = Array.isArray(delegations)
      ? delegations.find((item) => item?.delegator === this.config.creator && item?.delegatee === record.username)
      : null;
    const actual = parseAsset(delegation?.vesting_shares, 'VESTS');
    const expected = parseAsset(record.prepared?.delegationVests, 'VESTS');
    if (!actual || !expected || actual.units !== expected.units) return this.store.get(record.id);

    return this.store.update(record.id, (current) => ({
      ...current,
      status: 'complete',
      completedAt: this.now(),
      ambiguous: false,
    }));
  }

  #requireActive() {
    if (!this.config.active) {
      throw new FeatureUnavailableError('In-person Hive account creation is not active yet', {
        code: 'ONBOARDING_DISABLED',
      });
    }
  }

  #requireStaff(account) {
    if (!account || account !== this.config.creator) {
      throw new AuthorizationError(`Sign in as @${this.config.creator || 'the onboarding creator'} before approving this account`, {
        code: 'ONBOARDING_CREATOR_REQUIRED',
      });
    }
  }
}

module.exports = { OnboardingService, requireTransactionId, safeRecord };
