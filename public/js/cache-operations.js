// Cache operations for 4th Street Bar frontend
(function() {
    console.log('Additional cache operations initialized');

    /**
     * Waits for BarCache to be initialized.
     * @param {number} timeout - Maximum time to wait in milliseconds.
     * @returns {Promise} - Resolves when BarCache is initialized, rejects on timeout.
     */
    function waitForBarCache(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkBarCache = () => {
                if (window.BarCache && window.BarCache.isInitialized) {
                    resolve();
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
     * Initializes page data and checks cached content.
     */
    async function initializePageData() {
        try {
            await window.initializeDatabase();
            await waitForBarCache();

            const currentPath = window.location.pathname;
            const username = currentPath.split('/profile/')[1];

            if (username) {
                await loadProfileData(username);
            }
        } catch (error) {
            console.error('Error initializing page data:', error);
            updateErrorUI('Failed to initialize page data. Please refresh the page.');
        }
    }

    // Make initializePageData globally available
    window.initializePageData = initializePageData;

    /**
     * Loads profile data for a given username.
     * @param {string} username - The username whose profile data to load.
     */
    async function loadProfileData(username) {
        try {
            // Try to get cached profile data first
            const cachedProfile = await safeExecute(() => window.BarCache.profiles.where('username').equals(username).first(), 'Error getting cached profile');
            const cachedBalance = await safeExecute(() => window.BarCache.balances.where('username').equals(username).first(), 'Error getting cached balance');
            const cachedPosts = await safeExecute(() => window.BarCache.posts.where('author').equals(username).toArray(), 'Error getting cached posts');
            const cachedWallPosts = await safeExecute(() => window.BarCache.wallPosts.where('toUsername').equals(username).toArray(), 'Error getting cached wall posts');

            // Display cached data immediately if available
            if (cachedProfile) updateProfileUI(cachedProfile);
            if (cachedBalance) updateBalanceUI(cachedBalance);
            if (cachedPosts && cachedPosts.length > 0) updatePostsUI(cachedPosts);
            if (cachedWallPosts && cachedWallPosts.length > 0) updateWallPostsUI(cachedWallPosts);

            // Fetch fresh data from the server
            await fetchAndUpdateData(username);
        } catch (error) {
            console.error('Error loading profile data:', error);
            updateErrorUI('Failed to load profile data. Please try refreshing the page.');
        }
    }

    /**
     * Fetches fresh data from the server and updates the cache and UI.
     * @param {string} username - The username whose data to fetch.
     */
    async function fetchAndUpdateData(username) {
        try {
            // Fetch fresh data from the server
            const [profile, balance, posts, transactions] = await Promise.all([
                fetch(`/api/profile/${username}`).then(r => r.json()),
                fetch(`/api/balance/${username}`).then(r => r.json()),
                fetch(`/api/posts/${username}`).then(r => r.json()),
                fetch(`/api/transactions/${username}`).then(r => r.json())
            ]);

            // Update cache with fresh data
            await Promise.all([
                safeExecute(() => window.BarCache.profiles.put(profile), 'Error caching profile'),
                safeExecute(() => window.BarCache.balances.put({username, ...balance}), 'Error caching balance'),
                safeExecute(() => window.BarCache.posts.bulkPut(posts), 'Error caching posts'),
                safeExecute(() => window.BarCache.transactions.bulkPut(transactions.map(tx => ({username, ...tx}))), 'Error caching transactions')
            ]);

            // Update UI with fresh data
            updateProfileUI(profile);
            updateBalanceUI(balance);
            updatePostsUI(posts);
            updateWallPostsUI(transactions);
        } catch (error) {
            console.error('Error fetching fresh data:', error);
            updateErrorUI('Failed to fetch latest data. Some information may be outdated.');
        }
    }

    /**
     * Safely executes a function and handles errors.
     * @param {Function} fn - The function to execute.
     * @param {string} errorMessage - The error message to log if execution fails.
     * @returns {Promise<*>} - The result of the function or null if an error occurred.
     */
    async function safeExecute(fn, errorMessage) {
        try {
            return await fn();
        } catch (error) {
            console.error(errorMessage, error);
            return null;
        }
    }

    /**
     * UI update functions
     */
    function updateProfileUI(profile) {
        const profileCard = document.querySelector('.profile-info-card');
        if (!profileCard) return;

        // Update profile info card elements
        const elements = {
            name: profileCard.querySelector('.profile-name'),
            about: profileCard.querySelector('.profile-about'),
            location: profileCard.querySelector('.profile-location'),
            website: profileCard.querySelector('.profile-website'),
            image: profileCard.querySelector('.profile-image')
        };

        if (elements.name) elements.name.textContent = profile.name || 'N/A';
        if (elements.about) elements.about.textContent = profile.about || 'No description available';
        if (elements.location) elements.location.textContent = profile.location || 'Location not specified';
        if (elements.website) {
            if (profile.website) {
                elements.website.href = profile.website;
                elements.website.textContent = profile.website;
            } else {
                elements.website.href = '#';
                elements.website.textContent = 'No website provided';
            }
        }
        if (elements.image) elements.image.src = profile.profileImage || 'default-avatar.png';
    }

    function updateBalanceUI(balance) {
        const walletSection = document.querySelector('.user-wallet');
        if (!walletSection) return;

        // Update wallet elements
        const elements = {
            hbd: walletSection.querySelector('.hbd-balance'),
            hive: walletSection.querySelector('.hive-balance'),
            hp: walletSection.querySelector('.hp-balance'),
            rc: walletSection.querySelector('.rc-bar'),
            vp: walletSection.querySelector('.voting-power')
        };

        if (elements.hbd) elements.hbd.textContent = balance.liquidHBD || '0 HBD';
        if (elements.hive) elements.hive.textContent = balance.liquidHive || '0 HIVE';
        if (elements.hp) elements.hp.textContent = balance.HP || '0 HP';
        if (elements.rc) elements.rc.style.width = `${(balance.resourceCredits && balance.resourceCredits.percentage) || 0}%`;
        if (elements.vp) elements.vp.textContent = `${(balance.votingPower / 100) || 0}%`;
    }

    function updatePostsUI(posts) {
        const postsContainer = document.querySelector('.user-blog-posts');
        if (!postsContainer) return;

        if (!posts || posts.length === 0) {
            postsContainer.innerHTML = '<p>No posts available.</p>';
            return;
        }

        const postsList = posts.map(post => `
            <div class="post-card">
                <h3>${post.title || 'Untitled'}</h3>
                <p>${(post.body && post.body.substring(0, 200)) || 'No content'}...</p>
                <div class="post-meta">
                    <span>${new Date(post.created).toLocaleDateString()}</span>
                    <span>${post.category || 'Uncategorized'}</span>
                </div>
            </div>
        `).join('');

        postsContainer.innerHTML = postsList;
    }

    function updateWallPostsUI(posts) {
        const wallPostsContainer = document.querySelector('.user-wall-posts');
        if (!wallPostsContainer) return;

        if (!posts || posts.length === 0) {
            wallPostsContainer.innerHTML = '<p>No wall posts available.</p>';
            return;
        }

        const wallPostsList = posts.map(post => `
            <div class="wall-post">
                <p class="memo">${post.encrypted ? '(Encrypted Message)' : (post.memo || 'No message')}</p>
                <div class="post-meta">
                    <span>From: ${post.fromUsername || 'Unknown'}</span>
                    <span>Amount: ${post.amount || '0'}</span>
                    <span>${new Date(post.date).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');

        wallPostsContainer.innerHTML = wallPostsList;
    }

    function updateErrorUI(message) {
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
        } else {
            console.error('Error container not found. Message:', message);
        }
    }

    /**
     * Caches community posts.
     * @param {string} communityName - The name of the community.
     * @param {Array} posts - The posts to cache.
     */
    async function cacheCommunityPosts(communityName, posts) {
        if (typeof window.BarCache === 'undefined' || typeof window.BarCache.communityPosts === 'undefined') {
            console.error('BarCache or BarCache.communityPosts is not initialized.');
            return;
        }

        // Ensure all author profiles are cached before caching community posts
        for (const post of posts) {
            const cachedProfile = await window.BarCache.profiles.getCachedProfile(post.author);
            if (!cachedProfile) {
                // If profile is not cached, fetch and cache it
                const profile = await fetchUserProfile(post.author);
                if (profile) {
                    await window.BarCache.profiles.cacheProfile(profile);
                }
            }
        }

        await window.BarCache.communityPosts.cacheCommunityPosts(communityName, posts);
    }

    /**
     * Retrieves cached community posts.
     * @param {string} communityName - The name of the community.
     * @returns {Array|null} - The cached posts or null if an error occurred.
     */
    async function getCachedCommunityPosts(communityName) {
        if (typeof window.BarCache === 'undefined' || typeof window.BarCache.communityPosts === 'undefined') {
            console.error('BarCache or BarCache.communityPosts is not initialized.');
            return null;
        }

        const posts = await window.BarCache.communityPosts.getCachedCommunityPosts(communityName);
        
        // Ensure all author profiles are up to date
        for (const post of posts) {
            if (!post.authorProfile || (Date.now() - post.authorProfile.lastUpdate > 3600000)) { // 1 hour
                const profile = await fetchUserProfile(post.author);
                if (profile) {
                    await window.BarCache.profiles.cacheProfile(profile);
                    post.authorProfile = profile;
                }
            }
        }

        return posts;
    }

    /**
     * Fetches user profile data from the server.
     * @param {string} username - The username to fetch.
     * @returns {Object|null} - The user profile or null if an error occurred.
     */
    async function fetchUserProfile(username) {
        try {
            const response = await fetch(`/api/profile/${username}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch profile for ${username}`);
            }
            const profile = await response.json();
            return profile;
        } catch (error) {
            console.error(`Error fetching user profile for ${username}:`, error);
            return null;
        }
    }

    /**
     * Caches a thread container.
     * @param {Object} threadContainer - The thread container to cache.
     */
    async function cacheThreadContainer(threadContainer) {
        if (typeof window.BarCache === 'undefined' || typeof window.BarCache.threadContainers === 'undefined') {
            console.error('BarCache or BarCache.threadContainers is not initialized.');
            return;
        }

        await window.BarCache.threadContainers.cacheThreadContainer(threadContainer);
    }

    /**
     * Retrieves the latest thread container.
     * @returns {Object|null} - The latest thread container or null if an error occurred.
     */
    async function getLatestThreadContainer() {
        if (typeof window.BarCache === 'undefined' || typeof window.BarCache.threadContainers === 'undefined') {
            console.error('BarCache or BarCache.threadContainers is not initialized.');
            return null;
        }

        return await window.BarCache.threadContainers.getLatestThreadContainer();
    }

    /**
     * Fetches the latest thread container from the server and caches it.
     * @returns {Object} - The latest thread container.
     */
    async function fetchLatestThreadContainer() {
        if (!window.THREADS_CONTAINER_ACCOUNT) {
            throw new Error('THREADS_CONTAINER_ACCOUNT is not defined');
        }

        try {
            const response = await fetch(`/api/latest-thread-container?account=${window.THREADS_CONTAINER_ACCOUNT}`);
            if (!response.ok) {
                throw new Error('Failed to fetch latest thread container');
            }
            const data = await response.json();
            await cacheThreadContainer(data);
            return data;
        } catch (error) {
            console.error('Error fetching latest thread container:', error);
            throw error;
        }
    }

    // Make the new functions globally available
    window.cacheCommunityPosts = cacheCommunityPosts;
    window.getCachedCommunityPosts = getCachedCommunityPosts;
    window.cacheThreadContainer = cacheThreadContainer;
    window.getLatestThreadContainer = getLatestThreadContainer;
    window.fetchLatestThreadContainer = fetchLatestThreadContainer;

    /**
     * Initialize cache operations when the DOM is fully loaded.
     */
    document.addEventListener('DOMContentLoaded', initializePageData);
})();
