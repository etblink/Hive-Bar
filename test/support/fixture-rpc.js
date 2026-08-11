'use strict';

const fixture = require('../fixtures/hive/m2-read-slice.json');

function clone(value) {
  return structuredClone(value);
}

function createFixtureRpc() {
  const calls = [];

  return {
    calls,
    getStatus: () => [],
    async call(api, method, params) {
      calls.push({ api, method, params: clone(params) });
      const key = `${api}.${method}`;

      if (key === 'bridge.get_community') return clone(fixture.community);
      if (key === 'bridge.get_ranked_posts') return clone(fixture.communityPosts);
      if (key === 'bridge.get_account_posts') {
        return params.account === 'fourthst.threads' ? [] : clone(fixture.communityPosts);
      }
      if (key === 'bridge.get_discussion') return clone(fixture.discussion);
      if (key === 'bridge.get_post') return clone(fixture.communityPosts[0]);
      if (key === 'bridge.get_profile') {
        return clone(fixture.profiles.find((profile) => profile.name === params.account) || null);
      }
      if (key === 'bridge.get_profiles') {
        return clone(fixture.profiles.filter((profile) => params.accounts.includes(profile.name)));
      }
      if (key === 'bridge.list_subscribers') return clone(fixture.subscribers);
      if (key === 'condenser_api.get_accounts') {
        return clone(fixture.accounts.filter((account) => params[0].includes(account.name)));
      }
      if (key === 'condenser_api.get_dynamic_global_properties') {
        return clone(fixture.globalProperties);
      }
      if (key === 'condenser_api.get_followers') return clone(fixture.followers);
      if (key === 'condenser_api.get_following') return clone(fixture.following);
      if (key === 'rc_api.find_rc_accounts') return clone(fixture.rcAccounts);

      throw new Error(`Fixture has no response for ${key}`);
    },
  };
}

module.exports = { createFixtureRpc, fixture };
