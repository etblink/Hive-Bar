'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { FeatureUnavailableError, NotFoundError } = require('../src/lib/errors');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/profile/:username', async (req, res, next) => {
  try {
    const profile = await req.app.locals.services.hiveReads.getProfile(req.params.username);
    if (!profile) throw new NotFoundError('Hive account not found');
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/balance/:username', async (req, res, next) => {
  try {
    res.json(await req.app.locals.services.hiveReads.getWallet(req.params.username));
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    res.json(
      await req.app.locals.services.hiveReads.getAccountPosts({
        account: username,
        cursor: req.query.after,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/transactions/:username', async (req, res, next) => {
  try {
    const account = requireHiveAccount(req.params.username);
    const config = req.app.locals.config;
    const settings = await req.app.locals.services.hiveReads.getProfileSettings(account, {
      defaultWallFee: config.hive.defaultWallFee,
    });
    const page = await req.app.locals.services.hiveReads.getMessageHistory({
      account,
      cursor: req.query.before,
      kind: 'wall',
      minimumFee: settings.wallFee,
      globalExclusions: config.hive.globalWallExclusions,
      profileExclusions: settings.blocklist,
    });
    res.json({ account, minimumFee: settings.wallFee, ...page });
  } catch (error) {
    next(error);
  }
});

router.post('/wall-post', (_req, _res, next) => {
  next(
    new FeatureUnavailableError(
      'Legacy wall writes are disabled; use the verified, session-bound M4 preflight flow',
    ),
  );
});

module.exports = router;
