'use strict';

const { createFixtureRpc, fixture } = require('./fixture-rpc');

function content(overrides) {
  return {
    ...structuredClone(fixture.communityPosts[0]),
    active_votes: [],
    ...overrides,
  };
}

function createUx1aRpc({ populated = false } = {}) {
  const baseRpc = createFixtureRpc();
  const calls = [];
  const container = content({
    author: 'fourthst.threads',
    permlink: 'threads-2026-08-20',
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Technical Threads Container — Do Not Display',
    body: 'Application plumbing for Threads.',
  });
  const ordinary = content({
    author: 'etblink',
    permlink: 'ordinary-community-post',
    title: 'Ordinary community post remains visible',
    body: 'This is normal community content.',
  });
  const legitimateSameAuthor = content({
    author: 'fourthst.threads',
    permlink: 'legitimate-community-update',
    title: 'Legitimate update from the Threads account',
    body: 'This is not the active container and must remain visible.',
  });
  const thread = content({
    author: 'barfriend',
    permlink: 'a-normal-thread',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Who is stopping by the bar tonight?',
    created: '2026-08-20T17:00:00',
  });
  const reply = content({
    author: 'etblink',
    permlink: 're-a-normal-thread',
    parent_author: thread.author,
    parent_permlink: thread.permlink,
    title: '',
    body: 'I will be there after work.',
    created: '2026-08-20T17:05:00',
  });

  return {
    calls,
    getStatus: baseRpc.getStatus,
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      const key = `${api}.${method}`;
      if (key === 'bridge.get_ranked_posts') {
        return structuredClone([container, ordinary, legitimateSameAuthor]);
      }
      if (key === 'bridge.get_account_posts' && params.account === 'fourthst.threads') {
        return [structuredClone(container)];
      }
      if (
        key === 'bridge.get_discussion' &&
        params.author === container.author &&
        params.permlink === container.permlink
      ) {
        const discussion = {
          [`${container.author}/${container.permlink}`]: container,
        };
        if (populated) {
          discussion[`${thread.author}/${thread.permlink}`] = thread;
          discussion[`${reply.author}/${reply.permlink}`] = reply;
        }
        return structuredClone(discussion);
      }
      if (key === 'bridge.get_profiles') {
        const known = [
          ...fixture.profiles,
          { name: 'fourthst.threads', metadata: {}, stats: {} },
        ];
        return structuredClone(known.filter((profile) => params.accounts.includes(profile.name)));
      }
      return baseRpc.call(api, method, params);
    },
  };
}

module.exports = { createUx1aRpc };
