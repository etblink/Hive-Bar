const express = require('express');
const router = express.Router();
const { 
    getAccounts, 
    getDynamicGlobalProperties, 
    getResourceCredits, 
    getVotingPower,
    getAccountHistory 
} = require('../utils/hiveApi');
const { fetchUserProfile, fetchUserPosts } = require('../utils/profiles/fetchProfileData');

// Fetch profile data
router.get('/profile/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const userProfile = await fetchUserProfile(username);
        
        if (!userProfile) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(userProfile);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Error fetching profile data' });
    }
});

// Fetch balance and resource data
router.get('/balance/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const [accounts, globalProps] = await Promise.all([
            getAccounts([username]),
            getDynamicGlobalProperties()
        ]);
        
        if (!accounts || accounts.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
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
        
        res.json({
            hbd_balance: account.hbd_balance,
            balance: account.balance,
            vesting_shares: hivePower.toFixed(3),
            rc_manabar: {
                current_mana: resourceCredits,
                percentage: parseFloat(resourceCredits)
            },
            voting_power: parseFloat(votingPower) * 100
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: 'Error fetching balance data' });
    }
});

// Fetch user posts
router.get('/posts/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const posts = await fetchUserPosts(username);
        
        if (!posts) {
            return res.status(404).json({ error: 'Posts not found' });
        }
        
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Error fetching posts data' });
    }
});

// Fetch transactions (for wall posts and inbox)
router.get('/transactions/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const accountHistory = await getAccountHistory(username, -1, 1000, 'transfer');
        
        const transactions = accountHistory
            .filter(transaction => {
                const op = transaction[1].op;
                return op[1].to === username && op[1].amount.includes('HBD');
            })
            .map(transaction => {
                const op = transaction[1].op[1];
                return {
                    id: transaction[1].trx_id,
                    from: op.from,
                    to: op.to,
                    amount: op.amount,
                    memo: op.memo,
                    timestamp: transaction[1].timestamp,
                    encrypted: op.memo.startsWith('#')
                };
            })
            .reverse();
        
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Error fetching transactions data' });
    }
});

// Create wall post
router.post('/wall-post', async (req, res) => {
    try {
        const { to, memo, amount, encrypted } = req.body;
        
        // In a real implementation, this would interact with Hive Keychain
        // For now, we'll just return success to allow the frontend to update
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating wall post:', error);
        res.status(500).json({ error: 'Error creating wall post' });
    }
});

module.exports = router;
