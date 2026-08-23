'use strict';

const root = document.querySelector('[data-onboarding-customer]');
if (root) {
  const usernameInput = root.querySelector('[data-onboarding-username]');
  const checkButton = root.querySelector('[data-onboarding-check]');
  const recoveryPanel = root.querySelector('[data-onboarding-recovery]');
  const recoveryText = root.querySelector('[data-onboarding-recovery-text]');
  const downloadButton = root.querySelector('[data-onboarding-download]');
  const savedCheckbox = root.querySelector('[data-onboarding-saved]');
  const qrButton = root.querySelector('[data-onboarding-create-qr]');
  const qrPanel = root.querySelector('[data-onboarding-qr-panel]');
  const qrTarget = root.querySelector('[data-onboarding-qr]');
  const status = root.querySelector('[data-onboarding-status]');
  const readyPanel = root.querySelector('[data-onboarding-ready]');
  const readyAccount = root.querySelector('[data-onboarding-ready-account]');
  const TRACKING_KEY = 'hive-bar:onboarding-request:v1';

  let credentials = null;
  let recoveryBlobUrl = null;
  let idempotencyKey = null;
  let statusTimer = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function randomOpaqueKey() {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return window.btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/u, '');
  }

  function randomMasterPassword() {
    return `P5K${randomOpaqueKey()}`;
  }

  async function deriveCredentials(username) {
    const { PrivateKey } = await import('hive-tx');
    const masterPassword = randomMasterPassword();
    const roles = ['owner', 'active', 'posting', 'memo'];
    const derived = Object.fromEntries(
      roles.map((role) => {
        const privateKey = PrivateKey.fromLogin(username, masterPassword, role);
        return [
          role,
          {
            privateKey: privateKey.toString(),
            publicKey: privateKey.createPublic().toString(),
          },
        ];
      }),
    );
    return { username, masterPassword, derived };
  }

  function recoveryDocument(value) {
    return [
      '4th Street Bar — Hive account recovery credentials',
      '',
      `Hive username: @${value.username}`,
      `Master password: ${value.masterPassword}`,
      '',
      `Owner private key: ${value.derived.owner.privateKey}`,
      `Active private key: ${value.derived.active.privateKey}`,
      `Posting private key: ${value.derived.posting.privateKey}`,
      `Memo private key: ${value.derived.memo.privateKey}`,
      '',
      'Keep this file private and offline. Anyone with these credentials can control your Hive account.',
      '4th Street Bar and Hive-Bar do not receive or retain these private credentials.',
      '',
    ].join('\n');
  }

  function publicKeys(value) {
    return {
      owner: value.derived.owner.publicKey,
      active: value.derived.active.publicKey,
      posting: value.derived.posting.publicKey,
      memo: value.derived.memo.publicKey,
    };
  }

  function revokeRecoveryDownload() {
    if (recoveryBlobUrl) URL.revokeObjectURL(recoveryBlobUrl);
    recoveryBlobUrl = null;
    downloadButton.removeAttribute('href');
    downloadButton.removeAttribute('download');
    downloadButton.hidden = true;
  }

  function clearTracking() {
    window.sessionStorage.removeItem(TRACKING_KEY);
  }

  function saveTracking(value) {
    window.sessionStorage.setItem(TRACKING_KEY, JSON.stringify({
      idempotencyKey: value.idempotencyKey,
      requestId: value.requestId || null,
      username: value.username || null,
      staffUrl: value.staffUrl || null,
      statusUrl: value.statusUrl || null,
    }));
  }

  function loadTracking() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(TRACKING_KEY) || 'null');
      if (!parsed || typeof parsed.idempotencyKey !== 'string') return null;
      return parsed;
    } catch {
      clearTracking();
      return null;
    }
  }

  function resetRecovery({ keepTracking = false } = {}) {
    credentials = null;
    idempotencyKey = null;
    recoveryText.textContent = '';
    recoveryPanel.hidden = true;
    qrPanel.hidden = true;
    readyPanel.hidden = true;
    savedCheckbox.checked = false;
    savedCheckbox.disabled = false;
    qrButton.disabled = true;
    revokeRecoveryDownload();
    if (!keepTracking) clearTracking();
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = null;
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Hive-Bar could not complete that step.');
      error.status = response.status;
      error.code = body?.error?.code;
      throw error;
    }
    return body;
  }

  function showQr(staffUrl, username) {
    const writer = new window.ZXingBrowser.BrowserQRCodeSvgWriter();
    const svg = writer.write(staffUrl, 288, 288);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Bartender onboarding QR for @${username}`);
    qrTarget.replaceChildren(svg);
    qrPanel.hidden = false;
  }

  function finalizeRecoveryHandoff() {
    revokeRecoveryDownload();
    recoveryText.textContent = '';
    recoveryPanel.hidden = true;
    savedCheckbox.checked = false;
    savedCheckbox.disabled = true;
    credentials = null;
  }

  function terminalMessage(request) {
    if (request.status === 'expired') return 'This QR expired. Start a new account request.';
    if (request.status === 'conflict') return 'This request needs staff help before you continue. Keep the recovery file you already saved.';
    if (request.status === 'cancelled') return 'This one-time request was cancelled before a confirmed broadcast. Start a new request only if staff tells you to.';
    return null;
  }

  async function handleStatus(request, statusUrl) {
    if (request.status === 'complete') {
      readyAccount.textContent = `@${request.username}`;
      readyPanel.hidden = false;
      qrPanel.hidden = true;
      setStatus('Your Hive account is ready. Add it to Hive Keychain using the recovery file you saved.');
      clearTracking();
      return false;
    }
    const terminal = terminalMessage(request);
    if (terminal) {
      qrPanel.hidden = true;
      setStatus(terminal);
      clearTracking();
      return false;
    }
    setStatus(
      request.status === 'pending'
        ? 'Waiting for the bartender to verify creator resources, receive your $5 cash fee, and review the account.'
        : 'The bartender has started this durable account request. Do not create another request or ask them to approve it twice.',
    );
    statusTimer = window.setTimeout(() => pollStatus(statusUrl), 3000);
    return true;
  }

  async function pollStatus(statusUrl) {
    try {
      const body = await jsonFetch(statusUrl);
      await handleStatus(body.request, statusUrl);
    } catch (error) {
      setStatus(`${error.message} Your durable request may still be valid; do not create a duplicate request yet.`);
      statusTimer = window.setTimeout(() => pollStatus(statusUrl), 5000);
    }
  }

  async function resumeDurableRequest() {
    const tracking = loadTracking();
    if (!tracking) return;
    try {
      const body = await jsonFetch(`/api/onboarding/recover/${encodeURIComponent(tracking.idempotencyKey)}`);
      const request = body.request;
      usernameInput.value = request.username;
      idempotencyKey = tracking.idempotencyKey;
      saveTracking({
        idempotencyKey,
        requestId: request.id,
        username: request.username,
        staffUrl: body.staffUrl,
        statusUrl: body.statusUrl,
      });
      if (['pending', 'prepared', 'signing', 'observing'].includes(request.status)) {
        showQr(body.staffUrl, request.username);
        setStatus('Recovered your existing durable onboarding request. Show the same QR to staff; do not create another request.');
        statusTimer = window.setTimeout(() => pollStatus(body.statusUrl), 1000);
        return;
      }
      await handleStatus(request, body.statusUrl);
    } catch (error) {
      if (error.status === 404) {
        clearTracking();
        setStatus('Choose a username to begin.');
        return;
      }
      setStatus(`${error.message} Do not create a duplicate request until staff confirms the prior request is absent.`);
    }
  }

  checkButton.addEventListener('click', async () => {
    resetRecovery();
    const username = usernameInput.value.trim().toLowerCase();
    usernameInput.value = username;
    checkButton.disabled = true;
    setStatus('Checking that Hive username…');
    try {
      const result = await jsonFetch(`/api/onboarding/username/${encodeURIComponent(username)}`);
      if (!result.available) {
        setStatus(`@${result.username} is already taken. Try another name.`);
        return;
      }
      credentials = await deriveCredentials(result.username);
      idempotencyKey = randomOpaqueKey();
      saveTracking({ idempotencyKey, username: result.username });
      recoveryText.textContent = recoveryDocument(credentials);
      recoveryPanel.hidden = false;
      const blob = new window.Blob([recoveryText.textContent], { type: 'text/plain;charset=utf-8' });
      recoveryBlobUrl = URL.createObjectURL(blob);
      downloadButton.href = recoveryBlobUrl;
      downloadButton.download = `hive-${result.username}-recovery.txt`;
      downloadButton.hidden = false;
      setStatus(`@${result.username} is available. Save your recovery credentials before continuing.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      checkButton.disabled = false;
    }
  });

  savedCheckbox.addEventListener('change', () => {
    qrButton.disabled = !savedCheckbox.checked || !credentials;
  });

  qrButton.addEventListener('click', async () => {
    if (!credentials || !savedCheckbox.checked || !idempotencyKey) return;
    qrButton.disabled = true;
    setStatus('Creating your durable one-time bartender QR…');
    try {
      const body = await jsonFetch('/api/onboarding/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: credentials.username,
          recoveryAcknowledged: true,
          idempotencyKey,
          publicKeys: publicKeys(credentials),
        }),
      });

      saveTracking({
        idempotencyKey,
        requestId: body.request.id,
        username: body.request.username,
        staffUrl: body.staffUrl,
        statusUrl: body.statusUrl,
      });
      showQr(body.staffUrl, body.request.username);
      finalizeRecoveryHandoff();
      setStatus(
        body.reused
          ? 'Recovered the same durable request. Show this QR to the bartender; do not create another request.'
          : 'Recovery credentials are no longer available from this page. Show the QR to the bartender after the $5 cash onboarding fee is accepted.',
      );
      pollStatus(body.statusUrl);
    } catch (error) {
      qrButton.disabled = false;
      setStatus(`${error.message} If the request result is unclear, press the same button again; Hive-Bar will reuse the same durable request key.`);
    }
  });

  window.addEventListener('pagehide', () => {
    revokeRecoveryDownload();
    if (statusTimer) window.clearTimeout(statusTimer);
  });

  resumeDurableRequest().catch((error) => setStatus(error.message));
}
