// main.js

console.log('4th Street Bar - Serving the neighborhood since 1950');

// Ensure the script is only initialized once
if (typeof window.barScriptInitialized === 'undefined') {
    window.barScriptInitialized = true;

    // Function to load a script and return a promise
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    // Function to initialize the application
    async function initializeApp() {
        try {
            // Load essential scripts first
            await loadScript('/js/utils.js');
            await loadScript('/js/database.js');
            await loadScript('/js/db.js');

            // Initialize database
            await window.initializeDatabase();

            // Load remaining scripts
            const remainingScripts = [
                '/js/login.js',
                '/js/voting.js',
                '/js/community.js',
                '/js/cache-operations.js',
                '/js/comment.js'
            ];

            await Promise.all(remainingScripts.map(loadScript));

            // Initialize features
            window.setupLogin();
            window.initializeCommunityFeatures();

            // Add error container to the DOM
            const errorContainer = document.createElement('div');
            errorContainer.id = 'error-container';
            errorContainer.style.display = 'none';
            errorContainer.style.position = 'fixed';
            errorContainer.style.top = '10px';
            errorContainer.style.left = '50%';
            errorContainer.style.transform = 'translateX(-50%)';
            errorContainer.style.backgroundColor = 'red';
            errorContainer.style.color = 'white';
            errorContainer.style.padding = '10px';
            errorContainer.style.borderRadius = '5px';
            errorContainer.style.zIndex = '1000';
            document.body.appendChild(errorContainer);

        } catch (error) {
            console.error('Failed to initialize application:', error);
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) {
                errorContainer.textContent = 'Failed to initialize application. Please try refreshing the page.';
                errorContainer.style.display = 'block';
            }
        }
    }

    // Start initializing the application
    initializeApp();
}
