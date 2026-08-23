'use strict';

(function attachOnboardingStaff() {
  const root = document.querySelector('[data-onboarding-staff]');
  if (!root) return;

  const requestId = root.dataset.requestId;
  const creator = root.dataset.creator;
  const cashSection = root.querySelector('[data-onboarding-cash-section]');
  const cashCheckbox = root.querySelector('[data-onboarding-cash]');
  const prepareButton = root.querySelector('[data-onboarding-prepare]');
  const cancelButton = root.querySelector('[data-onboarding-cancel]');
  const readinessText = root.querySelector('[data-onboarding-readiness]');
  const preparedPanel = root.querySelector('[data-onboarding-prepared]');
  const operationSummary = root.querySelector('[data-onboarding-operation-summary]');
  const fingerprint = root.querySelector('[data-onboarding-fingerprint]');
  const keychainButton = root.querySelector('[data-onboarding-keychain]');
  const status = root.querySelector('[data-onboarding-staff-status]');

  let csrfToken = null;
  let currentRequest = null;
  let currentPrepared = null;
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
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Hive-Bar could not complete that step.');
      error.code = body?.error?.code;
      throw error;
    }
    return body;
  }

  async function loadSession() {
    const session = await jsonFetch('/auth/session');
    if (!session.authenticated || session.account !== creator) {
      disableMutationControls();
      setStatus(`Sign in as @${creator} before approving this account.`);
      return false;
    }
    csrfToken = session.csrfToken;
    return true;
  }

  function disableMutationControls() {
    if (cashCheckbox) cashCheckbox.disabled = true;
    if (prepareButton) prepareButton.disabled = true;
    if (keychainButton) keychainButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;
  }

  function showPrepared(request) {
    if (!request?.prepared) return;
    currentPrepared = {
      request,
      creator,
      authority: request.prepared.authority,
      operations: request.prepared.operations,
      fingerprint: request.prepared.fingerprint,
      starterHp: request.starterHp,
      delegationVests: request.prepared.delegationVests,
      cashFeeUsd: request.cashFeeUsd,
    };
    operationSummary.textContent = [
      `Create @${request.username} using 1 pre-claimed account token`,
      `Delegate ${request.starterHp} (${request.prepared.delegationVests}) from @${creator}`,
      `Active-authority operations: ${request.prepared.operations.map(([name]) => name).join(' + ')}`,
    ].join('\n');
    fingerprint.textContent = request.prepared.fingerprint;
    preparedPanel.hidden = false;
  }

  function renderTerminal(request) {
    disableMutationControls();
    if (cashSection) cashSection.hidden = true;
    if (keychainButton) keychainButton.hidden = true;
    if (cancelButton) cancelButton.hidden = true;
    if (request.status === 'complete') {
      setStatus(`@${request.username} is created and the exact starter Hive Power delegation is visible on Hive.`);
    } else if (request.status === 'conflict') {
      setStatus('Hive state does not match this request. Stop and inspect durable history; do not broadcast again.');
    } else if (request.status === 'cancelled') {
      setStatus('This one-time request is cancelled. A fresh customer request is required if onboarding should continue.');
    } else {
      setStatus('This request expired before Keychain. A fresh customer request is required.');
    }
  }

  async function renderRequest(request) {
    currentRequest = request;
    if (request.prepared) showPrepared(request);

    if (['complete', 'conflict', 'cancelled', 'expired'].includes(request.status)) {
      renderTerminal(request);
      return;
    }
    if (['signing', 'observing'].includes(request.status)) {
      if (cashSection) cashSection.hidden = true;
      if (keychainButton) keychainButton.hidden = true;
      if (cancelButton) cancelButton.hidden = true;
      disableMutationControls();
      setStatus('This request has already crossed the Keychain gate. Hive-Bar is observation-only; do not broadcast again.');
      schedulePoll();
      return;
    }
    if (request.status === 'prepared') {
      if (cashSection) cashSection.hidden = true;
      if (cancelButton) {
        cancelButton.hidden = false;
        cancelButton.disabled = false;
      }
      keychainButton.hidden = false;
      keychainButton.disabled = false;
      setStatus('This exact operation was recovered from durable state. Review it and continue to Keychain only once.');
      return;
    }
    await checkReadiness();
  }

  async function checkReadiness() {
    if (!csrfToken) return;
    disableMutationControls();
    if (cancelButton) {
      cancelButton.hidden = false;
      cancelButton.disabled = false;
    }
    readinessText.textContent = 'Checking the creator account token, starter delegation, and required Hive Power reserve…';
    try {
      const readiness = await jsonFetch(`/api/onboarding/requests/${requestId}/resource-readiness`);
      if (!readiness.ready) {
        readinessText.textContent = readiness.warning
          ? `${readiness.message} ${readiness.warning}`
          : readiness.message;
        setStatus('Do not collect the onboarding fee until creator resources are ready.');
        return;
      }
      readinessText.textContent = readiness.warning
        ? `${readiness.message} ${readiness.warning}`
        : readiness.message;
      cashCheckbox.disabled = false;
      prepareButton.disabled = !cashCheckbox.checked;
      setStatus(
        readiness.accountTokenLow
          ? 'Creator resources are ready, but ACT inventory is below its warning threshold. Replenish tokens soon; this request may continue.'
          : 'Creator resources are ready. Confirm the in-person cash fee only after it is actually received.',
      );
    } catch (error) {
      readinessText.textContent = error.message;
      setStatus('Creator readiness could not be established. Do not collect cash or open Keychain.');
    }
  }

  cashCheckbox?.addEventListener('change', () => {
    prepareButton.disabled = !cashCheckbox.checked;
  });

  prepareButton?.addEventListener('click', async () => {
    prepareButton.disabled = true;
    try {
      if (!(await loadSession())) return;
      if (!cashCheckbox.checked) {
        const fee = currentRequest?.cashFeeUsd || 'configured';
        throw new Error(`Confirm that the $${fee} cash onboarding fee has actually been received first.`);
      }
      const prepared = await jsonFetch(`/api/onboarding/requests/${requestId}/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ cashConfirmed: true }),
      });
      currentPrepared = prepared;
      currentRequest = prepared.request;
      showPrepared(prepared.request);
      if (cashSection) cashSection.hidden = true;
      keychainButton.hidden = false;
      keychainButton.disabled = false;
      setStatus('Review the exact two operations. Continue to Keychain only once; there is no automatic retry.');
    } catch (error) {
      prepareButton.disabled = false;
      setStatus(error.message);
    }
  });

  cancelButton?.addEventListener('click', async () => {
    cancelButton.disabled = true;
    try {
      if (!(await loadSession())) return;
      const body = await jsonFetch(`/api/onboarding/requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: '{}',
      });
      renderTerminal(body.request);
    } catch (error) {
      cancelButton.disabled = false;
      setStatus(error.message);
    }
  });

  keychainButton?.addEventListener('click', async () => {
    if (!currentPrepared || !csrfToken) return;
    keychainButton.disabled = true;
    if (cancelButton) cancelButton.hidden = true;
    let began = false;
    try {
      const locked = await jsonFetch(`/api/onboarding/requests/${requestId}/begin-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: '{}',
      });
      began = true;
      currentPrepared = locked;
      keychainButton.hidden = true;
      setStatus('Keychain is opening. This durable request is now locked against another broadcast attempt.');
      const adapter = new window.HiveBarKeychain.KeychainAdapter();
      const result = await adapter.broadcast({
        account: creator,
        operations: locked.operations,
        authority: 'Active',
      });
      await recordResult({ transactionId: result.transactionId || null, ambiguous: !result.transactionId });
      setStatus('Keychain accepted the account-creation transaction. Hive-Bar is checking the exact new account keys and delegation.');
      schedulePoll(250);
    } catch (error) {
      if (!began) {
        keychainButton.hidden = false;
        keychainButton.disabled = false;
        setStatus(error.message);
        return;
      }

      const definitelyCancelled = error?.code === 'KEYCHAIN_CANCELLED';
      try {
        if (definitelyCancelled) {
          const body = await recordResult({ transactionId: null, ambiguous: false, cancelled: true });
          renderTerminal(body.request);
          return;
        }
        await recordResult({ transactionId: null, ambiguous: true });
      } catch {
        // Preserve the original Keychain ambiguity. Never turn this into a retry path.
      }
      keychainButton.hidden = true;
      setStatus('Keychain outcome is unclear. Do not broadcast again. Hive-Bar will only observe the requested account and exact delegation.');
      schedulePoll(500);
    }
  });

  async function recordResult({ transactionId, ambiguous, cancelled = false }) {
    return jsonFetch(`/api/onboarding/requests/${requestId}/broadcast-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ transactionId, ambiguous, cancelled }),
    });
  }

  function schedulePoll(delay = 3000) {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(pollStatus, delay);
  }

  async function pollStatus() {
    try {
      const body = await jsonFetch(`/api/onboarding/requests/${requestId}/staff-status`);
      if (['complete', 'conflict', 'cancelled', 'expired'].includes(body.request.status)) {
        renderTerminal(body.request);
        return;
      }
      if (body.request.prepared) showPrepared(body.request);
      if (body.request.status === 'prepared') {
        await renderRequest(body.request);
        return;
      }
      setStatus('Waiting for Hive to show the exact account keys and starter delegation. Do not broadcast again.');
      schedulePoll();
    } catch (error) {
      setStatus(`${error.message} Do not broadcast again.`);
      schedulePoll(5000);
    }
  }

  async function initialize() {
    if (!(await loadSession())) return;
    const body = await jsonFetch(`/api/onboarding/requests/${requestId}/staff-status`);
    await renderRequest(body.request);
  }

  initialize().catch((error) => setStatus(error.message));

  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearTimeout(pollTimer);
  });
})();
