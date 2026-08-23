'use strict';

const { randomBytes } = require('node:crypto');
const {
  AuthorizationError,
  ConflictError,
  FeatureUnavailableError,
  ValidationError,
} = require('../lib/errors');
const { parseAsset } = require('../hive/assets');
const { accountKeysMatch, availableVests, buildOnboardingOperations, hpToVests } = require('./operations');
const { OnboardingRequestStore } = require('./request-store');
const { requireNewHiveAccountName, requirePublicKeySet } = require('./validation');

function safeRecord(record) {
  const response = {
    id: record.id,
    username: record.username,
    status: record.status,
    revision: record.revision,
    creator: record.creator,
    starterHp: record.starterHp,
    cashFeeUsd: record.cashFeeUsd,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  };
  if (['pending', 'prepared'].includes(record.status)) response.expiresAt = record.expiresAt;
  return Object.freeze(response);
}

function staffRecord(record) {
  return Object.freeze({
    ...safeRecord(record),
    expiresAt: record.expiresAt,
    publicKeys: record.publicKeys,
    cashConfirmedAt: record.cashConfirmedAt,
    preparedAt: record.preparedAt,
    prepared: record.prepared,
    signingStartedAt: record.signingStartedAt,
    broadcastRecordedAt: record.broadcastRecordedAt,
    transactionId: record.transactionId,
    ambiguous: record.ambiguous,
    conflictReason: record.conflictReason,
    cancelledAt: record.cancelledAt,
    updatedAt: record.updatedAt,
  });
}

function accountTokenState(account, lowActThreshold) {
  const count = Number(account?.pending_claimed_accounts);
  const valid = Number.isSafeInteger(count) && count >= 0;
  const available = valid && count >= 1;
  const low = available && count < lowActThreshold;
  return Object.freeze({
    count: valid ? count : null,
    available,
    low,
    warning: low
      ? `ACT inventory is low: ${count} remaining; the configured warning threshold is ${lowActThreshold}. Replenish claimed-account tokens soon.`
      : null,
  });
}

function capacityState(creator, delegationVests, minRemainingHp, globalProperties) {
  const reserveVests = hpToVests(minRemainingHp.units, globalProperties);
  const available = availableVests(creator);
  const required = delegationVests.units + reserveVests.units;
  return Object.freeze({
    availableVests: available,
    reserveVests,
    sufficient: available >= required,
  });
}

class OnboardingService {
  constructor({ rpcPool, config, store, now = Date.now, unavailableCause = null } = {}) {
    if (!rpcPool || typeof rpcPool.call !== 'function') {
      throw new TypeError('OnboardingService requires an RPC pool');
    }
    this.rpcPool = rpcPool;
    this.config = config;
    this.now = now;
    this.unavailableCause = unavailableCause;
    this.store = store || (
      unavailableCause
        ? null
        : new OnboardingRequestStore({
            ttlMs: config.requestTtlMs,
            now,
            maxLiveRequests: config.maxLiveRequests,
            maxDailyRequests: config.maxDailyRequests,
          })
    );
  }

