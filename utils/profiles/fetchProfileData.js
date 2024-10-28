const hiveClient = require('../hiveClient');

async function fetchUserProfile(username) {
    try {
        const [account, followCount] = await Promise.all([
            hiveClient.database.getAccounts([username]),
            hiveClient.call('condenser_api', 'get_follow_count', [username])
        ]);

        if (account && account.length > 0) {
            return {
                ...account[0],
                follower_count: followCount.follower_count,
                following_count: followCount.following_count,
                json_metadata: account[0].json_metadata || '{}',
                posting_json_metadata: account[0].posting_json_metadata || '{}'
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

async function fetchUserPosts(username, limit = 20) {
    try {
        const posts = await hiveClient.database.getDiscussions('blog', { tag: username, limit });
        
        // Fetch like counts for each post and calculate estimated payout
        const postsWithLikesAndPayout = await Promise.all(posts.map(async (post) => {
            try {
                const activeVotes = await hiveClient.database.call('get_active_votes', [post.author, post.permlink]);
                const likes = activeVotes.filter(vote => vote.percent > 0).length;
                
                // Calculate estimated payout
                const totalPayout = parseFloat(post.pending_payout_value) + 
                                    parseFloat(post.total_payout_value) + 
                                    parseFloat(post.curator_payout_value);
                const payoutLimitHit = totalPayout >= parseFloat(post.max_accepted_payout);
                const estimatedPayout = payoutLimitHit ? parseFloat(post.max_accepted_payout) : totalPayout;
                
                return { 
                    ...post, 
                    likes,
                    estimated_payout: estimatedPayout.toFixed(2)
                };
            } catch (error) {
                console.error(`Error processing post ${post.permlink}:`, error);
                return { 
                    ...post, 
                    likes: 0,
                    estimated_payout: parseFloat(post.pending_payout_value).toFixed(2)
                };
            }
        }));

        return postsWithLikesAndPayout;
    } catch (error) {
        console.error('Error fetching user posts:', error);
        return [];
    }
}

module.exports = {
    fetchUserProfile,
    fetchUserPosts
};
