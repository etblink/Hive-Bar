// Function to show comment dialog
function showCommentDialog(author, permlink, isReply) {
    const username = localStorage.getItem('username');

    if (!username) {
        alert(`Please log in to ${isReply ? 'reply' : 'comment'}`);
        return;
    }

    if (typeof window.hive_keychain === 'undefined') {
        alert(`Please install Hive Keychain to ${isReply ? 'reply' : 'comment'}`);
        return;
    }

    const dialog = document.getElementById(`commentDialog-${author}-${permlink}`);
    dialog.showModal();

    // Close dialog when clicking outside
    dialog.addEventListener('click', (e) => {
        const dialogDimensions = dialog.getBoundingClientRect();
        if (
            e.clientX < dialogDimensions.left ||
            e.clientX > dialogDimensions.right ||
            e.clientY < dialogDimensions.top ||
            e.clientY > dialogDimensions.bottom
        ) {
            dialog.close();
        }
    });
}

// Function to submit comment
function submitComment(author, permlink, isReply) {
    const username = localStorage.getItem('username');
    const commentBody = document.getElementById(`commentBody-${author}-${permlink}`).value;

    if (!commentBody.trim()) {
        alert(`Please enter a ${isReply ? 'reply' : 'comment'}`);
        return;
    }

    const parentPermlink = permlink;
    const commentPermlink = `re-${parentPermlink}-${Date.now()}`;
    const commentTitle = '';
    const jsonMetadata = JSON.stringify({app: '4th Street Bar'});

    const operations = [
        ['comment',
            {
                parent_author: author,
                parent_permlink: parentPermlink,
                author: username,
                permlink: commentPermlink,
                title: commentTitle,
                body: commentBody,
                json_metadata: jsonMetadata
            }
        ]
    ];

    window.hive_keychain.requestBroadcast(username, operations, 'posting', function(response) {
        if (response.success) {
            console.log(`${isReply ? 'Reply' : 'Comment'} posted successfully`);
            alert(`${isReply ? 'Reply' : 'Comment'} posted successfully`);
            // Close the dialog
            const dialog = document.getElementById(`commentDialog-${author}-${permlink}`);
            dialog.close();
            // Clear the comment body
            document.getElementById(`commentBody-${author}-${permlink}`).value = '';
            // You might want to update the UI to show the new comment/reply here
        } else {
            console.error(`${isReply ? 'Reply' : 'Comment'} failed:`, response.message);
            alert(`${isReply ? 'Reply' : 'Comment'} failed: ${response.message}`);
        }
    });
}

// Expose necessary functions to the global scope
window.showCommentDialog = showCommentDialog;
window.submitComment = submitComment;
