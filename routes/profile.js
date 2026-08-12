'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { AuthorizationError, NotFoundError } = require('../src/lib/errors');

const router = express.Router();

function isProfileOwner(req, username) {
  return req.hiveSession?.account === username;
}

function requireProfileOwner(req, username) {
  if (!req.hiveSession) {
    throw new AuthorizationError('Sign in with Hive Keychain to open this owner-only page', {
      code: 'SESSION_REQUIRED',
      statusCode: 401,
    });
  }
  if (!isProfileOwner(req, username)) {
    throw new AuthorizationError('Only the verified profile owner may open this page', {
      code: 'PROFILE_OWNER_REQUIRED',
    });
  }
}

function pageModel(req, username, activeView, values = {}) {
  return {
    pageTitle: `@${username} ${activeView} — ${req.app.locals.config.site.name}`,
    activeView,
    userProfile: null,
    postsPage: null,
    wallet: null,
    users: null,
    wallPage: null,
    inboxPage: null,
    profileSettings: null,
    followState: null,
    canManageProfile: isProfileOwner(req, username),
    ...values,
  };
}

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
      return res.render('pages/profile/partials/user-wallet', {
        userProfile,
        wallet,
        canManageProfile: isProfileOwner(req, username),
      });
    }
    return res.render('pages/profile/index', pageModel(req, username, 'wallet', {
      userProfile,
      wallet,
      followState,
    }));
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/wall-posts', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, profileSettings, followState] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getProfileSettings(username, {
        defaultWallFee: req.app.locals.config.hive.defaultWallFee,
      }),
      followStateForSession(req, username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    const wallPage = await req.app.locals.services.hiveReads.getMessageHistory({
      account: username,
      cursor: req.query.before,
      kind: 'wall',
      minimumFee: profileSettings.wallFee,
      globalExclusions: req.app.locals.config.hive.globalWallExclusions,
      profileExclusions: profileSettings.blocklist,
    });
    const values = { userProfile, profileSettings, wallPage, followState };
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/wall-posts', {
        ...values,
        canManageProfile: isProfileOwner(req, username),
      });
    }
    return res.render('pages/profile/index', pageModel(req, username, 'wall', values));
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/followers', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, users, followState] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getFollowers(username),
      followStateForSession(req, username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    const values = {
      userProfile,
      users,
      followState,
      connectionKind: 'followers',
      connectionEmptyMessage: 'This account has no followers yet.',
    };
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/connections', values);
    }
    return res.render('pages/profile/index', pageModel(req, username, 'followers', values));
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/following', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [userProfile, users, followState] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getFollowing(username),
      followStateForSession(req, username),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    const values = {
      userProfile,
      users,
      followState,
      connectionKind: 'following',
      connectionEmptyMessage: 'This account is not following anyone yet.',
    };
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/connections', values);
    }
    return res.render('pages/profile/index', pageModel(req, username, 'following', values));
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/inbox', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    requireProfileOwner(req, username);
    res.set('Cache-Control', 'no-store');
    const [userProfile, profileSettings] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getProfileSettings(username, {
        defaultWallFee: req.app.locals.config.hive.defaultWallFee,
      }),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    const inboxPage = await req.app.locals.services.hiveReads.getMessageHistory({
      account: username,
      cursor: req.query.before,
      kind: 'inbox',
      minimumFee: profileSettings.wallFee,
      globalExclusions: req.app.locals.config.hive.globalWallExclusions,
      profileExclusions: profileSettings.blocklist,
    });
    const values = { userProfile, profileSettings, inboxPage };
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/inbox', values);
    }
    return res.render('pages/profile/index', pageModel(req, username, 'inbox', values));
  } catch (error) {
    return next(error);
  }
});

router.get('/:username/settings', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    requireProfileOwner(req, username);
    res.set('Cache-Control', 'no-store');
    const [userProfile, profileSettings] = await Promise.all([
      req.app.locals.services.hiveReads.getProfile(username),
      req.app.locals.services.hiveReads.getProfileSettings(username, {
        defaultWallFee: req.app.locals.config.hive.defaultWallFee,
      }),
    ]);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    const values = { userProfile, profileSettings };
    if (req.get('HX-Request') === 'true') {
      return res.render('pages/profile/partials/settings', values);
    }
    return res.render('pages/profile/index', pageModel(req, username, 'settings', values));
  } catch (error) {
    return next(error);
  }
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

    res.render('pages/profile/index', pageModel(req, username, 'posts', {
      userProfile,
      postsPage,
      followState,
    }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.isProfileOwner = isProfileOwner;
module.exports.requireProfileOwner = requireProfileOwner;
