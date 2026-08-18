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

  let credentials = null;
  let recoveryBlobUrl = null;
  let statusTimer = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function randomMasterPassword() {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const encoded = window.btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/u, '');
    return `P5K${encoded}`;
  }

  async function deriveCredentials(username) {
    const { PrivateKey } = await import('/vendor/hive-tx/index.mjs');
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

  function resetRecovery() {
    credentials = null;
    recoveryText.textContent = '';
    recoveryPanel.hidden = true;
    qrPanel.hidden = true;
    readyPanel.hidden = true;
    savedCheckbox.checked = false;
    qrButton.disabled = true;
    if (recoveryBlobUrl) URL.revokeObjectURL(recoveryBlobUrl);
    recoveryBlobUrl = null;
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = null;
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
      recoveryText.textContent = recoveryDocument(credentials);
      recoveryPanel.hidden = false;
      const blob = new window.Blob([recoveryText.textContent], { type: 'text/plain;charset=utf-8' });
      recoveryBlobUrl = URL.createObjectURL(blob);
      downloadButton.href = recoveryBlobUrl;
      downloadButton.download = `hive-${result.username}-recovery.txt`;
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
    if (!credentials || !savedCheckbox.checked) return;
    qrButton.disabled = true;
    setStatus('Creating your one-time bartender QR…');
    try {
      const body = await jsonFetch('/api/onboarding/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: credentials.username,
          recoveryAcknowledged: true,
          publicKeys: publicKeys(credentials),
        }),
      });

      const writer = new window.ZXingBrowser.BrowserQRCodeSvgWriter();
      const svg = writer.write(body.staffUrl, 288, 288);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Bartender onboarding QR for @${credentials.username}`);
      qrTarget.replaceChildren(svg);
      qrPanel.hidden = false;
      recoveryText.textContent = 'Recovery credentials hidden after QR creation. Keep the downloaded recovery file safe.';
      credentials = null;
      setStatus(`Show this QR to the bartender after paying the $5 cash onboarding fee.`);
      pollStatus(body.statusUrl);
    } catch (error) {
      qrButton.disabled = false;
      setStatus(error.message);
    }
  });

  async function pollStatus(statusUrl) {
    try {
      const body = await jsonFetch(statusUrl);
      const request = body.request;
      if (request.status === 'complete') {
        readyAccount.textContent = `@${request.username}`;
        readyPanel.hidden = false;
        qrPanel.hidden = true;
        setStatus('Your Hive account is ready. Add it to Hive Keychain using the recovery file you saved.');
        return;
      }
      if (request.status === 'expired') {
        setStatus('This QR expired. Start a new account request.');
        return;
      }
      if (request.status === 'conflict') {
        setStatus('This request needs staff help before you continue. Do not discard your recovery file.');
        return;
      }
      setStatus(
        request.status === 'pending'
          ? 'Waiting for the bartender to receive your $5 cash fee and review the account.'
          : 'The bartender has started account creation. Do not create another request or ask them to approve it twice.',
      );
      statusTimer = window.setTimeout(() => pollStatus(statusUrl), 3000);
    } catch (error) {
      setStatus(`${error.message} Your QR remains valid; do not create a duplicate request yet.`);
      statusTimer = window.setTimeout(() => pollStatus(statusUrl), 5000);
    }
  }
}
