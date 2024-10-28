require('dotenv').config();
const express = require('express');
const router = express.Router();
const { fetchCommunityInfo, fetchCommunityPosts } = require('../utils/communities/fetchCommunityData');
const { fetchUserProfile } = require('../utils/profiles/fetchProfileData');
const md = require('../utils/remarkableInstance');
const hiveClient = require('../utils/hiveClient');
const { cacheThreads, getCachedThreads, getCachedCommunityPosts, cacheCommunityPosts } = require('../utils/cacheOperations');
const { checkCommunityMembership } = require('../utils/hiveApi');

async function parseMarkdown(posts) {
  const parsedPosts = await Promise.all(posts.map(async post => {
    const votes = await hiveClient.call('condenser_api', 'get_active_votes', [post.author, post.permlink]);
    return {
      ...post,
      parsedBody: md.render(post.body),
      likes: votes.length
    };
  }));
  return parsedPosts;
}

async function fetchLatestThreadContainer() {
  const threadsContainerAccount = process.env.THREADS_CONTAINER_ACCOUNT;
  if (!threadsContainerAccount) {
    throw new Error('THREADS_CONTAINER_ACCOUNT environment variable is not set');
  }
  const posts = await hiveClient.call('condenser_api', 'get_discussions_by_blog', [{ tag: threadsContainerAccount, limit: 1 }]);
  return posts[0];
}

async function fetchThreads(author, permlink) {
  const replies = await hiveClient.call('condenser_api', 'get_content_replies', [author, permlink]);
  return replies;
}

async function fetchCommunitySubscribers(communityName, lastSubscriber = '') {
  try {
    const params = { community: communityName, limit: 100 };
    if (lastSubscriber) {
      params.last = lastSubscriber;
    }
    const subscribers = await hiveClient.call('bridge', 'list_subscribers', params);
    return subscribers.map(subscriber => ({
      name: subscriber[0],
      role: subscriber[1],
      date: subscriber[3]
    }));
  } catch (error) {
    console.error('Error fetching community subscribers:', error);
    return [];
  }
}

router.get('/', async (req, res) => {
  try {
    const communityName = process.env.COMMUNITY_NAME;
    if (!communityName) {
      throw new Error('COMMUNITY_NAME environment variable is not set');
    }
    const communityInfo = await fetchCommunityInfo(communityName);
    
    res.render('pages/community/index', { 
      communityInfo, 
      communityName,
      threadsContainerAccount: process.env.THREADS_CONTAINER_ACCOUNT
    });
  } catch (error) {
    console.error('Error fetching community data:', error);
    res.status(500).render('error', { message: 'Error fetching community data' });
  }
});

router.get('/threads', async (req, res) => {
  try {
    let cachedThreads = await getCachedThreads();
    let parsedThreads;

    if (cachedThreads) {
      parsedThreads = cachedThreads;
    } else {
      const latestThreadContainer = await fetchLatestThreadContainer();
      const threads = await fetchThreads(latestThreadContainer.author, latestThreadContainer.permlink);
      parsedThreads = await parseMarkdown(threads);
      
      await cacheThreads(parsedThreads);
    }

    res.render('pages/community/partials/community-thread-list', { threads: parsedThreads });
  } catch (error) {
    console.error('Error fetching community threads:', error);
    res.status(500).render('error', { message: 'Error fetching community threads' });
  }
});

router.get('/:communityName/community-posts', async (req, res) => {
  try {
    const { communityName } = req.params;
    const { sort = 'trending' } = req.query;
    if (!communityName) {
      throw new Error('Community name is not provided');
    }

    let cachedPosts = await getCachedCommunityPosts(communityName);
    let parsedPosts;

    if (cachedPosts && cachedPosts.length > 0) {
      parsedPosts = cachedPosts;
    } else {
      const communityPosts = await fetchCommunityPosts(communityName, 20, sort);
      parsedPosts = await parseMarkdown(communityPosts);
      
      await cacheCommunityPosts(communityName, parsedPosts);
    }

    const userProfiles = {};
    for (const post of parsedPosts) {
      if (!userProfiles[post.author]) {
        userProfiles[post.author] = await fetchUserProfile(post.author);
      }
    }

    res.render('pages/community/partials/community-post-list', { 
      posts: parsedPosts,
      userProfile: userProfiles,
      communityName
    });
  } catch (error) {
    console.error('Error fetching community posts:', error);
    res.status(500).json({ message: 'Error fetching community posts', error: error.toString() });
  }
});

router.get('/api/community/:communityName/subscribers', async (req, res) => {
  try {
    const { communityName } = req.params;
    const { lastSubscriber } = req.query;
    if (!communityName) {
      throw new Error('Community name is not provided');
    }

    let subscribers;
    let cachedData;

    if (typeof window !== 'undefined' && window.BarCache && window.BarCache.subscribers) {
      cachedData = await window.BarCache.subscribers.getCachedSubscribers(communityName);
    }

    if (cachedData && Date.now() - cachedData.lastUpdate < 5 * 60 * 1000) {
      subscribers = cachedData.subscribers;
    } else {
      subscribers = await fetchCommunitySubscribers(communityName, lastSubscriber || '');
      
      if (typeof window !== 'undefined' && window.BarCache && window.BarCache.subscribers) {
        await window.BarCache.subscribers.cacheSubscribers(communityName, subscribers, subscribers[subscribers.length - 1].name);
      }
    }

    res.json(subscribers);
  } catch (error) {
    console.error('Error fetching community subscribers:', error);
    res.status(500).json({ message: 'Error fetching community subscribers', error: error.toString() });
  }
});

router.get('/check-membership', async (req, res) => {
  try {
    const { username, community } = req.query;
    if (!username || !community) {
      return res.status(400).json({ error: 'Username and community are required' });
    }

    const isMember = await checkCommunityMembership(username, community);
    res.json({ isMember });
  } catch (error) {
    console.error('Error checking community membership:', error);
    res.status(500).json({ error: 'Failed to check community membership' });
  }
});

router.get('/api/latest-thread-container', async (req, res) => {
  try {
    const latestThreadContainer = await fetchLatestThreadContainer();
    res.json(latestThreadContainer);
  } catch (error) {
    console.error('Error fetching latest thread container:', error);
    res.status(500).json({ error: 'Failed to fetch latest thread container' });
  }
});

module.exports = router;