  publicConfig() {
    return Object.freeze({
      enabled: this.config.enabled,
      active: this.config.active,
      available: !this.config.enabled || Boolean(this.store),
      creator: this.config.creator,
      starterHp: this.config.starterHp.display,
      cashFeeUsd: this.config.cashFeeUsd,
      minRemainingHp: this.config.minRemainingHp.display,
      lowActThreshold: this.config.lowActThreshold,
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
    const idempotencyKey = String(
      payload?.idempotencyKey || randomBytes(32).toString('base64url'),
    ).trim();

    let existing = null;
    try {
      existing = this.store.getByIdempotency(idempotencyKey);
    } catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error;
    }
    if (existing) {
      const result = this.store.create({
        username,
        publicKeys,
        idempotencyKey,
        creator: this.config.creator,
        starterHp: this.config.starterHp.display,
        cashFeeUsd: this.config.cashFeeUsd,
      });
      return Object.freeze({ request: safeRecord(result.record), reused: true });
    }

    const availability = await this.checkUsername(username);
    if (!availability.available) {
      throw new ConflictError('That Hive username is no longer available. Choose another name.', {
        code: 'ONBOARDING_USERNAME_TAKEN',
      });
    }
    const result = this.store.create({
      username,
      publicKeys,
      idempotencyKey,
      creator: this.config.creator,
      starterHp: this.config.starterHp.display,
      cashFeeUsd: this.config.cashFeeUsd,
    });
    return Object.freeze({ request: safeRecord(result.record), reused: result.reused });
  }

  recoverByIdempotency(idempotencyKey) {
    this.#requireStore();
    return safeRecord(this.store.getByIdempotency(idempotencyKey));
  }

  async status(id, { observe = true } = {}) {
    this.#requireStore();
    let record = this.store.get(id);
    if (observe && ['signing', 'observing'].includes(record.status)) {
      record = await this.#observeRecord(record);
    }
    return safeRecord(record);
  }

  staffView(id, staffAccount) {
    this.#requireStore();
    const record = this.store.get(id);
    const authorized = Boolean(staffAccount && staffAccount === record.creator && staffAccount === this.config.creator);
    return Object.freeze({
      request: authorized ? staffRecord(record) : safeRecord(record),
      authorized,
    });
  }

  async staffStatus(id, staffAccount) {
    this.#requireStore();
    this.#requireStaff(staffAccount);
    let record = this.store.get(id);
    if (['signing', 'observing'].includes(record.status)) record = await this.#observeRecord(record);
    return staffRecord(record);
  }

  management(staffAccount, { limit = 50 } = {}) {
    this.#requireStore();
    this.#requireStaff(staffAccount);
    return Object.freeze({
      requests: this.store.listRecent(limit).map(staffRecord),
      lane: (() => {
        const lane = this.store.mutationLane(this.config.creator);
        return lane ? staffRecord(lane) : null;
      })(),
    });
  }

  async resourceReadiness(id, { staffAccount }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    const record = this.store.requireLive(id);
    const readiness = await this.#readiness(record);
    return Object.freeze({
      ready: readiness.ready,
      code: readiness.code,
      message: readiness.message,
      warning: readiness.warning || null,
      request: safeRecord(readiness.record || record),
      accountTokenAvailable: readiness.accountTokenAvailable,
      accountTokenCount: readiness.accountTokenCount ?? null,
      accountTokenLow: Boolean(readiness.accountTokenLow),
      lowActThreshold: this.config.lowActThreshold,
      starterDelegationAvailable: readiness.starterDelegationAvailable,
      postDelegationReserveAvailable: readiness.postDelegationReserveAvailable,
      minRemainingHp: this.config.minRemainingHp.display,
      delegationVests: readiness.delegationVests?.canonical || record.prepared?.delegationVests || null,
      reserveVests: readiness.reserveVests?.canonical || null,
    });
  }

  async prepare(id, { staffAccount, cashConfirmed }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    let record = this.store.requireLive(id);
    if (record.status === 'prepared') return this.#preparedResponse(record);
    if (record.status === 'complete') {
      throw new ConflictError('This Hive account has already been created.', {
        code: 'ONBOARDING_COMPLETE',
      });
    }
    if (['signing', 'observing'].includes(record.status)) {
      throw new ConflictError('This onboarding request has already reached Keychain. Do not broadcast it again.', {
        code: 'ONBOARDING_NO_RETRY',
      });
    }
    if (cashConfirmed !== true) {
      throw new ValidationError(`Confirm receipt of the $${this.config.cashFeeUsd} cash onboarding fee first`);
    }

    const readiness = await this.#readiness(record);
    record = readiness.record || record;
    if (!readiness.ready) {
      if (readiness.code === 'ONBOARDING_USERNAME_TAKEN') {
        this.store.markConflict(id, 'username-taken-before-prepare');
      }
      throw new FeatureUnavailableError(readiness.message, { code: readiness.code });
    }

    const prepared = buildOnboardingOperations({
      creator: this.config.creator,
      username: record.username,
      publicKeys: record.publicKeys,
      delegationVests: readiness.delegationVests,
    });
    const updated = this.store.prepare(id, {
      cashConfirmedAt: this.now(),
      operations: prepared.operations,
      fingerprint: prepared.fingerprint,
      authority: prepared.authority,
      delegationVests: readiness.delegationVests.canonical,
    });
    return this.#preparedResponse(updated);
  }

  async beginBroadcast(id, { staffAccount }) {
    this.#requireActive();
    this.#requireStaff(staffAccount);
    const record = this.store.requireLive(id);
    if (record.status !== 'prepared' || !record.prepared) {
      throw new ConflictError('This onboarding request is not ready for Keychain.', {
        code: 'ONBOARDING_NOT_PREPARED',
      });
    }

    const [accounts, globalProperties] = await Promise.all([
      this.rpcPool.call('condenser_api', 'get_accounts', [[
        this.config.creator,
        record.username,
      ]]),
      this.rpcPool.call('condenser_api', 'get_dynamic_global_properties', []),
    ]);
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.some((account) => account?.name === record.username)) {
      this.store.markConflict(id, 'username-taken-before-broadcast');
      throw new ConflictError('That Hive username was taken before Keychain opened.', {
        code: 'ONBOARDING_USERNAME_TAKEN',
      });
    }
    const creator = rows.find((account) => account?.name === this.config.creator);
    if (!creator) {
      throw new FeatureUnavailableError('The configured onboarding creator account is unavailable', {
        code: 'ONBOARDING_CREATOR_UNAVAILABLE',
      });
    }
    const tokenState = accountTokenState(creator, this.config.lowActThreshold);
    if (!tokenState.available) {
      throw new FeatureUnavailableError('The onboarding creator no longer has an account-creation token', {
        code: 'ONBOARDING_NO_ACCOUNT_TOKEN',
      });
    }
    const exactDelegation = parseAsset(record.prepared.delegationVests, 'VESTS');
    if (!exactDelegation) {
      throw new FeatureUnavailableError('The exact onboarding delegation could not be recovered from durable state', {
        code: 'ONBOARDING_DELEGATION_INVALID',
      });
    }
    const capacity = capacityState(
      creator,
      exactDelegation,
      this.config.minRemainingHp,
      globalProperties,
    );
    if (!capacity.sufficient) {
      throw new FeatureUnavailableError(
        `The onboarding creator cannot fund this starter delegation while retaining the required ${this.config.minRemainingHp.display} reserve`,
        { code: 'ONBOARDING_INSUFFICIENT_HP' },
      );
    }

    return this.#preparedResponse(this.store.beginBroadcast(id));
  }

