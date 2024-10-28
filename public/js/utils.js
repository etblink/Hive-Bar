// utils.js

// Function to check for Hive Keychain availability
function waitForHiveKeychain(callback, retries = 50, interval = 100) {
    if (typeof window.hive_keychain !== 'undefined') {
        callback();
    } else if (retries > 0) {
        setTimeout(() => waitForHiveKeychain(callback, retries - 1, interval), interval);
    } else {
        console.error('Hive Keychain not detected after multiple retries');
        alert('Hive Keychain not detected. Please make sure it is installed and refresh the page.');
    }
}

// Function to position dialog under button
function positionDialog(dialog, button) {
    const buttonRect = button.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    
    // Position the dialog below the button
    dialog.style.top = `${buttonRect.bottom + 8}px`; // 8px gap
    
    // Align the right edge of the dialog with the right edge of the button
    dialog.style.left = `${buttonRect.right - dialogRect.width}px`;
}

// Helper function to create URL-friendly slugs
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// Function to update profile using Hive Keychain
function updateProfileWithKeychain(username, profileData, callback) {
    const json = JSON.stringify(['account_update', {
        profile: profileData
    }]);

    window.hive_keychain.requestCustomJson(username, '4thstreetbar', 'Posting', json, 'Update Profile', function(response) {
        if (response.success) {
            callback({ success: true });
        } else {
            callback({ success: false, message: response.message });
        }
    });
}

// Expose functions to global scope
window.waitForHiveKeychain = waitForHiveKeychain;
window.positionDialog = positionDialog;
window.slugify = slugify;
window.updateProfileWithKeychain = updateProfileWithKeychain;
