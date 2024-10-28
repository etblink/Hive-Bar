const express = require('express');
const router = express.Router();
const { fetchUserProfile, fetchUserPosts } = require('../utils/profiles/fetchProfileData');
const { getFollowers, getFollowing, getAccountHistory, getAccounts, getDynamicGlobalProperties, getResourceCredits, getVotingPower, getFollowStatus } = require('../utils/hiveApi');
const { cacheThreads } = require('../utils/cacheOperations');

// Middleware to check authentication
router.use((req, res, next) => {
    // Set res.locals.user based on client-side localStorage in the template
    res.locals.user = null; // Will be populated by client-side JS
    next();
});

// HP Milestone definitions
const HP_MILESTONES = [
    { min: 0, max: 10, name: "Bar Visitor", description: "You've just arrived at the 4th Street Bar. Welcome!", icon: "🍺" },
    { min: 10, max: 50, name: "Local Patron", description: "You're starting to feel at home here. Your presence is noticed!", icon: "🍻" },
    { min: 50, max: 200, name: "Barfly", description: "You're always around. The bar's starting to feel like a second home.", icon: "🍺" },
    { min: 200, max: 500, name: "Bartender's Friend", description: "The bartenders know your name and drink of choice. You have influence.", icon: "🍻" },
    { min: 500, max: 1000, name: "Regular Drinker", description: "You've earned your place at the bar. People listen to your recommendations.", icon: "🛢️" },
    { min: 1000, max: 5000, name: "Top Shelf Drinker", description: "You have VIP status at the bar, and your upvotes carry weight.", icon: "👑" },
    { min: 5000, max: 10000, name: "Bar Manager", description: "You help run the place! Others look to you for guidance.", icon: "🎯" },
    { min: 10000, max: 50000, name: "Master Brewer", description: "You're crafting your own influence. Your voting power is substantial.", icon: "🏺" },
    { min: 50000, max: 100000, name: "Bar Owner", description: "You practically own the place! Your votes have a serious impact.", icon: "🏪" },
    { min: 100000, max: 500000, name: "Distillery Owner", description: "You control large-scale operations, and your influence is vast.", icon: "🏭" },
    { min: 500000, max: 1000000, name: "King of the Bar", description: "You reign supreme. Every move you make shapes the community.", icon: "👑" },
    { min: 1000000, max: Infinity, name: "God of the Bar", description: "You've reached the pinnacle of Hive Power. Your influence is unmatched.", icon: "⚡" }
];

function calculateMilestone(hivePower) {
    const milestone = HP_MILESTONES.find(m => hivePower >= m.min && hivePower < m.max);
    if (!milestone) return HP_MILESTONES[0];
    
    const progress = (hivePower - milestone.min) / (milestone.max - milestone.min);
    const progressPercent = Math.min(Math.max(progress * 100, 0), 100);
    
    return {
        ...milestone,
        progress,
        progressPercent
    };
}

router.get('/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const userProfile = await fetchUserProfile(username);
        const userBlogPosts = await fetchUserPosts(username);
        
        if (!userProfile) {
            return res.status(404).send('User not found');
        }
        
        res.render('pages/profile/index', { userProfile, userBlogPosts });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching the profile');
    }
});

router.get('/:username/blogs', async (req, res) => {
    try {
        const username = req.params.username;
        const [userProfile, userBlogPosts] = await Promise.all([
            fetchUserProfile(username),
            fetchUserPosts(username)
        ]);
        
        if (!userBlogPosts) {
            return res.status(404).send('Blog posts not found');
        }
        
        res.render('pages/profile/partials/user-blog-posts', { userProfile, userBlogPosts });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching blog posts');
    }
});

