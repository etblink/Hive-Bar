'use strict';

const express = require('express');

const router = express.Router();

router.get('/post/:author/:permlink', async (req, res, next) => {
  try {
    const discussion = await req.app.locals.services.hiveReads.getPostWithComments(
      req.params.author,
      req.params.permlink,
    );
    const viewData = {
      ...discussion,
      communityName: req.app.locals.config.hive.communityId,
    };

    if (req.get('HX-Request') === 'true') {
      return res.render('partials/full-post', viewData);
    }
    return res.render('pages/post/index', {
      ...viewData,
      pageTitle: `${discussion.post.title} — ${req.app.locals.config.site.name}`,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
