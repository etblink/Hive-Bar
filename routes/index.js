'use strict';

const express = require('express');
const { createOnboardingRouter } = require('./onboarding');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { config, services } = req.app.locals;
    let officialUpdates = { items: [], status: 'empty' };
    try {
      const items = await services.hiveReads.getOfficialCommunityPosts({
        account: config.hive.officialBarAccount,
        community: config.hive.communityId,
        limit: 3,
      });
      officialUpdates = { items, status: items.length > 0 ? 'ready' : 'empty' };
    } catch (error) {
      req.log?.warn({ err: error }, 'Official home-page updates are unavailable');
      officialUpdates = { items: [], status: 'unavailable' };
    }
    res.render('pages/home/index', {
      pageTitle: res.app.locals.siteName,
      officialUpdates,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/faq', (req, res) => {
  res.render('pages/faq/index', {
    pageTitle: `FAQ — ${res.app.locals.siteName}`,
  });
});

router.get('/pay', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('pages/pay/index', {
    pageTitle: `Pay Tab — ${res.app.locals.siteName}`,
    payment: {
      enabled: req.app.locals.config.payments.enabled,
      merchants: req.app.locals.config.payments.merchantAccounts,
      maxHbd: req.app.locals.config.payments.maxHbd,
    },
    distriator: req.app.locals.config.distriator,
  });
});

router.use(createOnboardingRouter());

module.exports = router;
