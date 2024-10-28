// Cache operations for 4th Street Bar
(function() {
    /**
     * Waits for BarCache to be initialized.
     * @param {number} timeout - Maximum time to wait in milliseconds.
     * @returns {Promise} - Resolves with BarCache if initialized, rejects on timeout.
     */
    function waitForBarCache(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkBarCache = () => {
                if (window.BarCache && window.BarCache.isInitialized) {
                    resolve(window.BarCache);
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('BarCache initialization timed out'));
                } else {
                    setTimeout(checkBarCache, 100);
                }
            };
            checkBarCache();
        });
    }

    /**
     * Initializes all cache operations after ensuring BarCache is ready.
     */
    async function initializeCacheOperations() {
        try {
            await window.initializeDatabase();
            const BarCache = await waitForBarCache();

            // Cache operations for posts
            if (!BarCache.posts.cachePosts) {
                BarCache.posts.cachePosts = async function(posts) {
                    try {
                        const postsToCache = posts.map(post => ({
                            postId: post.id,
                            author: post.author,
                            permlink: post.permlink,
                            title: post.title,
                            body: post.body,
                            created: post.created,
                            lastUpdate: Date.now(),
                            category: post.category,
                            json_metadata: post.json_metadata
                        }));
                        await BarCache.posts.bulkPut(postsToCache);
                    } catch (error) {
                        console.error('Error caching posts:', error);
                    }
                };
            }

            if (!BarCache.posts.getCachedPosts) {
                BarCache.posts.getCachedPosts = async function() {
                    try {
                        return await BarCache.posts.toArray();
                    } catch (error) {
                        console.error('Error getting cached posts:', error);
                        return [];
                    }
                };
            }

            // Cache operations for profiles
            if (!BarCache.profiles.cacheProfile) {
                BarCache.profiles.cacheProfile = async function(profile) {
                    try {
                        await BarCache.profiles.put({
                            username: profile.username,
                            name: profile.name,
                            about: profile.about,
                            location: profile.location,
                            website: profile.website,
                            balance: profile.balance,
                            lastLogin: Date.now(),
                            profileImage: profile.profile_image,
                            coverImage: profile.cover_image,
                            reputation: profile.reputation,
                            postingJsonMetadata: profile.posting_json_metadata,
                            lastUpdate: Date.now()
                        });
                    } catch (error) {
                        console.error('Error caching profile:', error);
                    }
                };
            }

            // Add getCachedProfile method
            if (!BarCache.profiles.getCachedProfile) {
                BarCache.profiles.getCachedProfile = async function(username) { // Modified to accept username parameter
                    try {
                        if (!username) {
                            const storedUsername = localStorage.getItem('username');
                            if (!storedUsername) {
                                return null;
                            }
                            username = storedUsername;
                        }
                        return await BarCache.profiles.where('username').equals(username).first();
                    } catch (error) {
                        console.error('Error getting cached profile:', error);
                        return null;
                    }
                };
            }

            // Cache operations for community posts
            if (!BarCache.communityPosts) {
                BarCache.communityPosts = {};
            }

            if (!BarCache.communityPosts.cacheCommunityPosts) {
                BarCache.communityPosts.cacheCommunityPosts = async function(communityName, posts) {
                    try {
                        const postsToCache = await Promise.all(posts.map(async post => {
                            const authorProfile = await BarCache.profiles.getCachedProfile(post.author);
                            return {
                                communityName,
                                postId: post.id,
                                author: post.author,
                                authorProfile: authorProfile,
                                permlink: post.permlink,
                                title: post.title,
                                body: post.body,
                                parsedBody: post.parsedBody,
                                created: post.created,
                                lastUpdate: Date.now(),
                                category: post.category,
                                json_metadata: post.json_metadata,
                                likes: post.likes
                            };
                        }));
                        await BarCache.table('communityPosts').bulkPut(postsToCache);
                    } catch (error) {
                        console.error('Error caching community posts:', error);
                    }
                };
            }

            if (!BarCache.communityPosts.getCachedCommunityPosts) {
                BarCache.communityPosts.getCachedCommunityPosts = async function(communityName) {
                    try {
                        const posts = await BarCache.table('communityPosts').where('communityName').equals(communityName).toArray();
                        return posts.map(post => ({
                            ...post,
                            authorProfile: post.authorProfile || null
                        }));
                    } catch (error) {
                        console.error('Error getting cached community posts:', error);
                        return [];
                    }
                };
            }

            // Cache operations for balances
            if (!BarCache.balances.cacheBalance) {
                BarCache.balances.cacheBalance = async function(username, balanceData) {
                    try {
                        await BarCache.balances.put({
                            username,
                            liquidHBD: balanceData.hbd_balance,
                            liquidHive: balanceData.balance,
                            HP: balanceData.vesting_shares,
                            resourceCredits: balanceData.rc_manabar,
                            votingPower: balanceData.voting_power,
                            lastUpdate: Date.now()
                        });
                    } catch (error) {
                        console.error('Error caching balance:', error);
                    }
                };
            }

            // Cache operations for transactions and wall posts
            if (!BarCache.transactions.cacheTransactions) {
                BarCache.transactions.cacheTransactions = async function(username, transactions) {
                    try {
                        const transactionsToCache = transactions.map(tx => ({
                            username,
                            transactionId: tx.trx_id,
                            amount: tx.amount,
                            memo: tx.memo,
                            date: tx.timestamp,
                            type: tx.type,
                            encrypted: tx.memo.startsWith('#')
                        }));
                        await BarCache.transactions.bulkPut(transactionsToCache);
                    } catch (error) {
                        console.error('Error caching transactions:', error);
                    }
                };
            }

            if (!BarCache.transactions.cacheWallPost) {
                BarCache.transactions.cacheWallPost = async function(wallPost) {
                    try {
                        await BarCache.wallPosts.put({
                            toUsername: wallPost.to,
                            fromUsername: wallPost.from,
                            amount: wallPost.amount,
                            memo: wallPost.memo,
                            date: wallPost.date,
                            encrypted: wallPost.encrypted
                        });
                    } catch (error) {
                        console.error('Error caching wall post:', error);
                    }
                };
            }

            // Cache operations for threads
            if (!BarCache.threads.cacheThreads) {
                BarCache.threads.cacheThreads = async function(threads) {
                    try {
                        const threadsToCache = threads.map(thread => ({
                            author: thread.author,
                            permlink: thread.permlink,
                            title: thread.title,
                            body: thread.body,
                            created: thread.created,
                            lastUpdate: Date.now(),
                            json_metadata: thread.json_metadata,
                            replies: thread.replies || []
                        }));
                        await BarCache.threads.bulkPut(threadsToCache);
                    } catch (error) {
                        console.error('Error caching threads:', error);
                    }
                };
            }

            if (!BarCache.threads.getCachedThreads) {
                BarCache.threads.getCachedThreads = async function() {
                    try {
                        return await BarCache.threads.toArray();
                    } catch (error) {
                        console.error('Error getting cached threads:', error);
                        return [];
                    }
                };
            }

            // Cache operations for thread containers
            if (!BarCache.threadContainers) {
                BarCache.threadContainers = {};
            }

            if (!BarCache.threadContainers.cacheThreadContainer) {
                BarCache.threadContainers.cacheThreadContainer = async function(threadContainer) {
                    try {
                        await BarCache.table('threadContainers').put({
                            author: threadContainer.author,
                            permlink: threadContainer.permlink,
                            lastUpdate: Date.now()
                        });
                    } catch (error) {
                        console.error('Error caching thread container:', error);
                    }
                };
            }

            if (!BarCache.threadContainers.getLatestThreadContainer) {
                BarCache.threadContainers.getLatestThreadContainer = async function() {
                    try {
                        return await BarCache.table('threadContainers')
                            .orderBy('lastUpdate')
                            .last();
                    } catch (error) {
                        console.error('Error getting latest thread container:', error);
                        return null;
                    }
                };
            }

            // Cache operations for subscribers
            if (!BarCache.subscribers) {
                BarCache.subscribers = {};
            }

            if (!BarCache.subscribers.cacheSubscribers) {
                BarCache.subscribers.cacheSubscribers = async function(communityName, subscribers, lastSubscriber) {
                    try {
                        await BarCache.table('subscribers').put({
                            communityName,
                            subscribers,
                            lastSubscriber,
                            lastUpdate: Date.now()
                        });
                    } catch (error) {
                        console.error('Error caching subscribers:', error);
                    }
                };
            }

            if (!BarCache.subscribers.getCachedSubscribers) {
                BarCache.subscribers.getCachedSubscribers = async function(communityName) {
                    try {
                        return await BarCache.table('subscribers').where('communityName').equals(communityName).first();
                    } catch (error) {
                        console.error('Error getting cached subscribers:', error);
                        return null;
                    }
                };
            }

            console.log('Cache operations initialized successfully');
        } catch (error) {
            console.error('Failed to initialize cache operations:', error);
        }
    }

    // Initialize cache operations when the script loads
    initializeCacheOperations();
})();
