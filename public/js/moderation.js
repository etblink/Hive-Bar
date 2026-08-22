'use strict';

(function attachModeration(global) {
  async function parseResponse(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Moderation request could not be completed.');
      error.code = payload?.error?.code || 'MODERATION_REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  async function requestSession() {
    const response = await global.fetch('/auth/session', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    const session = await parseResponse(response);
    if (!session?.authenticated || !session.csrfToken) {
      throw new Error('Sign in with the authorized Hive account before moderating.');
    }
    return session;
  }

  async function postJson(url, csrfToken, body) {
    const response = await global.fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify(body),
    });
    return parseResponse(response);
  }

  function setStatus(root, message, isError = false) {
    const status = root.querySelector('[data-moderation-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'ok';
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value || '')).length;
  }

  function bindControl(root) {
    if (root.dataset.moderationBound === 'true') return;
    root.dataset.moderationBound = 'true';
    const dialog = root.querySelector('[data-moderation-dialog]');
    const openButton = root.querySelector('[data-moderation-open]');
    const cancelButton = root.querySelector('[data-moderation-cancel]');
    const form = root.querySelector('[data-moderation-hide-form]');
    if (!dialog || !openButton || !form) return;

    openButton.addEventListener('click', () => {
      setStatus(root, '');
      if (typeof dialog.showModal === 'function') dialog.showModal();
    });
    cancelButton?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => openButton.focus());

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      const reason = String(data.get('reason') || '').trim();
      if (utf8Bytes(reason) > 240) {
        setStatus(root, 'Reason is longer than 240 UTF-8 bytes.', true);
        return;
      }
      if (submit) submit.disabled = true;
      setStatus(root, 'Recording local moderation change…');
      try {
        const session = await requestSession();
        const targetType = String(data.get('targetType') || '');
        const payload = {
          targetType,
          author: String(data.get('author') || ''),
          reason,
        };
        if (targetType === 'content') payload.permlink = String(data.get('permlink') || '');
        const result = await postJson('/api/moderation/hide', session.csrfToken, payload);
        setStatus(root, result.message || 'Hidden from Fourth Street Bar.');
        global.location.reload();
      } catch (error) {
        setStatus(
          root,
          `${error.message || 'Moderation failed.'} If the request may have reached the server, check Moderation history before trying again.`,
          true,
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  function bindUnhide(form) {
    if (form.dataset.moderationBound === 'true') return;
    form.dataset.moderationBound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[data-moderation-status]');
      if (button) button.disabled = true;
      if (status) status.textContent = 'Restoring local visibility…';
      try {
        const session = await requestSession();
        const result = await postJson('/api/moderation/unhide', session.csrfToken, {
          targetId: form.dataset.targetId,
          reason: '',
        });
        if (status) status.textContent = result.message || 'Restored.';
        global.location.reload();
      } catch (error) {
        if (status) {
          status.textContent = `${error.message || 'Restore failed.'} Check Moderation history before trying again.`;
          status.dataset.state = 'error';
        }
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  function bindAll(root = global.document) {
    root.querySelectorAll('[data-moderation-control]').forEach(bindControl);
    root.querySelectorAll('[data-moderation-unhide]').forEach(bindUnhide);
  }

  global.document?.addEventListener('DOMContentLoaded', () => bindAll());
  global.document?.addEventListener('htmx:afterSwap', (event) => bindAll(event.target || global.document));
  global.HiveBarModeration = Object.freeze({ bindAll });
})(globalThis);
