// community.js

function initializeCommunityFeatures() {
    const createNewButton = document.getElementById('createNewButton');
    const threadsTab = document.querySelector('button[hx-get="/community/threads"]');
    const communityPostsTab = document.querySelector('button[hx-get^="/community/"][hx-get$="/community-posts"]');
    const newPostModal = document.getElementById('newPostModal');
    const newThreadModal = document.getElementById('newThreadModal');

    if (createNewButton && threadsTab && communityPostsTab) {
        function updateButtonAction() {
            if (threadsTab.classList.contains('bg-bar-gold')) {
                createNewButton.dataset.action = 'create-thread';
            } else if (communityPostsTab.classList.contains('bg-bar-gold')) {
                createNewButton.dataset.action = 'create-post';
            }
        }

        threadsTab.addEventListener('click', updateButtonAction);
        communityPostsTab.addEventListener('click', updateButtonAction);

        createNewButton.addEventListener('click', function() {
            const action = this.dataset.action;
            if (action === 'create-thread') {
                newThreadModal.showModal();
            } else if (action === 'create-post') {
                newPostModal.showModal();
            }
        });

        // Initial update of button action
        updateButtonAction();

        // Handle form submissions
        async function handleSubmit(e, isThread) {
            e.preventDefault();
            const form = e.target;
            const body = form.body.value;
            const submitButton = form.querySelector('button[type="submit"]');
            const username = localStorage.getItem('username');
            const communityName = document.querySelector('h1').textContent.trim();

            if (!username) {
                alert('Please log in to create a ' + (isThread ? 'thread' : 'post'));
                return;
            }

            if (!isThread && form.title.value.length > 255) {
                alert('Title must be 255 characters or less');
                return;
            }

            if (body.length > 65535) {
                alert('Content must be 65535 characters or less');
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'Creating...';

            const permlink = isThread ? `thread-${Date.now()}` : `${window.slugify(form.title.value)}-${Date.now()}`;
            const jsonMetadata = JSON.stringify({
                app: '4thstreetbar/1.0',
                community: communityName,
                tags: ['4thstreetbar', communityName, ...(isThread ? ['thread'] : [])]
            });

            let parentAuthor = '';
            let parentPermlink = communityName;

            if (isThread) {
                try {
                    const threadContainer = await fetchLatestThreadContainer();
                    parentAuthor = threadContainer.author;
                    parentPermlink = threadContainer.permlink;
                } catch (error) {
                    console.error('Error fetching thread container:', error);
                    alert('Failed to create thread. Please try again.');
                    submitButton.disabled = false;
                    submitButton.textContent = 'Create Thread';
                    return;
                }
            }

            const operations = [
                ['comment',
                    {
                        parent_author: parentAuthor,
                        parent_permlink: parentPermlink,
                        author: username,
                        permlink: permlink,
                        title: isThread ? '' : form.title.value,
                        body: body,
                        json_metadata: jsonMetadata
                    }
                ]
            ];

            window.waitForHiveKeychain(() => {
                window.hive_keychain.requestBroadcast(username, operations, 'posting', (response) => {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Create ' + (isThread ? 'Thread' : 'Post');

                    if (response.success) {
                        alert((isThread ? 'Thread' : 'Post') + ' created successfully!');
                        form.reset();
                        (isThread ? newThreadModal : newPostModal).close();
                        // Refresh the content
                        (isThread ? threadsTab : communityPostsTab).click();
                    } else {
                        alert('Failed to create ' + (isThread ? 'thread' : 'post') + ': ' + response.message);
                    }
                });
            });
        }

        document.getElementById('newPostForm').addEventListener('submit', (e) => handleSubmit(e, false));
        document.getElementById('newThreadForm').addEventListener('submit', (e) => handleSubmit(e, true));

        // Add input listeners for character limits and count display
        ['newPostForm', 'newThreadForm'].forEach(formId => {
            const form = document.getElementById(formId);
            const bodyInput = form.querySelector('textarea[name="body"]');
            const bodyCount = form.querySelector(`#${formId === 'newPostForm' ? 'postBodyCount' : 'threadBodyCount'}`);

            if (formId === 'newPostForm') {
                const titleInput = form.querySelector('input[name="title"]');
                const titleCount = form.querySelector('#postTitleCount');
                titleInput.addEventListener('input', function() {
                    if (this.value.length > 255) {
                        this.value = this.value.slice(0, 255);
                    }
                    titleCount.textContent = this.value.length;
                });
            }

            bodyInput.addEventListener('input', function() {
                if (this.value.length > 65535) {
                    this.value = this.value.slice(0, 65535);
                }
                bodyCount.textContent = this.value.length;
            });
        });
    }
}

// Function to fetch the latest thread container post
async function fetchLatestThreadContainer() {
    try {
        const response = await fetch('/community/api/latest-thread-container');
        if (!response.ok) {
            throw new Error('Failed to fetch latest thread container');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching latest thread container:', error);
        throw error;
    }
}

// Expose function to global scope
window.initializeCommunityFeatures = initializeCommunityFeatures;
