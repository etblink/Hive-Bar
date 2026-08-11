'use strict';

(function initializeHiveAuth() {
  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'The request could not be completed.');
      error.code = payload?.error?.code || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('text-red-300', isError);
    element.classList.toggle('text-gray-300', !isError);
  }

  const loginForm = document.querySelector('[data-keychain-login]');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = loginForm.querySelector('button[type="submit"]');
      const status = loginForm.querySelector('[data-keychain-status]');
      const formData = new FormData(loginForm);
      const account = String(formData.get('account') || '').trim().toLowerCase();
      button.disabled = true;
      setStatus(
        status,
        `Preparing verified sign-in for @${account}. Keychain will request a Posting signature, not a transaction.`,
      );

      try {
        const challenge = await jsonRequest('/auth/challenge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ account }),
        });
        setStatus(status, `Confirm the Posting signature in Hive Keychain for @${account}.`);
        const adapter = new window.HiveBarKeychain.KeychainAdapter();
        const signed = await adapter.signBuffer({
          account,
          message: challenge.message,
          title: `Hive-Bar sign-in as @${account}`,
        });
        await jsonRequest('/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ account, challengeId: challenge.id, ...signed }),
        });
        setStatus(status, `Verified as @${account}. Reloading…`);
        window.location.reload();
      } catch (error) {
        setStatus(status, error.message || 'Hive Keychain sign-in failed.', true);
      } finally {
        button.disabled = false;
      }
    });
  }

  const logoutButton = document.querySelector('[data-keychain-logout]');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      const status = document.querySelector('[data-keychain-status]');
      logoutButton.disabled = true;
      try {
        const session = await jsonRequest('/auth/session');
        if (!session.authenticated) throw new Error('This session has already ended.');
        await jsonRequest('/auth/logout', {
          method: 'POST',
          headers: { 'x-csrf-token': session.csrfToken },
        });
        window.location.reload();
      } catch (error) {
        setStatus(status, error.message || 'Sign-out failed.', true);
        logoutButton.disabled = false;
      }
    });
  }
})();
