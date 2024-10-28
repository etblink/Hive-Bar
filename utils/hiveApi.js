const hiveClient = require('./hiveClient');

async function getFollowers(account, start = '', limit = 1000) {
    try {
        const followers = await hiveClient.call('condenser_api', 'get_followers', [account, start, 'blog', limit]);
        return followers.map(follower => ({
            name: follower.follower,
            avatar: `https://images.hive.blog/u/${follower.follower}/avatar/small`
        }));
    } catch (error) {
        console.error('Error fetching followers:', error);
        return []; // Return an empty array instead of throwing an error
    }
}

async function getFollowing(account, start = '', limit = 1000) {
    try {
        const following = await hiveClient.call('condenser_api', 'get_following', [account, start, 'blog', limit]);
        return following.map(follow => ({
            name: follow.following,
            avatar: `https://images.hive.blog/u/${follow.following}/avatar/small`
        }));
    } catch (error) {
        console.error('Error fetching following:', error);
        return []; // Return an empty array instead of throwing an error
    }
}

async function getAccountHistory(account, start = -1, limit = 1000, filter = null) {
    try {
        const history = await hiveClient.call('condenser_api', 'get_account_history', [account, start, limit]);
        
        // If a filter is provided, only return operations of that type
        if (filter) {
            return history.filter(transaction => transaction[1].op[0] === filter);
        }
        
        return history;
    } catch (error) {
        console.error('Error fetching account history:', error);
        throw error;
    }
}

async function getAccounts(accounts) {
    try {
        const accountData = await hiveClient.call('condenser_api', 'get_accounts', [accounts]);
        return accountData;
    } catch (error) {
        console.error('Error fetching account data:', error);
        throw error;
    }
}

async function getDynamicGlobalProperties() {
    try {
        const props = await hiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
        return props;
    } catch (error) {
        console.error('Error fetching dynamic global properties:', error);
        throw error;
    }
}

async function getResourceCredits(username) {
    try {
        const rc = await hiveClient.call('rc_api', 'find_rc_accounts', { accounts: [username] });
        if (rc && rc.rc_accounts && rc.rc_accounts.length > 0) {
            const rcAccount = rc.rc_accounts[0];
            const maxRc = parseFloat(rcAccount.max_rc);
            const currentRc = parseFloat(rcAccount.rc_manabar.current_mana);
            const percentage = (currentRc / maxRc * 100).toFixed(2);
            return percentage;
        }
        return '0.00';
    } catch (error) {
        console.error('Error fetching resource credits:', error);
        return '0.00';
    }
}

async function getVotingPower(account) {
    try {
        const vpNow = parseFloat(account.voting_power);
        const lastVoteTime = new Date(account.last_vote_time + 'Z').getTime();
        const secondsElapsed = (new Date().getTime() - lastVoteTime) / 1000;
        const regeneratedVP = secondsElapsed * 10000 / 432000; // 432000 = 5 days in seconds
        const currentVP = Math.min(vpNow + regeneratedVP, 10000) / 100;
        return currentVP.toFixed(2);
    } catch (error) {
        console.error('Error calculating voting power:', error);
        return '0.00';
    }
}

async function getFollowStatus(follower, following) {
    try {
        const result = await hiveClient.call('condenser_api', 'get_following', [follower, following, 'blog', 1]);
        return result.length > 0 && result[0].following === following;
    } catch (error) {
        console.error('Error checking follow status:', error);
        throw error;
    }
}

async function checkCommunityMembership(username, community) {
    try {
        const result = await hiveClient.call('bridge', 'get_community', { name: community, observer: username });
        return result.context.subscribed;
    } catch (error) {
        console.error('Error checking community membership:', error);
        throw error;
    }
}

module.exports = {
    getFollowers,
    getFollowing,
    getAccountHistory,
    getAccounts,
    getDynamicGlobalProperties,
    getResourceCredits,
    getVotingPower,
    getFollowStatus,
    checkCommunityMembership
};
