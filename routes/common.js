'use strict';

const express = require('express');
const { requireHiveAccount, requirePermlink } = require('../src/http/validation');
const { NotFoundError } = require('../src/lib/errors');
const hiveClient = require('../utils/hiveClient');
const md = require('../utils/remarkableInstance');

const router = express.Router();

async function withRenderedBody(item) {
  const votes = await hiveClient.call('condenser_api', 'get_active_votes', [item.author, item.permlink]);
  return {
    ...item,
    parsedBody: md.render(item.body),
    likes: votes.filter((vote) => Number(vote.percent) > 0).length,
  };
}

router.get('/post/:author/:permlink', async (req, res, next) => {
  try {
    const author = requireHiveAccount(req.params.author, 'Author');
    const permlink = requirePermlink(req.params.permlink);
    const post = await hiveClient.call('bridge', 'get_post', { author, permlink });
    if (!post || !post.author) throw new NotFoundError('Post not found');

    const replies = await hiveClient.call('condenser_api', 'get_content_replies', [author, permlink]);
    const [parsedPost, comments] = await Promise.all([
      withRenderedBody(post),
      Promise.all(replies.map(withRenderedBody)),
    ]);

    res.render('partials/full-post', {
      post: parsedPost,
      comments,
      sourcePage: 'community',
      username: '',
      communityName: req.app.locals.config.hive.communityId,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