  recordBroadcast(
    id,
    { staffAccount, transactionId = null, ambiguous = false, cancelled = false },
  ) {
    this.#requireStore();
    this.#requireStaff(staffAccount);
    const updated = this.store.recordBroadcast(id, {
      transactionId,
      ambiguous,
      cancelled,
    });
    return staffRecord(updated);
  }

  cancel(id, { staffAccount }) {
    this.#requireStore();
    this.#requireStaff(staffAccount);
    return staffRecord(this.store.cancel(id));
  }

  async observe(id, { staffAccount } = {}) {
    this.#requireStore();
    if (staffAccount) this.#requireStaff(staffAccount);
    const record = this.store.get(id);
    if (!['signing', 'observing', 'complete'].includes(record.status)) return safeRecord(record);
    const observed = record.status === 'complete' ? record : await this.#observeRecord(record);
    return safeRecord(observed);
  }

  #preparedResponse(record) {
    return Object.freeze({
      request: staffRecord(record),
      creator: record.creator,
      authority: record.prepared.authority,
      operations: record.prepared.operations,
      fingerprint: record.prepared.fingerprint,
      starterHp: record.starterHp,
      delegationVests: record.prepared.delegationVests,
      cashFeeUsd: record.cashFeeUsd,
    });
  }

  async #readiness(record) {
    if (['signing', 'observing'].includes(record.status)) {
      return {
        ready: false,
        code: 'ONBOARDING_NO_RETRY',
        message: 'This request has already reached Keychain. Observe it; do not prepare or broadcast again.',
        warning: null,
        record,
        accountTokenAvailable: false,
        accountTokenCount: null,
        accountTokenLow: false,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
      };
    }
    const lane = this.store.mutationLane(this.config.creator);
    if (lane && lane.id !== record.id) {
      return {
        ready: false,
        code: 'ONBOARDING_CREATOR_LANE_BUSY',
        message: 'Another onboarding request already holds the creator transaction lane.',
        warning: null,
        record,
        accountTokenAvailable: false,
        accountTokenCount: null,
        accountTokenLow: false,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
      };
    }

    const [accounts, globalProperties] = await Promise.all([
      this.rpcPool.call('condenser_api', 'get_accounts', [[this.config.creator, record.username]]),
      this.rpcPool.call('condenser_api', 'get_dynamic_global_properties', []),
    ]);
    const rows = Array.isArray(accounts) ? accounts : [];
    if (rows.some((account) => account?.name === record.username)) {
      return {
        ready: false,
        code: 'ONBOARDING_USERNAME_TAKEN',
        message: 'That Hive username is no longer available.',
        warning: null,
        record,
        accountTokenAvailable: false,
        accountTokenCount: null,
        accountTokenLow: false,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
      };
    }

    const creator = rows.find((account) => account?.name === this.config.creator);
    if (!creator) {
      return {
        ready: false,
        code: 'ONBOARDING_CREATOR_UNAVAILABLE',
        message: 'The configured onboarding creator account is unavailable.',
        warning: null,
        record,
        accountTokenAvailable: false,
        accountTokenCount: null,
        accountTokenLow: false,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
      };
    }
    const tokenState = accountTokenState(creator, this.config.lowActThreshold);
    if (!tokenState.available) {
      return {
        ready: false,
        code: 'ONBOARDING_NO_ACCOUNT_TOKEN',
        message: 'The onboarding creator does not currently have an account-creation token.',
        warning: null,
        record,
        accountTokenAvailable: false,
        accountTokenCount: tokenState.count,
        accountTokenLow: false,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
      };
    }

    const delegationVests = record.prepared
      ? parseAsset(record.prepared.delegationVests, 'VESTS')
      : hpToVests(this.config.starterHp.units, globalProperties);
    if (!delegationVests) {
      throw new FeatureUnavailableError('The exact onboarding delegation could not be recovered from durable state', {
        code: 'ONBOARDING_DELEGATION_INVALID',
      });
    }
    const capacity = capacityState(
      creator,
      delegationVests,
      this.config.minRemainingHp,
      globalProperties,
    );
    if (!capacity.sufficient) {
      return {
        ready: false,
        code: 'ONBOARDING_INSUFFICIENT_HP',
        message: `The onboarding creator does not currently have enough available Hive Power for the starter delegation while retaining the required ${this.config.minRemainingHp.display} reserve.`,
        warning: tokenState.warning,
        record,
        accountTokenAvailable: true,
        accountTokenCount: tokenState.count,
        accountTokenLow: tokenState.low,
        starterDelegationAvailable: false,
        postDelegationReserveAvailable: false,
        delegationVests,
        reserveVests: capacity.reserveVests,
      };
    }

    return {
      ready: true,
      code: 'ONBOARDING_READY',
      message: `Creator resources are ready and will retain at least ${this.config.minRemainingHp.display} after the starter delegation.`,
      warning: tokenState.warning,
      record,
      accountTokenAvailable: true,
      accountTokenCount: tokenState.count,
      accountTokenLow: tokenState.low,
      starterDelegationAvailable: true,
      postDelegationReserveAvailable: true,
      delegationVests,
      reserveVests: capacity.reserveVests,
    };
  }

  async #observeRecord(record) {
    const accounts = await this.rpcPool.call('condenser_api', 'get_accounts', [[record.username]]);
    const account = Array.isArray(accounts)
      ? accounts.find((item) => item?.name === record.username)
      : null;
    if (!account) return this.store.get(record.id);
    if (!accountKeysMatch(account, record.publicKeys)) {
      return this.store.markConflict(record.id, 'created-account-keys-do-not-match-request');
    }

    const expected = parseAsset(record.prepared?.delegationVests, 'VESTS');
    if (!expected) {
      return this.store.markConflict(record.id, 'durable-delegation-state-missing');
    }
    const delegations = await this.rpcPool.call('condenser_api', 'get_vesting_delegations', [
      record.creator,
      record.username,
      1,
    ]);
    const delegation = Array.isArray(delegations)
      ? delegations.find(
          (item) => item?.delegator === record.creator && item?.delegatee === record.username,
        )
      : null;
    const actual = parseAsset(delegation?.vesting_shares, 'VESTS');
    if (!actual || actual.units !== expected.units) return this.store.get(record.id);

    return this.store.markComplete(record.id);
  }

  #requireActive() {
    if (!this.config.active) {
      throw new FeatureUnavailableError('In-person Hive account creation is not active yet', {
        code: 'ONBOARDING_DISABLED',
      });
    }
    this.#requireStore();
  }

  #requireStore() {
    if (!this.store) {
      throw new FeatureUnavailableError('In-person onboarding storage is unavailable', {
        code: 'ONBOARDING_STORE_UNAVAILABLE',
        cause: this.unavailableCause,
      });
    }
  }

  #requireStaff(account) {
    if (!account || account !== this.config.creator) {
      throw new AuthorizationError(
        `Sign in as @${this.config.creator || 'the onboarding creator'} before approving this account`,
        { code: 'ONBOARDING_CREATOR_REQUIRED' },
      );
    }
  }
}

module.exports = { OnboardingService, safeRecord, staffRecord };
