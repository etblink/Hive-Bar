// database.js

let dbInitializationPromise = null;

// Function to initialize the database and cache
function initializeDatabase() {
    if (dbInitializationPromise) {
        return dbInitializationPromise;
    }

    dbInitializationPromise = new Promise((resolve, reject) => {
        if (typeof Dexie === 'undefined') {
            reject(new Error('Dexie is not defined. Make sure it is properly loaded.'));
            return;
        }

        const db = new Dexie('BarFrontendDB');

        // Define database schema
        db.version(2).stores({
            posts: '++id, postId, author, permlink, title, body, created, lastUpdate, category, json_metadata',
            profiles: '++id, username, name, about, location, website, balance, lastLogin, profileImage',
            balances: '++id, username, liquidHBD, liquidHive, HP, resourceCredits, votingPower, lastUpdate',
            transactions: '++id, username, transactionId, amount, memo, date, type, encrypted',
            wallPosts: '++id, toUsername, fromUsername, amount, memo, date, encrypted',
            threads: '++id, author, permlink, body, created, lastUpdate, json_metadata, replies'
        });

        db.open()
            .then(() => {
                console.log('Database opened successfully');
                window.BarCache = {
                    posts: db.posts,
                    profiles: db.profiles,
                    balances: db.balances,
                    transactions: db.transactions,
                    wallPosts: db.wallPosts,
                    threads: db.threads,
                    isInitialized: true
                };
                resolve(window.BarCache);
            })
            .catch((error) => {
                console.error('Error opening database:', error);
                reject(error);
            });
    });

    return dbInitializationPromise;
}

// Function to clear user profile from Dexie
async function clearUserProfile() {
    try {
        const username = localStorage.getItem('username');
        if (username && typeof window.BarCache !== 'undefined' && typeof window.BarCache.profiles !== 'undefined') {
            await window.BarCache.profiles.clearProfile(username);
            console.log('User profile cleared from cache');
        }
    } catch (error) {
        console.error('Error clearing user profile:', error);
    }
}

// Expose functions to global scope
window.initializeDatabase = initializeDatabase;
window.clearUserProfile = clearUserProfile;
