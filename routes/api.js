'use strict';

const express = require('express');
const { requireHiveAccount } = require('../src/http/validation');
const { FeatureUnavailableError, NotFoundError } = require('../src/lib/errors');
const { getAccounts, getDynamicGlobalProperties, getResourceCredits, getVotingPower } = require('../utils/hiveApi');
const { fetchUserPosts, fetchUserProfile } = require('../utils/profiles/fetchProfileData');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/profile/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const userProfile = await fetchUserProfile(username);
    if (!userProfile) throw new NotFoundError('Hive account not found');
    res.json(userProfile);
  } catch (error) {
    next(error);
  }
});

router.get('/balance/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    const [accounts, globalProps] = await Promise.all([
      getAccounts([username]),
      getDynamicGlobalProperties(),
    ]);
    if (!accounts[0]) throw new NotFoundError('Hive account not found');

    const account = accounts[0];
    const [resourceCredits, votingPower] = await Promise.all([
      getResourceCredits(username),
      getVotingPower(account),
    ]);
    const ownVests = Number.parseFloat(account.vesting_shares);
    const receivedVests = Number.parseFloat(account.received_vesting_shares);
    const delegatedVests = Number.parseFloat(account.delegated_vesting_shares);
    const effectiveVests = ownVests + receivedVests - delegatedVests;
    const hivePower =
      effectiveVests *
      (Number.parseFloat(globalProps.total_vesting_fund_hive) /
        Number.parseFloat(globalProps.total_vesting_shares));

    res.json({
      hbdBalance: account.hbd_balance,
      hiveBalance: account.balance,
      hivePower: Number(hivePower.toFixed(3)),
      resourceCreditsPercent: Number(resourceCredits),
      votingPowerPercent: Number(votingPower),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:username', async (req, res, next) => {
  try {
    const username = requireHiveAccount(req.params.username);
    res.json(await fetchUserPosts(username));
  } catch (error) {
    next(error);
  }
});

router.get('/transactions/:username', (req, _res, next) => {
  try {
    requireHiveAccount(req.params.username);
    next(new FeatureUnavailableError('Transaction classification is disabled during M1'));
  } catch (error) {
    next(error);
  }
});

router.post('/wall-post', (_req, _res, next) => {
  next(new FeatureUnavailableError('Wall-post writes are disabled during M1'));
});

module.exports = router;
