// login.js

function setupLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const loginDialog = document.getElementById('loginDialog');
    const userDialog = document.getElementById('userDialog');
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileLink = document.getElementById('profileLink');
    const closeLoginDialog = document.getElementById('closeLoginDialog');

    // Check if user is already logged in
    const loggedInUser = localStorage.getItem('username');
    if (loggedInUser) {
        updateLoginButton(loggedInUser);
        // Update profile link with correct username
        if (profileLink) {
            profileLink.href = `/profile/${loggedInUser}`;
        }
    }

    loginBtn.addEventListener('click', function() {
        if (loggedInUser) {
            userDialog.showModal();
            window.positionDialog(userDialog, loginBtn);
        } else {
            loginDialog.showModal();
            window.positionDialog(loginDialog, loginBtn);
        }
    });

    // Close dialog button handler
    closeLoginDialog.addEventListener('click', () => {
        loginDialog.close();
    });

    // Close dialogs when clicking on backdrop
    loginDialog.addEventListener('click', (e) => {
        const dialogDimensions = loginDialog.getBoundingClientRect();
        if (
            e.clientX < dialogDimensions.left ||
            e.clientX > dialogDimensions.right ||
            e.clientY < dialogDimensions.top ||
            e.clientY > dialogDimensions.bottom
        ) {
            loginDialog.close();
        }
    });

    userDialog.addEventListener('click', (e) => {
        const dialogDimensions = userDialog.getBoundingClientRect();
        if (
            e.clientX < dialogDimensions.left ||
            e.clientX > dialogDimensions.right ||
            e.clientY < dialogDimensions.top ||
            e.clientY > dialogDimensions.bottom
        ) {
            userDialog.close();
        }
    });

    // Reposition dialogs on window resize
    window.addEventListener('resize', () => {
        if (loginDialog.open) {
            window.positionDialog(loginDialog, loginBtn);
        }
        if (userDialog.open) {
            window.positionDialog(userDialog, loginBtn);
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('username');
            window.clearUserProfile();
            userDialog.close();
            window.location.reload();
        });
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.toLowerCase();

        window.waitForHiveKeychain(() => {
            // Generate a random memo for signing
            const memo = 'login-' + Math.random().toString(36).substring(2);

            // Request signature through Hive Keychain
            window.hive_keychain.requestSignBuffer(username, memo, 'Posting', async (response) => {
                if (response.success) {
                    // Successfully signed with Keychain
                    localStorage.setItem('username', username);
                    
                    // Update UI
                    await updateLoginButton(username);
                    
                    // Update profile link
                    if (profileLink) {
                        profileLink.href = `/profile/${username}`;
                    }
                    
                    // Close dialog and reset form
                    loginDialog.close();
                    loginForm.reset();

                    // Redirect to community page
                    window.location.href = '/community';
                } else {
                    alert('Login failed: ' + response.message);
                }
            });
        });
    });
}

// Function to update login button with user avatar
async function updateLoginButton(username) {
    const loginBtn = document.getElementById('loginBtn');
    
    // Fetch user profile image from Hive
    const avatarUrl = `https://images.hive.blog/u/${username}/avatar`;
    
    // Update button content
    loginBtn.innerHTML = `
        <img src="${avatarUrl}" 
             alt="${username}" 
             class="h-8 w-8 rounded-full"
             onerror="this.src='https://images.hive.blog/u/${username}/avatar'">
    `;
    loginBtn.classList.remove('bg-bar-gold', 'text-black', 'px-4', 'py-2');
    loginBtn.classList.add('p-0');
}

// Expose functions to global scope
window.setupLogin = setupLogin;
window.updateLoginButton = updateLoginButton;
