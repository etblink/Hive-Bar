const hiveClient = require('../hiveClient');

async function fetchCommunityInfo(name) {
    try {
        const community = await hiveClient.call('bridge', 'get_community', { name });
        return community;
    } catch (error) {
        console.error('Error fetching community info:', error);
        return null;
    }
}

async function fetchCommunityPosts(name, limit = 20, sort = "trending") {
    try {
        console.log(`Fetching ${sort} posts for community: ${name}, limit: ${limit}`);
        const posts = await hiveClient.call('bridge', 'get_ranked_posts', { tag: name, limit, sort });
        console.log(`Fetched ${posts.length} posts`);
        return posts;
    } catch (error) {
        console.error('Error fetching community posts:', error);
        throw error;
    }
}

module.exports = {
    fetchCommunityInfo,
    fetchCommunityPosts
};