router.get('/:username/wall-posts', async (req, res) => {
    try {
        const username = req.params.username;
        console.log('Fetching initial wall posts for:', username);
        
        const accountHistory = await getAccountHistory(username, -1, 1000, 'transfer');
        console.log('Account history entries:', accountHistory.length);
        
        const wallPosts = accountHistory
            .filter(transaction => {
                const op = transaction[1].op;
                return op[1].to === username && 
                       op[1].amount.includes('HBD') && 
                       !op[1].memo.startsWith('#'); // Exclude encrypted messages
            })
            .map((transaction, index) => {
                const op = transaction[1].op[1];
                return {
                    id: transaction[1].trx_id,
                    sequence: transaction[0],
                    from: op.from,
                    to: op.to,
                    amount: op.amount,
                    memo: op.memo,
                    timestamp: transaction[1].timestamp
                };
            })
            .reverse();
        
        console.log('Initial wall posts found:', wallPosts.length);
        res.render('pages/profile/partials/user-wall-posts', { wallPosts });
    } catch (error) {
        console.error('Error fetching wall posts:', error);
        res.status(500).send('An error occurred while fetching wall posts');
    }
});

router.get('/:username/wall-posts/more', async (req, res) => {
    try {
        const username = req.params.username;
        const lastId = req.query.lastId;
        
        console.log('Loading more wall posts:', {
            username,
            lastId,
            query: req.query
        });

        if (!lastId) {
            console.log('No last ID provided, ending pagination');
            return res.send('');
        }

        // Get the first batch to find the sequence number of the last post
        const initialHistory = await getAccountHistory(username, -1, 1000, 'transfer');
        const lastPost = initialHistory.find(tx => tx[1].trx_id === lastId);
        
        if (!lastPost) {
            console.log('Last post not found in history');
            return res.send('');
        }

        const lastSequence = lastPost[0];
        console.log('Last sequence number:', lastSequence);

        // Fetch the next batch starting from the last sequence number
        const accountHistory = await getAccountHistory(username, lastSequence - 1, 1000, 'transfer');
        console.log('Account history entries for more posts:', accountHistory.length);
        
        const wallPosts = accountHistory
            .filter(transaction => {
                const op = transaction[1].op;
                return op[1].to === username && 
                       op[1].amount.includes('HBD') && 
                       !op[1].memo.startsWith('#'); // Exclude encrypted messages
            })
            .map(transaction => {
                const op = transaction[1].op[1];
                return {
                    id: transaction[1].trx_id,
                    sequence: transaction[0],
                    from: op.from,
                    to: op.to,
                    amount: op.amount,
                    memo: op.memo,
                    timestamp: transaction[1].timestamp
                };
            })
            .reverse();

        console.log('Additional wall posts found:', {
            count: wallPosts.length,
            firstSequence: wallPosts[0]?.sequence,
            lastSequence: wallPosts[wallPosts.length - 1]?.sequence
        });

        if (wallPosts.length === 0) {
            console.log('No additional posts to render');
            return res.send('');
        }

        res.render('pages/profile/partials/wall-posts-batch', { wallPosts });
    } catch (error) {
        console.error('Error fetching more wall posts:', error);
        res.status(500).send('An error occurred while fetching more wall posts');
    }
});

