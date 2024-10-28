// Simple in-memory cache for server-side caching
let threadCache = {
    data: null,
    lastUpdate: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

async function cacheThreads(threads) {
    try {
        threadCache.data = threads;
        threadCache.lastUpdate = Date.now();
    } catch (error) {
        console.error('Error caching threads:', error);
    }
}

async function getCachedThreads() {
    try {
        if (threadCache.data && Date.now() - threadCache.lastUpdate < CACHE_DURATION) {
            return threadCache.data;
        }
        return null;
    } catch (error) {
        console.error('Error getting cached threads:', error);
        return null;
    }
}

// Client-side caching functions (these will be no-ops on the server)
async function cacheCommunityPosts(communityName, posts) {
    if (typeof window !== 'undefined' && window.BarCache && window.BarCache.communityPosts) {
        try {
            await window.BarCache.communityPosts.cacheCommunityPosts(communityName, posts);
        } catch (error) {
            console.error('Error caching community posts:', error);
        }
    }
}

async function getCachedCommunityPosts(communityName) {
    if (typeof window !== 'undefined' && window.BarCache && window.BarCache.communityPosts) {
        try {
            return await window.BarCache.communityPosts.getCachedCommunityPosts(communityName);
        } catch (error) {
            console.error('Error getting cached community posts:', error);
            return null;
        }
    }
    return null;
}

module.exports = {
    cacheThreads,
    getCachedThreads,
    cacheCommunityPosts,
    getCachedCommunityPosts
};
