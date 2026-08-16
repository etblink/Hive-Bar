'use strict';

(function attachSocialActions(global) {
  const OBSERVATION_ATTEMPTS = 5;
  const OBSERVATION_DELAY_MS = 1_500;

  async function parseResponse(response) {
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'This action could not be completed.');
      error.code = payload?.error?.code || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  function formPayload(form) {
    const payload = {};
    for (const [name, value] of new FormData(form)) {
      const normalized = String(value).trim();
      if (!normalized) continue;
      if (name === 'tags') {
        payload.tags = normalized
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      } else if (name === 'percent') {
        payload.percent = Number(normalized);
      } else {
        payload[name] = normalized;
      }
    }
    return payload;
  }

  function setFormStatus(form, message, isError = false) {
    const element = form.querySelector('[data-social-status]');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('text-red-300', isError);
    element.classList.toggle('text-gray-300', !isError);
  }

  function updateByteCounter(input) {
    const maximum = Number(input.dataset.maxBytes);
    if (!Number.isInteger(maximum)) return;
    const bytes = new TextEncoder().encode(input.value).byteLength;
    const counter = input.parentElement?.querySelector('[data-byte-counter]');
    if (counter) {
      counter.textContent = `${bytes.toLocaleString()} / ${maximum.toLocaleString()} byte limit`;
      counter.classList.toggle('text-red-300', bytes > maximum);
      counter.classList.toggle('text-gray-400', bytes <= maximum);
    }
    input.setCustomValidity(bytes > maximum ? 'This text is too long. Shorten it and try again.' : '');
  }

  function wait(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  class SocialActionController {
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
      const response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return parseResponse(response);
    }

    async run(form) {
      const action = form.dataset.socialAction;
      const button = form.querySelector('button[type="submit"]');
      let session;
      let preflight;
      let broadcastAccepted = false;
      if (button) button.disabled = true;

      try {
        session = await this.request('/auth/session');
        if (!session?.authenticated) throw new Error('Sign in with Hive Keychain before using this action.');
        preflight = await this.request(`/api/social/preflight/${action}`, {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: formPayload(form),
        });
        const signerAccount = preflight.signer || preflight.account;
        setFormStatus(form, `Ready to review this ${preflight.action} as @${preflight.account}.`);

        const confirmed = await this.review(preflight);
        if (!confirmed) {
          await this.cancel(preflight.id, session.csrfToken);
          preflight = null;
          setFormStatus(form, 'Cancelled. Nothing was sent to Hive.');
          return;
        }

        if (form.dataset.signerMode !== 'keychain') {
          await this.cancel(preflight.id, session.csrfToken);
          preflight = null;
          setFormStatus(form, 'Signing isn’t available for this action. Nothing was sent to Hive.');
          return;
        }

        setFormStatus(form, `Approve this action in Hive Keychain as @${signerAccount}.`);
        const result = await this.keychainFactory().broadcast({
          account: signerAccount,
          operations: preflight.operations,
          authority: preflight.authority,
        });
        broadcastAccepted = Boolean(result?.accepted);
        const accepted = await this.request(`/api/social/preflight/${preflight.id}/accepted`, {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: { transactionId: result?.transactionId || null },
        });
        setFormStatus(form, accepted.message);

        for (let attempt = 0; attempt < OBSERVATION_ATTEMPTS; attempt += 1) {
          if (attempt > 0) await this.wait(OBSERVATION_DELAY_MS);
          const observation = await this.request(`/api/social/preflight/${preflight.id}/observe`, {
            method: 'POST',
            csrfToken: session.csrfToken,
          });
          setFormStatus(form, observation.message);
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
          ? 'Keychain approved this action, but Hive confirmation is still pending. Don’t try it again yet. '
          : '';
        setFormStatus(form, `${prefix}${error.message || 'This action failed.'}`, true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async cancel(preflightId, csrfToken) {
      return this.request(`/api/social/preflight/${preflightId}/cancel`, {
        method: 'POST',
        csrfToken,
      });
    }

    reviewDialog(preflight) {
      const dialog = document.querySelector('[data-social-confirm]');
      if (!dialog || typeof dialog.showModal !== 'function') {
        return Promise.resolve(
          global.confirm(
            `Review ${preflight.action} as @${preflight.account} before opening Keychain?\n\nTechnical fingerprint: ${preflight.fingerprint}\n\n${JSON.stringify(preflight.operations, null, 2)}`,
          ),
        );
      }

      dialog.querySelector('[data-social-summary]').textContent = Object.entries(preflight.summary)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\n');
      dialog.querySelector('[data-social-operations]').textContent = JSON.stringify(
        preflight.operations,
        null,
        2,
      );
      dialog.querySelector('[data-social-account]').textContent = `@${preflight.account}`;
      const signer = dialog.querySelector('[data-social-signer]');
      if (signer) signer.textContent = `@${preflight.signer || preflight.account}`;
      const authority = dialog.querySelector('[data-social-authority]');
      if (authority) authority.textContent = preflight.authority;
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
  }

  global.HiveBarSocial = Object.freeze({ SocialActionController, formPayload });

  const controller = new SocialActionController();
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-social-action]');
    if (form) {
      event.preventDefault();
      controller.run(form);
    }
  });
  document.addEventListener('input', (event) => {
    const input = event.target.closest('[data-max-bytes]');
    if (input) updateByteCounter(input);
  });
  for (const input of document.querySelectorAll('[data-max-bytes]')) {
    updateByteCounter(input);
  }
})(window);
