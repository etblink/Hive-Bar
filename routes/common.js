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

    const origin = req.app.locals.config.auth.appOrigin;
    const canonicalUrl = `${origin}/post/${encodeURIComponent(discussion.post.author)}/${encodeURIComponent(discussion.post.permlink)}`;
    const rawDescription = String(
      discussion.post.excerpt || `A post by @${discussion.post.author} in the 4th Street Bar community.`,
    ).replace(/\s+/g, ' ').trim();
    const socialDescription = rawDescription.slice(0, 200);

    return res.render('pages/post/index', {
      ...viewData,
      pageTitle: `${discussion.post.title} — ${req.app.locals.config.site.name}`,
      canonicalUrl,
      socialTitle: discussion.post.title,
      socialDescription,
      socialType: 'article',
      socialImage: `${origin}/images/fourth-street-bar-logo.jpg`,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
