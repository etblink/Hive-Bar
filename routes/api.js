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

router.get('/transactions/:username', (req, _res, next) => {
  try {
    requireHiveAccount(req.params.username);
    next(new FeatureUnavailableError('Transaction classification is not part of M2'));
  } catch (error) {
    next(error);
  }
});

router.post('/wall-post', (_req, _res, next) => {
  next(new FeatureUnavailableError('Wall-post transfers are outside the authorized M3 social-write scope'));
});

module.exports = router;
