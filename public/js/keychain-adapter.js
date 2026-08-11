'use strict';

(function attachKeychainAdapter(global) {
  const DEFAULT_TIMEOUT_MS = 15_000;

  class KeychainError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'KeychainError';
      this.code = code;
    }
  }

  function responseError(response) {
    const detail = [response?.error, response?.message, response?.result]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    if (/cancel|declin|reject|denied/.test(detail)) {
      return new KeychainError('KEYCHAIN_CANCELLED', 'The Keychain request was cancelled. Nothing was broadcast.');
    }
    if (/lock|unlock|password/.test(detail)) {
      return new KeychainError('KEYCHAIN_LOCKED', 'Hive Keychain is locked. Unlock it and try again.');
    }
    return new KeychainError('KEYCHAIN_REQUEST_FAILED', 'Hive Keychain could not complete the request.');
  }

  class KeychainAdapter {
    constructor({ browserWindow = global, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      this.window = browserWindow;
      this.timeoutMs = timeoutMs;
    }

    async connect() {
      const keychain = await this.waitForExtension();
      if (typeof keychain.requestHandshake !== 'function') return keychain;

      await new Promise((resolve, reject) => {
        const timer = this.window.setTimeout(
          () => reject(new KeychainError('KEYCHAIN_TIMEOUT', 'Hive Keychain did not respond in time.')),
          this.timeoutMs,
        );
        try {
          keychain.requestHandshake((response) => {
            this.window.clearTimeout(timer);
            if (response?.error || response?.success === false) reject(responseError(response));
            else resolve();
          });
        } catch {
          this.window.clearTimeout(timer);
          reject(new KeychainError('KEYCHAIN_UNAVAILABLE', 'Hive Keychain is unavailable in this browser.'));
        }
      });
      return keychain;
    }

    async waitForExtension() {
      const startedAt = Date.now();
      while (Date.now() - startedAt < this.timeoutMs) {
        if (this.window.hive_keychain) return this.window.hive_keychain;
        await new Promise((resolve) => this.window.setTimeout(resolve, 50));
      }
      throw new KeychainError(
        'KEYCHAIN_UNAVAILABLE',
        'Hive Keychain was not found. Install or enable the browser extension, then try again.',
      );
    }

    async signBuffer({ account, message, title }) {
      const keychain = await this.connect();
      if (typeof keychain.requestSignBuffer !== 'function') {
        throw new KeychainError('KEYCHAIN_UNAVAILABLE', 'This Hive Keychain version cannot sign a login challenge.');
      }

      return new Promise((resolve, reject) => {
        const timer = this.window.setTimeout(
          () => reject(new KeychainError('KEYCHAIN_TIMEOUT', 'Hive Keychain did not respond in time.')),
          this.timeoutMs,
        );
        try {
          keychain.requestSignBuffer(
            account,
            message,
            'Posting',
            (response) => {
              this.window.clearTimeout(timer);
              if (!response || response.error || response.success === false) {
                reject(responseError(response));
                return;
              }
              if (response.data?.username && response.data.username !== account) {
                reject(
                  new KeychainError(
                    'KEYCHAIN_ACCOUNT_MISMATCH',
                    'Keychain returned a signature for a different account.',
                  ),
                );
                return;
              }
              if (response.data?.message && response.data.message !== message) {
                reject(
                  new KeychainError(
                    'KEYCHAIN_MESSAGE_MISMATCH',
                    'Keychain signed a different message than the server challenge.',
                  ),
                );
                return;
              }
              if (typeof response.result !== 'string' || typeof response.publicKey !== 'string') {
                reject(
                  new KeychainError(
                    'KEYCHAIN_INVALID_RESPONSE',
                    'Keychain returned an incomplete signature response.',
                  ),
                );
                return;
              }
              resolve({ signature: response.result, publicKey: response.publicKey });
            },
            undefined,
            title,
          );
        } catch {
          this.window.clearTimeout(timer);
          reject(new KeychainError('KEYCHAIN_REQUEST_FAILED', 'Hive Keychain could not open the signature request.'));
        }
      });
    }

    async broadcast({ account, operations }) {
      const keychain = await this.connect();
      if (typeof keychain.requestBroadcast !== 'function') {
        throw new KeychainError('KEYCHAIN_UNAVAILABLE', 'This Hive Keychain version cannot broadcast operations.');
      }

      return new Promise((resolve, reject) => {
        const timer = this.window.setTimeout(
          () => reject(new KeychainError('KEYCHAIN_TIMEOUT', 'Hive Keychain did not respond in time.')),
          this.timeoutMs,
        );
        try {
          keychain.requestBroadcast(
            account,
            operations,
            'Posting',
            (response) => {
              this.window.clearTimeout(timer);
              if (!response || response.error || response.success === false) {
                reject(responseError(response));
                return;
              }
              const transactionId =
                response.result?.id ||
                response.result?.tx_id ||
                response.result?.result?.id ||
                (typeof response.result === 'string' ? response.result : null);
              resolve({ accepted: true, transactionId });
            },
            undefined,
          );
        } catch {
          this.window.clearTimeout(timer);
          reject(new KeychainError('KEYCHAIN_REQUEST_FAILED', 'Hive Keychain could not open the broadcast request.'));
        }
      });
    }
  }

  global.HiveBarKeychain = Object.freeze({ KeychainAdapter, KeychainError });
})(window);
