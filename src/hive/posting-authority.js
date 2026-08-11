'use strict';

const { AuthenticationError } = require('../lib/errors');
const { requireHiveAccount } = require('../http/validation');

const MAX_AUTHORITY_DEPTH = 4;
const MAX_AUTHORITY_ACCOUNTS = 16;

function normalizedAuthority(authority) {
  const threshold = Number(authority?.weight_threshold);
  if (!Number.isSafeInteger(threshold) || threshold < 1) return null;

  const keyAuths = Array.isArray(authority.key_auths) ? authority.key_auths : [];
  const accountAuths = Array.isArray(authority.account_auths) ? authority.account_auths : [];
  return { threshold, keyAuths, accountAuths };
}

class PostingAuthorityVerifier {
  constructor(rpcPool, { maxDepth = MAX_AUTHORITY_DEPTH, maxAccounts = MAX_AUTHORITY_ACCOUNTS } = {}) {
    this.rpcPool = rpcPool;
    this.maxDepth = maxDepth;
    this.maxAccounts = maxAccounts;
  }

  async isAuthorized(accountValue, publicKey) {
    const account = requireHiveAccount(accountValue);
    const cache = new Map();
    const visited = new Set();
    return this.#authoritySatisfied(account, publicKey, cache, visited, 0);
  }

  async #authoritySatisfied(account, publicKey, cache, visited, depth) {
    if (depth > this.maxDepth || visited.has(account) || cache.size >= this.maxAccounts) return false;

    const rawAccount = await this.#getAccount(account, cache);
    if (!rawAccount) {
      if (depth === 0) {
        throw new AuthenticationError('The claimed Hive account does not exist', {
          code: 'AUTH_ACCOUNT_NOT_FOUND',
        });
      }
      return false;
    }

    const authority = normalizedAuthority(rawAccount.posting);
    if (!authority) return false;

    let weight = 0;
    for (const entry of authority.keyAuths) {
      const [authorizedKey, rawWeight] = Array.isArray(entry) ? entry : [];
      const keyWeight = Number(rawWeight);
      if (authorizedKey === publicKey && Number.isSafeInteger(keyWeight) && keyWeight > 0) {
        weight += keyWeight;
      }
    }
    if (weight >= authority.threshold) return true;

    const nextVisited = new Set(visited).add(account);
    for (const entry of authority.accountAuths) {
      const [authorizedAccountValue, rawWeight] = Array.isArray(entry) ? entry : [];
      const accountWeight = Number(rawWeight);
      let authorizedAccount;
      try {
        authorizedAccount = requireHiveAccount(authorizedAccountValue, 'Authorized Hive account');
      } catch {
        continue;
      }
      if (!Number.isSafeInteger(accountWeight) || accountWeight < 1) continue;

      if (
        await this.#authoritySatisfied(
          authorizedAccount,
          publicKey,
          cache,
          nextVisited,
          depth + 1,
        )
      ) {
        weight += accountWeight;
        if (weight >= authority.threshold) return true;
      }
    }

    return false;
  }

  async #getAccount(account, cache) {
    if (cache.has(account)) return cache.get(account);
    const result = await this.rpcPool.call('condenser_api', 'get_accounts', [[account]]);
    const found = Array.isArray(result) ? result.find((item) => item?.name === account) || null : null;
    cache.set(account, found);
    return found;
  }
}

module.exports = {
  MAX_AUTHORITY_ACCOUNTS,
  MAX_AUTHORITY_DEPTH,
  PostingAuthorityVerifier,
  normalizedAuthority,
};
