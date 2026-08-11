'use strict';

const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('pages/home/index', { pageTitle: res.app.locals.siteName });
});

module.exports = router;