router.get('/:username/wallet', async (req, res) => {
    try {
        const username = req.params.username;
        const accounts = await getAccounts([username]);
        const globalProps = await getDynamicGlobalProperties();
        
        if (!accounts || accounts.length === 0) {
            return res.status(404).send('Account not found');
        }
        
        const account = accounts[0];
        const resourceCredits = await getResourceCredits(username);
        const votingPower = await getVotingPower(account);
        
        // Calculate Hive Power
        const vestingShares = parseFloat(account.vesting_shares);
        const receivedVestingShares = parseFloat(account.received_vesting_shares);
        const delegatedVestingShares = parseFloat(account.delegated_vesting_shares);
        const totalVestingShares = vestingShares + receivedVestingShares - delegatedVestingShares;
        
        const totalVestingFundHive = parseFloat(globalProps.total_vesting_fund_hive);
        const globalTotalVestingShares = parseFloat(globalProps.total_vesting_shares);
        const vestsToHiveRatio = totalVestingFundHive / globalTotalVestingShares;
        
        const hivePower = totalVestingShares * vestsToHiveRatio;
        const milestone = calculateMilestone(hivePower);
        
        res.render('pages/profile/partials/user-wallet', { 
            account, 
            globalProps,
            resourceCredits,
            votingPower,
            hivePower,
            milestone
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching wallet data');
    }
});

router.get('/:username/inbox', async (req, res) => {
    try {
        const username = req.params.username;
        console.log('Fetching inbox messages for:', username);
        
        const accountHistory = await getAccountHistory(username, -1, 1000, 'transfer');
        console.log('Account history entries:', accountHistory.length);
        
        const inboxMessages = accountHistory
            .filter(transaction => {
                const op = transaction[1].op;
                return op[1].to === username && 
                       op[1].amount.includes('HBD') && 
                       op[1].memo.startsWith('#'); // Only include encrypted messages
            })
            .map(transaction => {
                const op = transaction[1].op[1];
                return {
                    from: op.from,
                    amount: op.amount,
                    memo: op.memo, // Keep the # for now since we'll need it for decryption later
                    timestamp: transaction[1].timestamp
                };
            })
            .reverse(); // Show newest messages first
        
        console.log('Inbox messages found:', inboxMessages.length);
        res.render('pages/profile/partials/user-inbox', { messages: inboxMessages });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching inbox messages');
    }
});

router.get('/api/followers/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const followers = await getFollowers(username);
        console.log('Followers data:', followers);
        res.render('pages/profile/partials/follow-list', { 
            users: followers,
            emptyMessage: 'This user has no followers yet.'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('pages/profile/partials/follow-list', { 
            users: null, 
            error: 'An error occurred while fetching followers'
        });
    }
});

router.get('/api/following/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const following = await getFollowing(username);
        console.log('Following data:', following);
        res.render('pages/profile/partials/follow-list', { 
            users: following,
            emptyMessage: 'This user is not following anyone yet.'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('pages/profile/partials/follow-list', { 
            users: null, 
            error: 'An error occurred while fetching following'
        });
    }
});

// Add this new endpoint at the end of the file, before module.exports
router.get('/api/follow-status/:follower/:following', async (req, res) => {
    try {
        const { follower, following } = req.params;
        const isFollowing = await getFollowStatus(follower, following);
        res.json({ isFollowing });
    } catch (error) {
        console.error('Error checking follow status:', error);
        res.status(500).json({ error: 'An error occurred while checking follow status' });
    }
});

// Add these new routes at the end of the file, before module.exports

// GET route for profile settings
router.get('/:username/settings', async (req, res) => {
    try {
        const username = req.params.username;
        const userProfile = await fetchUserProfile(username);
        
        if (!userProfile) {
            return res.status(404).send('User not found');
        }
        
        res.render('pages/profile/partials/profile-settings', { userProfile });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while fetching profile settings');
    }
});

// POST route for updating profile settings
router.post('/update-settings', async (req, res) => {
    try {
        const { username, displayName, about, profileImage, wallPostFee, keychain } = req.body;

        if (keychain !== 'success') {
            return res.json({ success: false, message: 'Blockchain update failed' });
        }

        // Update the user's profile
        const updatedProfile = {
            username,
            name: displayName,
            about,
            profile_image: profileImage,
            wall_post_fee: wallPostFee,
            lastUpdate: Date.now()
        };

        // Here we would typically update the profile in the database
        // For now, we'll just log the update
        console.log('Profile update:', updatedProfile);

        // Use the server-side caching function
        // Note: cacheThreads is not the ideal function for this, but it's what we have available
        // In a real-world scenario, you'd want a specific function for caching user profiles
        await cacheThreads([updatedProfile]);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'An error occurred while updating the profile' });
    }
});

module.exports = router;
