require('dotenv').config();
const express = require('express');
const router = express.Router();
const { fetchCommunityInfo, fetchCommunityPosts } = require('../utils/communities/fetchCommunityData');
const { fetchUserProfile } = require('../utils/profiles/fetchProfileData');
const md = require('../utils/remarkableInstance');
const hiveClient = require('../utils/hiveClient');
const { cacheThreads, getCachedThreads, getCachedCommunityPosts, cacheCommunityPosts } = require('../utils/cacheOperations');
const { checkCommunityMembership } = require('../utils/hiveApi');

// Markdown cache with LRU structure
const markdownCache = new Map();
const voteCache = new Map();
const MAX_CACHE_SIZE = 1000;
const VOTE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function parseMarkdown(posts) {
  // First pass: Process markdown and return immediately
  const processedPosts = posts.map(post => {
    const cacheKey = `${post.author}_${post.permlink}`;
    let parsedBody;

    // Check markdown cache
    if (markdownCache.has(cacheKey)) {
      parsedBody = markdownCache.get(cacheKey);
    } else {
      parsedBody = md.render(post.body);
      
      // Implement LRU caching
      if (markdownCache.size >= MAX_CACHE_SIZE) {
        const firstKey = markdownCache.keys().next().value;
        markdownCache.delete(firstKey);
      }
      markdownCache.set(cacheKey, parsedBody);
    }

    // Check vote cache first
    const cachedVotes = voteCache.get(cacheKey);
    const now = Date.now();
    if (cachedVotes && (now - cachedVotes.timestamp) < VOTE_CACHE_DURATION) {
      return {
        ...post,
        parsedBody,
        likes: cachedVotes.count
      };
    }

    return {
      ...post,
      parsedBody,
      likes: 0, // Initialize with 0, will be updated by fetchVoteCounts
      needsVoteCount: true
    };
  });

  // Second pass: Fetch vote counts in background for posts that need them
  const postsNeedingVotes = processedPosts.filter(post => post.needsVoteCount);
  if (postsNeedingVotes.length > 0) {
    fetchVoteCounts(postsNeedingVotes).catch(console.error);
  }

  return processedPosts;
}

async function fetchVoteCounts(posts) {
  const batchSize = 5; // Reduced batch size to avoid rate limits
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    
    const votePromises = batch.map(async post => {
      try {
        const votes = await hiveClient.call('condenser_api', 'get_active_votes', [post.author, post.permlink]);
        const cacheKey = `${post.author}_${post.permlink}`;
        const voteCount = votes.length;
        
        // Update vote cache
        voteCache.set(cacheKey, {
          count: voteCount,
          timestamp: Date.now()
        });

        // Emit server-side event or use WebSocket to update client
        // This part would need WebSocket implementation
        return { author: post.author, permlink: post.permlink, likes: voteCount };
      } catch (error) {
        console.error(`Error fetching votes for ${post.author}/${post.permlink}:`, error);
        return null;
      }
    });

    await Promise.all(votePromises);
    
    // Add delay between batches to avoid rate limits
    if (i + batchSize < posts.length) {
      await delay(1000);
    }
  }
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

    if (0) {
      parsedThreads = cachedThreads;
    } else {
      const latestThreadContainer = await fetchLatestThreadContainer();

      const startTime = performance.now();
      const threads = await fetchThreads(latestThreadContainer.author, latestThreadContainer.permlink);
      const endTime = performance.now();
      console.log(`Time taken to fetch threads: ${endTime - startTime} ms`);

      const startTime2 = performance.now();
      parsedThreads = await parseMarkdown(threads);
      const endTime2 = performance.now();
      console.log(`Time taken to parse threads: ${endTime2 - startTime2} ms`);
      
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
