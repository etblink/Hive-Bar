'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { FeatureUnavailableError, NotFoundError } = require('../src/lib/errors');

const router = express.Router();

async function followStateForSession(req, target) {
  if (!req.hiveSession || req.hiveSession.account === target) return null;
  try {
    return await req.app.locals.services.hiveReads.getFollowStatus(
      req.hiveSession.account,
      target,
    );
  } catch (error) {
    req.log.warn({ err: error }, 'follow status read failed');
    return null;
  }
}

router.get('/api/followers/:username', async (req, res, next) => {
  try {
    const users = await req.app.locals.services.hiveReads.getFollowers(req.params.username);
    res.render('pages/profile/partials/follow-list', {
      users,
      emptyMessage: 'This user has no followers yet.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/following/:username', async (req, res, next) => {
  try {
    const users = await req.app.locals.services.hiveReads.getFollowing(req.params.username);
    res.render('pages/profile/partials/follow-list', {
      users,
      emptyMessage: 'This user is not following anyone yet.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/follow-status/:follower/:following', async (req, res, next) => {
  try {
    const isFollowing = await req.app.locals.services.hiveReads.getFollowStatus(
      req.params.follower,
      req.params.following,
    );
    res.set('Cache-Control', 'no-store').json({ isFollowing });
  } catch (error) {
    next(error);
  }
});

router.get('/:username/blogs', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, postsPage] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getAccountPosts({
        account: username,
        cursor: req.query.after,
      }),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    res.render('pages/profile/partials/user-blog-posts', { postsPage, userProfile });
  } catch (error) {
    next(error);
  }
});

router.get('/:username/wallet', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, wallet, followState] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getWallet(username),
      followStateForSession(req, username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');

    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/user-wallet', { userProfile, wallet });
    }
    return res.render('pages/profile/index', {
      pageTitle: `@${username} wallet — ${req.app.locals.config.site.name}`,
      activeView: 'wallet',
      postsPage: null,
      userProfile,
      wallet,
      followState,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/wall-posts', (req, res, next) => {
  try {
    requireHiveAccount(req.params.username);
    res.render('common/feature-unavailable', {
      title: 'Wall posts are being rebuilt',
      message:
        'The public wall will return after its fee and message-classification protections are complete.',
    });
  } catch (error) {
    next(error);
  }
});

for (const suffix of ['inbox', 'settings']) {
  router.get(`/:username/${suffix}`, (req, _res, next) => {
    try {
      requireHiveAccount(req.params.username);
      next(new FeatureUnavailableError('Verified owner access will be enabled in a later milestone'));
    } catch (error) {
      next(error);
    }
  });
}

router.post('/update-settings', (_req, _res, next) => {
  next(new FeatureUnavailableError('Profile updates remain disabled in the read-only milestone'));
});

router.get('/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, postsPage, followState] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getAccountPosts({
        account: username,
        cursor: req.query.after,
      }),
      followStateForSession(req, username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');

    res.render('pages/profile/index', {
      pageTitle: `@${username} — ${req.app.locals.config.site.name}`,
      activeView: 'posts',
      postsPage,
      userProfile,
      wallet: null,
      followState,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
