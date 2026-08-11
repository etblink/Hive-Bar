'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { FeatureUnavailableError, NotFoundError } = require('../src/lib/errors');
const { getFollowers, getFollowing, getFollowStatus } = require('../utils/hiveApi');
const { fetchUserPosts, fetchUserProfile } = require('../utils/profiles/fetchProfileData');

const router = express.Router();

router.get('/api/followers/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const followers = await getFollowers(username, '', 100);
    res.render('pages/profile/partials/follow-list', {
      users: followers,
      emptyMessage: 'This user has no followers yet.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/following/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const following = await getFollowing(username, '', 100);
    res.render('pages/profile/partials/follow-list', {
      users: following,
      emptyMessage: 'This user is not following anyone yet.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/follow-status/:follower/:following', async (req, res, next) => {
  try {
    const follower = requireHiveAccount(req.params.follower, 'Follower');
    const following = requireHiveAccount(req.params.following, 'Following account');
    res.set('Cache-Control', 'no-store').json({ isFollowing: await getFollowStatus(follower, following) });
  } catch (error) {
    next(error);
  }
});

router.get('/:username/blogs', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, userBlogPosts] = await Promise.all([
      fetchUserProfile(username),
      fetchUserPosts(username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    res.render('pages/profile/partials/user-blog-posts', { userProfile, userBlogPosts });
  } catch (error) {
    next(error);
  }
});

router.get('/:username/wall-posts', (req, res, next) => {
  try {
    requireHiveAccount(req.params.username);
    res.render('common/feature-unavailable', {
      title: 'Wall posts are being rebuilt',
      message: 'The public wall will return after its fee and message-classification protections are complete.',
    });
  } catch (error) {
    next(error);
  }
});

for (const suffix of ['wallet', 'inbox', 'settings']) {
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
  next(new FeatureUnavailableError('Profile updates are disabled during M1'));
});

router.get('/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, userBlogPosts] = await Promise.all([
      fetchUserProfile(username),
      fetchUserPosts(username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');

    res.render('pages/profile/index', {
      pageTitle: `@${username} — ${req.app.locals.config.site.name}`,
      userProfile,
      userBlogPosts,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
