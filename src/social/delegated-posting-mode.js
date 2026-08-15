'use strict';

const { AuthorizationError } = require('../lib/errors');

function isM12DelegatedPostingMode(config) {
  return Boolean(config.hive.m12MerchantAuthor || config.hive.m12AuthorizedSigners.length);
}

async function resolvePostingIdentity({ config, signer, authorityVerifier }) {
  if (!isM12DelegatedPostingMode(config)) return { author: signer, signer };
  const author = config.hive.m12MerchantAuthor;
  if (!config.hive.m12AuthorizedSigners.includes(signer)) {
    throw new AuthorizationError('This personal Hive account is not approved for the delegated posting run', {
      code: 'DELEGATED_SIGNER_NOT_ALLOWED',
    });
  }
  const authorized = await authorityVerifier.isDirectAccountAuthorized(author, signer);
  if (!authorized) {
    throw new AuthorizationError('Current Hive Posting authority does not authorize this signer for the merchant author', {
      code: 'DELEGATED_POSTING_AUTHORITY_MISSING',
    });
  }
  return { author, signer };
}

module.exports = { isM12DelegatedPostingMode, resolvePostingIdentity };
