'use strict';

let rpcPool;

function configureHiveClient(pool) {
  rpcPool = pool;
}

function getRpcPool() {
  if (!rpcPool) throw new Error('Hive RPC client has not been configured');
  return rpcPool;
}

async function call(api, method, params) {
  return getRpcPool().call(api, method, params);
}

const database = {
  getAccounts(accounts) {
    return call('condenser_api', 'get_accounts', [accounts]);
  },
  getDiscussions(type, query) {
    return call('condenser_api', `get_discussions_by_${type}`, [query]);
  },
  call(method, params) {
    return call('condenser_api', method, params);
  },
};

module.exports = {
  call,
  configureHiveClient,
  database,
  getRpcPool,
};
