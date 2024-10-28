const express = require('express');
const router = express.Router();
const md = require('../utils/remarkableInstance');
const hiveClient = require('../utils/hiveClient');

function parseMarkdown(content) {
  if (Array.isArray(content)) {
    return content.map(item => ({
      ...item,
      parsedBody: md.render(item.body)
    }));
  }
  return {
    ...content,
    parsedBody: md.render(content.body)
  };
}

async function fetchComments(author, permlink) {
  try {
    const comments = await hiveClient.call('condenser_api', 'get_content_replies', [author, permlink]);
    const commentsWithLikes = await Promise.all(comments.map(async (comment) => {
      const votes = await hiveClient.call('condenser_api', 'get_active_votes', [comment.author, comment.permlink]);
      return {
        ...comment,
        likes: votes.length
      };
    }));
    return parseMarkdown(commentsWithLikes);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

async function fetchSinglePost(author, permlink) {
    try {
        console.log(`Fetching single post: ${author}/${permlink}`);
        const post = await hiveClient.call('bridge', 'get_post', { author, permlink });
        console.log('Fetched single post');
        
        // Fetch likes for the post
        const votes = await hiveClient.call('condenser_api', 'get_active_votes', [author, permlink]);
        post.likes = votes.length;
        
        return post;
    } catch (error) {
        console.error('Error fetching single post:', error);
        throw error;
    }
}

router.get('/post/:author/:permlink', async (req, res) => {
  try {
    const { author, permlink } = req.params;
    const post = await fetchSinglePost(author, permlink);
    
    if (!post) {
      throw new Error('Post not found');
    }
    
    const parsedPost = parseMarkdown(post);
    const comments = await fetchComments(author, permlink);
    let sourcePage = 'community';
    let username = '';
    const communityName = process.env.COMMUNITY_NAME;

    if (req.headers.referer) {
      const refererUrl = new URL(req.headers.referer);
      const pathParts = refererUrl.pathname.split('/');
      if (pathParts[1] === 'profile') {
        sourcePage = 'profile';
        username = pathParts[2] || '';
      }
    }
    
    res.render('partials/full-post', { post: parsedPost, comments, sourcePage, username, communityName }, (err, html) => {
      if (err) {
        console.error('Error rendering full post:', err);
        res.status(500).json({ message: 'Error rendering full post', error: err.toString() });
      } else {
        res.send(html);
      }
    });
  } catch (error) {
    console.error('Error fetching full post:', error);
    res.status(500).json({ message: 'Error fetching full post', error: error.toString() });
  }
});

module.exports = router;
