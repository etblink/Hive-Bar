'use strict';

const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('pages/home/index', { pageTitle: res.app.locals.siteName });
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

module.exports = router;
