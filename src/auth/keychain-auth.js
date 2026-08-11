'use strict';

const { createHash } = require('node:crypto');
const { AuthenticationError } = require('../lib/errors');

const PUBLIC_KEY_PATTERN = /^STM[1-9A-HJ-NP-Za-km-z]{40,60}$/;
const COMPACT_SIGNATURE_PATTERN = /^[0-9a-fA-F]{130}$/;

let hiveTxPromise;

function loadHiveTx() {
  hiveTxPromise ||= import('hive-tx');
  return hiveTxPromise;
}

async function verifyCompactSignature({ message, publicKey, signature }) {
  if (!PUBLIC_KEY_PATTERN.test(String(publicKey || ''))) {
    throw new AuthenticationError('Keychain returned an invalid public key', {
      code: 'AUTH_PUBLIC_KEY_INVALID',
    });
  }
  if (!COMPACT_SIGNATURE_PATTERN.test(String(signature || ''))) {
    throw new AuthenticationError('Keychain returned an invalid signature', {
      code: 'AUTH_SIGNATURE_INVALID',
    });
  }

  try {
    const { PublicKey, Signature } = await loadHiveTx();
    const digest = createHash('sha256').update(message, 'utf8').digest();
    return PublicKey.fromString(publicKey).verify(digest, Signature.from(signature));
  } catch (error) {
    throw new AuthenticationError('The Keychain signature is invalid', {
      code: 'AUTH_SIGNATURE_INVALID',
      cause: error,
    });
  }
}

class KeychainAuthService {
  constructor({ challengeStore, sessionStore, authorityVerifier }) {
    this.challengeStore = challengeStore;
    this.sessionStore = sessionStore;
    this.authorityVerifier = authorityVerifier;
  }

  issueChallenge(account) {
    return this.challengeStore.issue(account);
  }

  async verify({ challengeId, account, publicKey, signature }) {
    const challenge = this.challengeStore.consume(challengeId, account);
    const signatureValid = await verifyCompactSignature({
      message: challenge.message,
      publicKey,
      signature,
    });
    if (!signatureValid) {
      throw new AuthenticationError('The Keychain signature is invalid', {
        code: 'AUTH_SIGNATURE_INVALID',
      });
    }

    const authorized = await this.authorityVerifier.isAuthorized(account, publicKey);
    if (!authorized) {
      throw new AuthenticationError(
        'The signing key is not authorized by this account’s current posting authority',
        { code: 'AUTHORITY_MISMATCH' },
      );
    }

    return this.sessionStore.create(account);
  }
}

module.exports = {
  COMPACT_SIGNATURE_PATTERN,
  KeychainAuthService,
  PUBLIC_KEY_PATTERN,
  verifyCompactSignature,
};
