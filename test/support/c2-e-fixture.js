'use strict';

const { createFixtureRpc, fixture } = require('./fixture-rpc');

function content(overrides) {
  return {
    ...structuredClone(fixture.communityPosts[0]),
    active_votes: [],
    ...overrides,
  };
}

function createC2eRpc() {
  const baseRpc = createFixtureRpc();
  const calls = [];
  const container = content({
    author: 'fourthst.threads',
    permlink: 'threads-c2-e',
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Technical Threads container',
    body: 'Technical container',
  });
  const root = content({
    author: 'visibleone',
    permlink: 'community-root',
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Visible community conversation',
    body: 'This Community post stays visible after local moderation.',
  });
  const hiddenAccountPost = content({
    author: 'spammer',
    permlink: 'hidden-account-post',
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Hidden account post',
    body: 'This must not render.',
  });
  const hiddenExactPost = content({
    author: 'bob',
    permlink: 'hidden-exact-post',
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Hidden exact post',
    body: 'This exact content must not render.',
  });
  const visibleThread = content({
    author: 'barfriend',
    permlink: 'visible-thread',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Visible Thread survives moderation.',
    created: '2026-08-21T18:00:00',
  });
  const hiddenThread = content({
    author: 'spammer',
    permlink: 'hidden-thread',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Hidden Thread parent must not render.',
    created: '2026-08-21T18:01:00',
  });
  const hiddenThreadChild = content({
    author: 'carol',
    permlink: 'child-of-hidden-thread',
    parent_author: hiddenThread.author,
    parent_permlink: hiddenThread.permlink,
    title: '',
    body: 'Descendant of hidden Thread must not render.',
    created: '2026-08-21T18:02:00',
  });
  const visibleThreadSibling = content({
    author: 'dave',
    permlink: 'visible-thread-sibling',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Visible sibling Thread remains.',
    created: '2026-08-21T18:03:00',
  });
  const hiddenReply = content({
    author: 'spammer',
    permlink: 'hidden-reply',
    parent_author: root.author,
    parent_permlink: root.permlink,
    title: '',
    body: 'Hidden reply must not render.',
    created: '2026-08-21T19:00:00',
  });
  const hiddenReplyChild = content({
    author: 'erin',
    permlink: 'hidden-reply-child',
    parent_author: hiddenReply.author,
    parent_permlink: hiddenReply.permlink,
    title: '',
    body: 'Descendant of hidden reply must not render.',
    created: '2026-08-21T19:01:00',
  });
  const visibleReply = content({
    author: 'frank',
    permlink: 'visible-reply',
    parent_author: root.author,
    parent_permlink: root.permlink,
    title: '',
    body: 'Visible sibling reply remains.',
    created: '2026-08-21T19:02:00',
  });

  const profiles = [
    ...fixture.profiles,
    'visibleone', 'spammer', 'bob', 'barfriend', 'carol', 'dave', 'erin', 'frank', 'fourthst.threads',
  ].map((entry) => typeof entry === 'string' ? { name: entry, metadata: {}, stats: {} } : entry);

  return {
    calls,
    getStatus: baseRpc.getStatus,
    root,
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      const key = `${api}.${method}`;
      if (key === 'bridge.get_ranked_posts') {
        return structuredClone([container, root, hiddenAccountPost, hiddenExactPost]);
      }
      if (key === 'bridge.get_account_posts' && params.account === 'fourthst.threads') {
        return [structuredClone(container)];
      }
      if (
        key === 'bridge.get_discussion' &&
        params.author === container.author &&
        params.permlink === container.permlink
      ) {
        return structuredClone({
          [`${container.author}/${container.permlink}`]: container,
          [`${visibleThread.author}/${visibleThread.permlink}`]: visibleThread,
          [`${hiddenThread.author}/${hiddenThread.permlink}`]: hiddenThread,
          [`${hiddenThreadChild.author}/${hiddenThreadChild.permlink}`]: hiddenThreadChild,
          [`${visibleThreadSibling.author}/${visibleThreadSibling.permlink}`]: visibleThreadSibling,
        });
      }
      if (
        key === 'bridge.get_discussion' &&
        params.author === root.author &&
        params.permlink === root.permlink
      ) {
        return structuredClone({
          [`${root.author}/${root.permlink}`]: root,
          [`${hiddenReply.author}/${hiddenReply.permlink}`]: hiddenReply,
          [`${hiddenReplyChild.author}/${hiddenReplyChild.permlink}`]: hiddenReplyChild,
          [`${visibleReply.author}/${visibleReply.permlink}`]: visibleReply,
        });
      }
      if (key === 'bridge.get_profiles') {
        return structuredClone(profiles.filter((profile) => params.accounts.includes(profile.name)));
      }
      return baseRpc.call(api, method, params);
    },
  };
}

module.exports = { createC2eRpc };
