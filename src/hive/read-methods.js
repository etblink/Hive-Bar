'use strict';

const READ_ONLY_RPC_METHODS = new Set([
  'bridge.get_account_posts',
  'bridge.get_community',
  'bridge.get_discussion',
  'bridge.get_post',
  'bridge.get_profile',
  'bridge.get_profiles',
  'bridge.get_ranked_posts',
  'bridge.list_subscribers',
  'condenser_api.get_accounts',
  'condenser_api.get_dynamic_global_properties',
  'condenser_api.get_followers',
  'condenser_api.get_following',
  'rc_api.find_rc_accounts',
]);

function assertReadOnlyRpcMethod(api, method) {
  const rpcMethod = method ? `${api}.${method}` : api;
  if (READ_ONLY_RPC_METHODS.has(rpcMethod)) return rpcMethod;

  const error = new Error('Hive RPC write or unknown method blocked by read-only policy');
  error.code = 'READ_ONLY_RPC_POLICY';
  throw error;
}

module.exports = { READ_ONLY_RPC_METHODS, assertReadOnlyRpcMethod };
