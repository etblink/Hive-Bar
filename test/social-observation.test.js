'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { HiveReadService } = require('../src/hive/read-service');

function serviceWith(responses) {
  const calls = [];
  return {
    calls,
    service: new HiveReadService({
      async call(api, method, params) {
        calls.push({ api, method, params: structuredClone(params) });
        return responses[`${api}.${method}`];
      },
    }),
  };
}

test('observes content and exact vote weight through read-only Bridge calls', async () => {
  const { service } = serviceWith({
    'bridge.get_post': {
      author: 'barfriend',
      permlink: 'hello-reno',
      active_votes: [{ voter: 'etblink', percent: 3700 }],
    },
  });
  assert.equal(
    await service.observeSocialOperation({
      operations: [
        ['comment', { author: 'barfriend', permlink: 'hello-reno' }],
      ],
    }),
    true,
  );
  assert.equal(
    await service.observeSocialOperation({
      operations: [
        ['vote', { voter: 'etblink', author: 'barfriend', permlink: 'hello-reno', weight: 3700 }],
      ],
    }),
    true,
  );
});

test('observes follow and subscription state without optimistic UI assumptions', async () => {
  const follow = serviceWith({
    'condenser_api.get_following': [{ follower: 'etblink', following: 'barfriend', what: ['blog'] }],
  }).service;
  assert.equal(
    await follow.observeSocialOperation({
      account: 'etblink',
      operations: [
        [
          'custom_json',
          {
            id: 'follow',
            json: '["follow",{"follower":"etblink","following":"barfriend","what":["blog"]}]',
          },
        ],
      ],
    }),
    true,
  );

  const membership = serviceWith({
    'bridge.get_community': { context: { subscribed: false } },
  }).service;
  assert.equal(
    await membership.observeSocialOperation({
      account: 'etblink',
      operations: [
        [
          'custom_json',
          {
            id: 'community',
            json: '["unsubscribe",{"community":"hive-108590"}]',
          },
        ],
      ],
    }),
    true,
  );
});
