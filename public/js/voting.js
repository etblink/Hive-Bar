// voting.js

// Function to show upvote dialog
function showUpvoteDialog(button) {
    const author = button.getAttribute('data-author');
    const permlink = button.getAttribute('data-permlink');
    const username = localStorage.getItem('username');

    if (!username) {
        alert('Please log in to upvote');
        return;
    }

    window.waitForHiveKeychain(() => {
        const dialog = document.getElementById(`upvoteDialog-${author}-${permlink}`);

        // Initialize beer mug upvote immediately before showing dialog
        new BeerMugUpvote(`${author}-${permlink}`);
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
    });
}

// Function to submit upvote
function submitUpvote(author, permlink) {
    const username = localStorage.getItem('username');
    const beerMugSvg = document.getElementById(`beerMugSvg-${author}-${permlink}`);
    const beerMugInstance = beerMugSvg.__beerMugUpvote;
    const weight = Math.round(beerMugInstance.beerLevel * 100); // Convert percentage to basis points (100% = 10000)

    window.waitForHiveKeychain(() => {
        window.hive_keychain.requestVote(username, permlink, author, weight, function(response) {
            if (response.success) {
                console.log('Upvote successful');
                // Update the UI to reflect the new vote
                const likeCountElement = document.getElementById(`likeCount-${author}-${permlink}`);
                if (likeCountElement) {
                    const currentLikes = parseInt(likeCountElement.textContent.match(/\d+/)[0], 10);
                    likeCountElement.textContent = `(${currentLikes + 1})`;
                }
                const likeButton = document.getElementById(`likeButton-${author}-${permlink}`);
                likeButton.classList.add('text-bar-gold');
            } else {
                console.error('Upvote failed:', response.message);
                alert('Upvote failed: ' + response.message);
            }
            // Close the dialog
            const dialog = document.getElementById(`upvoteDialog-${author}-${permlink}`);
            dialog.close();
        });
    });
}

// Expose functions to global scope
window.showUpvoteDialog = showUpvoteDialog;
window.submitUpvote = submitUpvote;
