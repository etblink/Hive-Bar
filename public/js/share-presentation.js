'use strict';

(function attachSharePresentation(global) {
  function absoluteUrl(value) {
    return new URL(String(value || ''), global.location.origin).href;
  }

  function originalLabel(button) {
    if (!button.dataset.shareOriginalLabel) {
      button.dataset.shareOriginalLabel = button.textContent.trim() || 'Share';
    }
    return button.dataset.shareOriginalLabel;
  }

  function feedback(button, message) {
    const label = originalLabel(button);
    button.textContent = message;
    global.setTimeout(() => {
      button.textContent = label;
    }, 1800);
  }

  function shareTitle(button) {
    const explicit = String(button.dataset.shareTitle || '').trim();
    if (explicit) return explicit;
    const scope = button.closest?.('article, .social-feed-item, .conversation-post');
    const heading = scope?.querySelector?.('.social-post__title, .conversation-post__title, h1, h2, h3');
    const derived = heading?.textContent?.trim();
    return derived || global.document.title || '4th Street Bar post';
  }

  async function copyWithFallback(text) {
    if (global.navigator.clipboard?.writeText) {
      try {
        await global.navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy copy path when Clipboard permission is unavailable.
      }
    }

    const textarea = global.document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    global.document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = global.document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function sharePost(button) {
    const url = absoluteUrl(button.dataset.shareUrl);
    const title = shareTitle(button);

    if (typeof global.navigator.share === 'function') {
      try {
        await global.navigator.share({ title, url });
        return { method: 'native', url };
      } catch (error) {
        if (error?.name === 'AbortError') return { method: 'cancelled', url };
      }
    }

    const copied = await copyWithFallback(url);
    feedback(button, copied ? 'Link copied' : 'Copy failed');
    return { method: copied ? 'clipboard' : 'failed', url };
  }

  global.document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-share-post]');
    if (!button) return;
    sharePost(button).catch(() => feedback(button, 'Copy failed'));
  });

  global.HiveBarShare = Object.freeze({ sharePost });
})(window);
