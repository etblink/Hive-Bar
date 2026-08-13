'use strict';

(function initializePayTab(global) {
  const OBSERVATION_ATTEMPTS = 3;
  const OBSERVATION_DELAY_MS = 1500;
  const ACTIVE_RECEIPT_STATES = new Set([
    'Validated',
    'AwaitingSignature',
    'BroadcastAccepted',
    'ConfirmationTimeout',
  ]);

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('text-red-300', isError);
    element.classList.toggle('text-gray-300', !isError);
  }

  class PayTabController {
    constructor({
      documentRef = global.document,
      fetchImpl = global.fetch?.bind(global),
      keychainFactory = () => new global.HiveBarKeychain.KeychainAdapter(),
      qrReaderFactory = () => new global.ZXingBrowser.BrowserQRCodeReader(),
      review,
      waitImpl = (milliseconds) => new Promise((resolve) => global.setTimeout(resolve, milliseconds)),
    } = {}) {
      this.document = documentRef;
      this.fetch = fetchImpl;
      this.keychainFactory = keychainFactory;
      this.qrReaderFactory = qrReaderFactory;
      this.review = review || ((receipt) => this.reviewDialog(receipt));
      this.wait = waitImpl;
      this.root = this.document?.querySelector('[data-pay-tab]') || null;
      this.current = null;
      this.cameraControls = null;
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
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(payload?.error?.message || 'The payment request could not be completed.');
        error.code = payload?.error?.code || 'PAYMENT_REQUEST_FAILED';
        throw error;
      }
      return payload;
    }

    bind() {
      if (!this.root) return;
      this.root.querySelector('[data-pay-form]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        this.run(event.currentTarget);
      });
      this.root.querySelector('[data-pay-camera-start]')?.addEventListener('click', () => {
        this.startCamera();
      });
      this.root.querySelector('[data-pay-camera-stop]')?.addEventListener('click', () => {
        this.stopCamera();
      });
      this.root.querySelector('[data-pay-image]')?.addEventListener('change', (event) => {
        this.importImage(event.currentTarget.files?.[0]);
      });
      this.root.querySelector('[data-pay-recheck]')?.addEventListener('click', () => {
        this.recheck();
      });
      this.loadRecent();
    }

    async loadRecent() {
      try {
        const receipt = await this.request('/api/payments/recent');
        if (receipt) {
          this.current = receipt;
          this.render(receipt);
        }
      } catch {
        // The page itself already communicates the sign-in and controlled-mode boundary.
      }
    }

    async run(form) {
      const button = form.querySelector('button[type="submit"]');
      const status = this.root.querySelector('[data-pay-status]');
      let session;
      let receipt;
      let broadcastAccepted = false;
      if (button) button.disabled = true;
      this.stopCamera();
      try {
        session = await this.request('/auth/session');
        if (!session?.authenticated) throw new Error('Sign in with Hive Keychain before paying a tab.');
        const uri = String(new FormData(form).get('uri') || '').trim();
        setStatus(status, 'Validating the bounded invoice against the merchant allowlist.');
        receipt = await this.request('/api/payments/preflight', {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: { uri },
        });
        this.current = receipt;
        this.render(receipt);
        this.lockInvoice(true);

        if (!(await this.review(receipt))) {
          receipt = await this.cancel(receipt.id, session.csrfToken);
          this.current = receipt;
          this.render(receipt);
          this.lockInvoice(false);
          setStatus(status, 'Cancelled before Keychain. Nothing was broadcast.');
          return;
        }

        receipt = await this.request(`/api/payments/${receipt.id}/awaiting-signature`, {
          method: 'POST',
          csrfToken: session.csrfToken,
        });
        this.current = receipt;
        this.render(receipt);
        setStatus(status, `Confirm the exact Active transfer in Hive Keychain for @${receipt.account}.`);
        const result = await this.keychainFactory().broadcast({
          account: receipt.account,
          operations: receipt.operations,
          authority: 'Active',
        });
        broadcastAccepted = Boolean(result?.accepted);
        receipt = await this.request(`/api/payments/${receipt.id}/accepted`, {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: { transactionId: result?.transactionId || null },
        });
        this.current = receipt;
        this.render(receipt);
        setStatus(status, receipt.message);

        for (let attempt = 0; attempt < OBSERVATION_ATTEMPTS; attempt += 1) {
          if (attempt > 0) await this.wait(OBSERVATION_DELAY_MS);
          receipt = await this.observe(receipt.id, session.csrfToken);
          this.current = receipt;
          this.render(receipt);
          setStatus(status, receipt.message);
          if (receipt.state === 'ChainConfirmed') return;
          if (receipt.state === 'ConfirmationTimeout') return;
        }
        setStatus(status, 'Confirmation remains pending. Recheck Hive before considering any new payment.');
      } catch (error) {
        if (receipt && !broadcastAccepted && session?.csrfToken) {
          try {
            const cancelled = await this.cancel(receipt.id, session.csrfToken);
            this.current = cancelled;
            this.render(cancelled);
            this.lockInvoice(false);
          } catch {
            // Preserve the original failure; a later receipt load will show durable state.
          }
        }
        const prefix = broadcastAccepted
          ? 'Keychain accepted the broadcast, but confirmation is incomplete. Do not retry automatically. '
          : '';
        setStatus(status, `${prefix}${error.message || 'The payment failed.'}`, true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    cancel(id, csrfToken) {
      return this.request(`/api/payments/${id}/cancel`, { method: 'POST', csrfToken });
    }

    observe(id, csrfToken) {
      return this.request(`/api/payments/${id}/observe`, { method: 'POST', csrfToken });
    }

    async recheck() {
      const button = this.root.querySelector('[data-pay-recheck]');
      const status = this.root.querySelector('[data-pay-status]');
      if (!this.current || !['BroadcastAccepted', 'ConfirmationTimeout'].includes(this.current.state)) return;
      button.disabled = true;
      try {
        const session = await this.request('/auth/session');
        if (!session?.authenticated) throw new Error('The verified session has ended. Sign in again.');
        const receipt = await this.observe(this.current.id, session.csrfToken);
        this.current = receipt;
        this.render(receipt);
        setStatus(status, receipt.message);
      } catch (error) {
        setStatus(status, `${error.message || 'The chain recheck failed.'} Do not pay again.`, true);
      } finally {
        button.disabled = false;
      }
    }

    render(receipt) {
      const container = this.root.querySelector('[data-pay-receipt]');
      if (!container || !receipt) return;
      container.hidden = false;
      const states = {
        Validated: 'Validated — not sent',
        AwaitingSignature: 'Awaiting Keychain — not sent',
        BroadcastAccepted: 'Broadcast accepted — confirmation pending',
        ConfirmationTimeout: 'Confirmation timed out — still pending',
        ChainConfirmed: 'Paid — confirmed on Hive',
        Cancelled: 'Cancelled — nothing was broadcast',
      };
      container.querySelector('[data-pay-receipt-state]').textContent = states[receipt.state] || receipt.state;
      container.querySelector('[data-pay-receipt-account]').textContent = `@${receipt.account}`;
      container.querySelector('[data-pay-receipt-merchant]').textContent = `@${receipt.merchant}`;
      container.querySelector('[data-pay-receipt-amount]').textContent = receipt.amount;
      container.querySelector('[data-pay-receipt-block]').textContent = receipt.blockNumber || 'Pending';
      container.querySelector('[data-pay-receipt-transaction]').textContent = receipt.transactionId || 'Pending';
      container.querySelector('[data-pay-receipt-fingerprint]').textContent = receipt.fingerprint;
      container.querySelector('[data-pay-receipt-message]').textContent = receipt.message || receipt.diagnostic || '';
      const recheck = container.querySelector('[data-pay-recheck]');
      if (recheck) recheck.hidden = !['BroadcastAccepted', 'ConfirmationTimeout'].includes(receipt.state);
      const rebate = container.querySelector('[data-pay-rebate]');
      if (rebate) rebate.hidden = !(receipt.state === 'ChainConfirmed' && receipt.rebate?.available);
      this.lockInvoice(ACTIVE_RECEIPT_STATES.has(receipt.state));
    }

    lockInvoice(locked) {
      const input = this.root?.querySelector('[data-pay-uri]');
      if (input) input.readOnly = Boolean(locked);
    }

    reviewDialog(receipt) {
      const dialog = this.document.querySelector('[data-social-confirm]');
      if (!dialog || typeof dialog.showModal !== 'function') {
        return Promise.resolve(
          global.confirm(
            `Confirm exact payment as @${receipt.account} with Active authority?\n\nFingerprint: ${receipt.fingerprint}\n\n${JSON.stringify(receipt.operations, null, 2)}`,
          ),
        );
      }
      dialog.querySelector('[data-social-summary]').textContent = Object.entries(receipt.summary)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      dialog.querySelector('[data-social-operations]').textContent = JSON.stringify(receipt.operations, null, 2);
      dialog.querySelector('[data-social-account]').textContent = `@${receipt.account}`;
      dialog.querySelector('[data-social-authority]').textContent = 'Active';
      dialog.querySelector('[data-social-fingerprint]').textContent = receipt.fingerprint;
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

    setInvoice(value, message) {
      const input = this.root.querySelector('[data-pay-uri]');
      if (input?.readOnly) {
        setStatus(this.root.querySelector('[data-pay-status]'), 'This validated invoice is immutable. Cancel or finish it before scanning another.', true);
        return;
      }
      input.value = String(value || '').trim();
      setStatus(this.root.querySelector('[data-pay-status]'), message);
    }

    async startCamera() {
      const status = this.root.querySelector('[data-pay-status]');
      const video = this.root.querySelector('[data-pay-video]');
      try {
        if (!global.ZXingBrowser) throw new Error('The local QR reader is unavailable. Paste the invoice URI instead.');
        this.stopCamera();
        video.classList.remove('hidden');
        this.root.querySelector('[data-pay-camera-start]').hidden = true;
        this.root.querySelector('[data-pay-camera-stop]').hidden = false;
        setStatus(status, 'Camera active. Hold the current payment QR code inside the frame.');
        const reader = this.qrReaderFactory();
        this.cameraControls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video,
          (result, error, controls) => {
            if (result) {
              controls.stop();
              this.cameraControls = null;
              video.classList.add('hidden');
              this.root.querySelector('[data-pay-camera-start]').hidden = false;
              this.root.querySelector('[data-pay-camera-stop]').hidden = true;
              this.setInvoice(result.getText(), 'QR decoded locally. Review the URI, then validate it.');
            } else if (
              error &&
              !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)
            ) {
              setStatus(status, 'The camera could not decode that image yet. Paste or import the invoice if needed.', true);
            }
          },
        );
      } catch (error) {
        this.stopCamera();
        setStatus(status, error.message || 'Camera access failed. Paste or import the invoice URI instead.', true);
      }
    }

    stopCamera() {
      this.cameraControls?.stop?.();
      this.cameraControls = null;
      const video = this.root?.querySelector('[data-pay-video]');
      if (video) video.classList.add('hidden');
      const start = this.root?.querySelector('[data-pay-camera-start]');
      const stop = this.root?.querySelector('[data-pay-camera-stop]');
      if (start) start.hidden = false;
      if (stop) stop.hidden = true;
    }

    async importImage(file) {
      const status = this.root.querySelector('[data-pay-status]');
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
        setStatus(status, 'Choose a supported QR image no larger than 8 MB.', true);
        return;
      }
      const objectUrl = global.URL.createObjectURL(file);
      try {
        const result = await this.qrReaderFactory().decodeFromImageUrl(objectUrl);
        this.setInvoice(result.getText(), 'QR image decoded locally. Review the URI, then validate it.');
      } catch {
        setStatus(status, 'No readable Hive payment QR code was found in that image.', true);
      } finally {
        global.URL.revokeObjectURL(objectUrl);
      }
    }
  }

  global.HiveBarPay = Object.freeze({ PayTabController });
  const controller = new PayTabController();
  controller.bind();
})(window);
