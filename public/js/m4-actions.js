'use strict';

(function attachM4Actions(global) {
  const INBOX_INNER_MARKER = '#hivebar-inbox:v1:';
  const OBSERVATION_ATTEMPTS = 5;
  const OBSERVATION_DELAY_MS = 1_500;

  async function parseResponse(response) {
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'The Hive action could not be completed.');
      error.code = payload?.error?.code || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  function setStatus(container, message, isError = false) {
    const element = container.querySelector('[data-m4-status]');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('text-red-300', isError);
    element.classList.toggle('text-gray-300', !isError);
  }

  function field(formData, name) {
    return String(formData.get(name) || '').trim();
  }

  function basePayload(form) {
    const formData = new FormData(form);
    return {
      recipient: field(formData, 'recipient'),
      expectedFee: field(formData, 'expectedFee'),
      amount: field(formData, 'amount'),
      message: field(formData, 'message'),
      displayName: field(formData, 'displayName'),
      about: field(formData, 'about'),
      profileImage: field(formData, 'profileImage'),
      wallFee: field(formData, 'wallFee'),
      blocklist: field(formData, 'blocklist'),
      baseRevision: field(formData, 'baseRevision'),
    };
  }

  function wait(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  class M4ActionController {
    constructor({
      fetchImpl = global.fetch ? global.fetch.bind(global) : null,
      keychainFactory = () => new global.HiveBarKeychain.KeychainAdapter(),
      review = null,
      waitImpl = wait,
      reload = () => global.location.reload(),
    } = {}) {
      this.fetch = fetchImpl;
      this.keychainFactory = keychainFactory;
      this.review = review || ((preflight) => this.reviewDialog(preflight));
      this.wait = waitImpl;
      this.reload = reload;
    }

    async request(url, { method = 'GET', csrfToken, body } = {}) {
      const headers = { accept: 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return parseResponse(
        await this.fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    }

    async preparePayload(action, form, session, adapter) {
      const payload = basePayload(form);
      if (action === 'claim-rewards') return {};
      if (action === 'profile') {
        return {
          displayName: payload.displayName,
          about: payload.about,
          profileImage: payload.profileImage,
          wallFee: payload.wallFee,
          blocklist: payload.blocklist,
          baseRevision: payload.baseRevision,
        };
      }
      if (action === 'wall') {
        return {
          recipient: payload.recipient,
          expectedFee: payload.expectedFee,
          amount: payload.amount,
          message: payload.message,
        };
      }
      if (action === 'inbox') {
        const encrypted = await adapter.encodeMemo({
          account: session.account,
          receiver: payload.recipient,
          message: `${INBOX_INNER_MARKER}${payload.message}`,
        });
        return {
          recipient: payload.recipient,
          expectedFee: payload.expectedFee,
          amount: payload.amount,
          ciphertext: encrypted.ciphertext,
        };
      }
      throw new Error('This M4 action is invalid.');
    }

    async run(form) {
      const action = form.dataset.m4Action;
      const button = form.querySelector('button[type="submit"]');
      let session;
      let preflight;
      let broadcastAccepted = false;
      if (button) button.disabled = true;

      try {
        session = await this.request('/auth/session');
        if (!session?.authenticated) throw new Error('Sign in with Hive Keychain before using this action.');
        const adapter = this.keychainFactory();
        if (action === 'inbox') {
          setStatus(form, 'Encrypting the memo locally with Hive Keychain. Plaintext is not sent to Hive-Bar.');
        }
        const payload = await this.preparePayload(action, form, session, adapter);
        preflight = await this.request(`/api/m4/preflight/${action}`, {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: payload,
        });
        setStatus(form, `Prepared exact ${preflight.action} operation for @${preflight.account}.`);

        if (!(await this.review(preflight))) {
          await this.cancel(preflight.id, session.csrfToken);
          preflight = null;
          setStatus(form, 'Cancelled before Keychain. Nothing was broadcast.');
          return;
        }

        setStatus(
          form,
          `Confirm the exact ${preflight.authority} operation in Hive Keychain for @${preflight.account}.`,
        );
        const result = await adapter.broadcast({
          account: preflight.account,
          operations: preflight.operations,
          authority: preflight.authority,
        });
        broadcastAccepted = Boolean(result?.accepted);
        const accepted = await this.request(`/api/m4/preflight/${preflight.id}/accepted`, {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: { transactionId: result?.transactionId || null },
        });
        setStatus(form, accepted.message);

        for (let attempt = 0; attempt < OBSERVATION_ATTEMPTS; attempt += 1) {
          if (attempt > 0) await this.wait(OBSERVATION_DELAY_MS);
          const observation = await this.request(`/api/m4/preflight/${preflight.id}/observe`, {
            method: 'POST',
            csrfToken: session.csrfToken,
          });
          setStatus(form, observation.message);
          if (observation.state === 'observed') {
            this.reload();
            return;
          }
        }
      } catch (error) {
        if (preflight && !broadcastAccepted && session?.csrfToken) {
          await this.cancel(preflight.id, session.csrfToken).catch(() => {});
        }
        const prefix = broadcastAccepted
          ? 'Keychain accepted the broadcast, but confirmation is incomplete. Do not retry automatically. '
          : '';
        setStatus(form, `${prefix}${error.message || 'The Hive action failed.'}`, true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    cancel(preflightId, csrfToken) {
      return this.request(`/api/m4/preflight/${preflightId}/cancel`, {
        method: 'POST',
        csrfToken,
      });
    }

    reviewDialog(preflight) {
      const dialog = document.querySelector('[data-social-confirm]');
      if (!dialog || typeof dialog.showModal !== 'function') {
        return Promise.resolve(
          global.confirm(
            `Confirm ${preflight.action} as @${preflight.account} with ${preflight.authority} authority?\n\nFingerprint: ${preflight.fingerprint}\n\n${JSON.stringify(preflight.operations, null, 2)}`,
          ),
        );
      }
      dialog.querySelector('[data-social-summary]').textContent = Object.entries(preflight.summary)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join('\n');
      dialog.querySelector('[data-social-operations]').textContent = JSON.stringify(
        preflight.operations,
        null,
        2,
      );
      dialog.querySelector('[data-social-account]').textContent = `@${preflight.account}`;
      dialog.querySelector('[data-social-authority]').textContent = preflight.authority;
      dialog.querySelector('[data-social-fingerprint]').textContent = preflight.fingerprint;
      dialog.showModal();

      return new Promise((resolve) => {
        const confirmButton = dialog.querySelector('[data-social-confirm-button]');
        const cancelButton = dialog.querySelector('[data-social-cancel-button]');
        const finish = (value) => {
          confirmButton.removeEventListener('click', confirm);
          cancelButton.removeEventListener('click', cancel);
          dialog.removeEventListener('cancel', escape);
          dialog.close();
          resolve(value);
        };
        const confirm = () => finish(true);
        const cancel = () => finish(false);
        const escape = (event) => {
          event.preventDefault();
          finish(false);
        };
        confirmButton.addEventListener('click', confirm);
        cancelButton.addEventListener('click', cancel);
        dialog.addEventListener('cancel', escape);
      });
    }

    async decrypt(button) {
      const container = button.closest('[data-inbox-entry]');
      const output = container?.querySelector('[data-inbox-plaintext]');
      if (!container || !output) return;
      button.disabled = true;
      setStatus(container, 'Requesting local Memo-key decryption from Hive Keychain.');
      try {
        const session = await this.request('/auth/session');
        if (!session?.authenticated) throw new Error('The verified session has ended. Sign in again.');
        const decrypted = await this.keychainFactory().decodeMemo({
          account: session.account,
          ciphertext: button.dataset.inboxCiphertext,
        });
        if (!decrypted.plaintext.startsWith(INBOX_INNER_MARKER)) {
          throw new Error('This encrypted transfer is not a marked Hive-Bar inbox message.');
        }
        output.textContent = decrypted.plaintext.slice(INBOX_INNER_MARKER.length);
        output.hidden = false;
        setStatus(container, 'Decrypted locally. Plaintext was not sent to the server.');
      } catch (error) {
        setStatus(container, error.message || 'The encrypted memo could not be decrypted.', true);
      } finally {
        button.disabled = false;
      }
    }
  }

  global.HiveBarM4 = Object.freeze({ INBOX_INNER_MARKER, M4ActionController, basePayload });

  const controller = new M4ActionController();
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-m4-action]');
    if (form) {
      event.preventDefault();
      controller.run(form);
    }
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-inbox-ciphertext]');
    if (button) controller.decrypt(button);
  });
})(window);
