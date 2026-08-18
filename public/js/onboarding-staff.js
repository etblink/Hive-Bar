'use strict';

(function attachOnboardingStaff() {
  const root = document.querySelector('[data-onboarding-staff]');
  if (!root) return;

  const requestId = root.dataset.requestId;
  const creator = root.dataset.creator;
  const cashCheckbox = root.querySelector('[data-onboarding-cash]');
  const prepareButton = root.querySelector('[data-onboarding-prepare]');
  const preparedPanel = root.querySelector('[data-onboarding-prepared]');
  const operationSummary = root.querySelector('[data-onboarding-operation-summary]');
  const fingerprint = root.querySelector('[data-onboarding-fingerprint]');
  const keychainButton = root.querySelector('[data-onboarding-keychain]');
  const status = root.querySelector('[data-onboarding-staff-status]');

  let csrfToken = null;
  let prepared = null;
  let pollTimer = null;

  function setStatus(message) {
    status.textContent = message;
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || 'Hive-Bar could not complete that step.');
    return body;
  }

  async function loadSession() {
    const session = await jsonFetch('/auth/session');
    if (!session.authenticated || session.account !== creator) {
      prepareButton.disabled = true;
      setStatus(`Sign in as @${creator} before approving this account.`);
      return false;
    }
    csrfToken = session.csrfToken;
    return true;
  }

  prepareButton.addEventListener('click', async () => {
    prepareButton.disabled = true;
    try {
      if (!(await loadSession())) return;
      if (!cashCheckbox.checked) throw new Error('Confirm that the $5 cash onboarding fee has been received first.');
      prepared = await jsonFetch(`/api/onboarding/requests/${requestId}/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ cashConfirmed: true }),
      });
      operationSummary.textContent = [
        `Create @${prepared.request.username} using 1 pre-claimed account token`,
        `Delegate ${prepared.starterHp} (${prepared.delegationVests}) from @${prepared.creator}`,
        `Active-authority operations: ${prepared.operations.map(([name]) => name).join(' + ')}`,
      ].join('\n');
      fingerprint.textContent = prepared.fingerprint;
      preparedPanel.hidden = false;
      keychainButton.disabled = false;
      setStatus('Review the two operations. Continue to Keychain only once; there is no automatic retry.');
    } catch (error) {
      prepareButton.disabled = false;
      setStatus(error.message);
    }
  });

  keychainButton.addEventListener('click', async () => {
    if (!prepared || !csrfToken) return;
    keychainButton.disabled = true;
    prepareButton.disabled = true;
    let began = false;
    try {
      const locked = await jsonFetch(`/api/onboarding/requests/${requestId}/begin-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: '{}',
      });
      began = true;
      setStatus('Keychain is opening. Do not approve this onboarding request a second time.');
      const adapter = new window.HiveBarKeychain.KeychainAdapter();
      const result = await adapter.broadcast({
        account: creator,
        operations: locked.operations,
        authority: 'Active',
      });
      await recordResult({ transactionId: result.transactionId || null, ambiguous: !result.transactionId });
      setStatus('Keychain accepted the account-creation transaction. Hive-Bar is checking the new account and delegation.');
      pollStatus();
    } catch (error) {
      if (began) {
        const definitelyCancelled = error?.code === 'KEYCHAIN_CANCELLED';
        if (!definitelyCancelled) {
          try {
            await recordResult({ transactionId: null, ambiguous: true });
          } catch {
            // Preserve the original Keychain ambiguity; never turn this into a retry path.
          }
        }
        setStatus(
          definitelyCancelled
            ? 'Keychain cancelled this one-time request. Start a fresh customer request if you still need to create the account.'
            : 'Keychain outcome is unclear. Do not broadcast again. Hive-Bar will only check the chain for the requested account and delegation.',
        );
        pollStatus();
        return;
      }
      keychainButton.disabled = false;
      prepareButton.disabled = false;
      setStatus(error.message);
    }
  });

  async function recordResult({ transactionId, ambiguous }) {
    return jsonFetch(`/api/onboarding/requests/${requestId}/broadcast-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ transactionId, ambiguous }),
    });
  }

  async function pollStatus() {
    try {
      const body = await jsonFetch(`/api/onboarding/requests/${requestId}/staff-status`);
      if (body.request.status === 'complete') {
        setStatus(`@${body.request.username} is created and the starter Hive Power delegation is visible on Hive.`);
        return;
      }
      if (body.request.status === 'conflict') {
        setStatus('Hive state does not match this request. Stop and inspect; do not broadcast again.');
        return;
      }
      setStatus('Waiting for Hive to show the exact account keys and starter delegation. Do not broadcast again.');
      pollTimer = window.setTimeout(pollStatus, 3000);
    } catch (error) {
      setStatus(`${error.message} Do not broadcast again.`);
      pollTimer = window.setTimeout(pollStatus, 5000);
    }
  }

  loadSession().catch((error) => setStatus(error.message));

  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearTimeout(pollTimer);
  });
})();
