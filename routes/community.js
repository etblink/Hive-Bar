'use strict';

const express = require('express');
const {
  requireCommunitySort,
  requireConfiguredCommunity,
  requireHiveAccount,
} = require('../src/http/validation');
const { NotFoundError } = require('../src/lib/errors');

const router = express.Router();

async function requireCommunity(req) {
  const communityId = req.app.locals.config.hive.communityId;
  const communityInfo = await req.app.locals.services.hiveReads.getCommunity(communityId);
  if (!communityInfo) throw new NotFoundError('The configured community was not found');
  return communityInfo;
}

async function membershipForSession(req) {
  if (!req.hiveSession) return null;
  try {
    return await req.app.locals.services.hiveReads.isCommunityMember(
      req.hiveSession.account,
      req.app.locals.config.hive.communityId,
    );
  } catch (error) {
    req.log.warn({ err: error }, 'community membership read failed');
    return null;
  }
}

async function communityPostsForRequest(req, { name, sort, cursor }) {
  const hiveReads = req.app.locals.services.hiveReads;
  const container = await hiveReads.getLatestThreadContainer(
    req.app.locals.config.hive.threadsContainerAccount,
  );
  return hiveReads.getCommunityPosts({
    name,
    sort,
    cursor,
    excludeContent: container,
  });
}

router.get('/', async (req, res, next) => {
  try {
    const communityId = req.app.locals.config.hive.communityId;
    const sort = requireCommunitySort(req.query.sort || 'created');
    const [communityInfo, membership] = await Promise.all([
      requireCommunity(req),
      membershipForSession(req),
    ]);
    let postsPage = null;
    let feedError = false;

    try {
      postsPage = await communityPostsForRequest(req, {
        name: communityId,
        sort,
        cursor: req.query.after,
      });
    } catch (error) {
      feedError = true;
      req.log.warn({ err: error }, 'community feed read failed while community info remained available');
    }

    res.render('pages/community/index', {
      pageTitle: `Community — ${req.app.locals.config.site.name}`,
      activeView: 'posts',
      communityInfo,
      communityName: communityId,
      feedError,
      postsPage,
      threadsData: null,
      membership,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/threads', async (req, res, next) => {
  try {
    const threadsData = await req.app.locals.services.hiveReads.getLatestThreads(
      req.app.locals.config.hive.threadsContainerAccount,
    );
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/community/partials/community-thread-list', {
        ...threadsData,
        threadsContainerAccount: req.app.locals.config.hive.threadsContainerAccount,
      });
    }

    const [communityInfo, membership] = await Promise.all([
      requireCommunity(req),
      membershipForSession(req),
    ]);
    return res.render('pages/community/index', {
      pageTitle: `Threads — ${req.app.locals.config.site.name}`,
      activeView: 'threads',
      communityInfo,
      communityName: req.app.locals.config.hive.communityId,
      feedError: false,
      postsPage: null,
      threadsData,
      membership,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:communityName/community-posts', async (req, res, next) => {
  try {
    const communityName = requireConfiguredCommunity(
      req.params.communityName,
      req.app.locals.config,
    );
    const sort = requireCommunitySort(req.query.sort || 'created');
    const postsPage = await communityPostsForRequest(req, {
      name: communityName,
      sort,
      cursor: req.query.after,
    });

    res.render('pages/community/partials/community-post-list', {
      communityName,
      postsPage,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/community/:communityName/subscribers', async (req, res, next) => {
  try {
    const communityName = requireConfiguredCommunity(
      req.params.communityName,
      req.app.locals.config,
    );
    const subscribers = await req.app.locals.services.hiveReads.listCommunitySubscribers(
      communityName,
      req.query.lastSubscriber || '',
    );
    res.set('Cache-Control', 'public, max-age=60').json(subscribers);
  } catch (error) {
    next(error);
  }
});

router.get('/check-membership', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.query.username);
    const community = requireConfiguredCommunity(req.query.community, req.app.locals.config);
    const isMember = await req.app.locals.services.hiveReads.isCommunityMember(
      username,
      community,
    );
    res.set('Cache-Control', 'no-store').json({ isMember });
  } catch (error) {
    next(error);
  }
});

router.get('/api/latest-thread-container', async (req, res, next) => {
  try {
    const container = await req.app.locals.services.hiveReads.getLatestThreadContainer(
      req.app.locals.config.hive.threadsContainerAccount,
    );
    if (!container) throw new NotFoundError('No thread container is available yet');
    res.set('Cache-Control', 'public, max-age=30').json(container);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
