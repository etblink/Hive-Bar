'use strict';

const express = require('express');
const { requireCommunitySort, requireConfiguredCommunity, requireHiveAccount } = require('../src/http/validation');
const { NotFoundError } = require('../src/lib/errors');
const { fetchCommunityInfo, fetchCommunityPosts } = require('../utils/communities/fetchCommunityData');
const hiveClient = require('../utils/hiveClient');
const { checkCommunityMembership } = require('../utils/hiveApi');
const { fetchUserProfile } = require('../utils/profiles/fetchProfileData');
const md = require('../utils/remarkableInstance');

const router = express.Router();

async function parseMarkdown(posts) {
  return Promise.all(
    posts.map(async (post) => {
      const votes = await hiveClient.call('condenser_api', 'get_active_votes', [post.author, post.permlink]);
      return {
        ...post,
        parsedBody: md.render(post.body),
        likes: votes.filter((vote) => Number(vote.percent) > 0).length,
      };
    }),
  );
}

async function fetchLatestThreadContainer(config) {
  const posts = await hiveClient.call('condenser_api', 'get_discussions_by_blog', [
    { tag: config.hive.threadsContainerAccount, limit: 1 },
  ]);
  return posts[0] || null;
}

async function fetchCommunitySubscribers(community, lastSubscriber = '') {
  const params = { community, limit: 100 };
  if (lastSubscriber) params.last = requireHiveAccount(lastSubscriber, 'Last subscriber');
  const subscribers = await hiveClient.call('bridge', 'list_subscribers', params);
  return subscribers.map((subscriber) => ({
    name: subscriber[0],
    role: subscriber[1],
    date: subscriber[3],
  }));
}

router.get('/', async (req, res, next) => {
  try {
    const communityId = req.app.locals.config.hive.communityId;
    const communityInfo = await fetchCommunityInfo(communityId);
    if (!communityInfo) throw new NotFoundError('The configured community was not found');

    res.render('pages/community/index', {
      pageTitle: `Community — ${req.app.locals.config.site.name}`,
      communityInfo,
      communityName: communityId,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/threads', async (req, res, next) => {
  try {
    const container = await fetchLatestThreadContainer(req.app.locals.config);
    const threads = container
      ? await hiveClient.call('condenser_api', 'get_content_replies', [
          container.author,
          container.permlink,
        ])
      : [];
    const parsedThreads = await parseMarkdown(threads);
    res.render('pages/community/partials/community-thread-list', {
      threads: parsedThreads,
      threadContainer: container,
      threadsContainerAccount: req.app.locals.config.hive.threadsContainerAccount,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:communityName/community-posts', async (req, res, next) => {
  try {
    const communityName = requireConfiguredCommunity(req.params.communityName, req.app.locals.config);
    const sort = requireCommunitySort(req.query.sort);
    const posts = await fetchCommunityPosts(communityName, 20, sort);
    const parsedPosts = await parseMarkdown(posts);
    const authors = [...new Set(parsedPosts.map((post) => post.author))];
    const profileEntries = await Promise.all(
      authors.map(async (author) => [author, await fetchUserProfile(author)]),
    );

    res.render('pages/community/partials/community-post-list', {
      posts: parsedPosts,
      userProfile: Object.fromEntries(profileEntries),
      communityName,
      activeSort: sort,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/community/:communityName/subscribers', async (req, res, next) => {
  try {
    const communityName = requireConfiguredCommunity(req.params.communityName, req.app.locals.config);
    const subscribers = await fetchCommunitySubscribers(communityName, req.query.lastSubscriber || '');
    res.set('Cache-Control', 'public, max-age=60').json(subscribers);
  } catch (error) {
    next(error);
  }
});

router.get('/check-membership', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.query.username);
    const community = requireConfiguredCommunity(req.query.community, req.app.locals.config);
    const isMember = await checkCommunityMembership(username, community);
    res.set('Cache-Control', 'no-store').json({ isMember });
  } catch (error) {
    next(error);
  }
});

router.get('/api/latest-thread-container', async (req, res, next) => {
  try {
    const container = await fetchLatestThreadContainer(req.app.locals.config);
    if (!container) throw new NotFoundError('No thread container is available yet');
    res.set('Cache-Control', 'public, max-age=30').json(container);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
