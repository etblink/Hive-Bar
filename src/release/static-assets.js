'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FIRST_PARTY_ASSETS = Object.freeze([
  '/css/style.css',
  '/css/m15-social.css',
  '/css/m15-wallet-pay.css',
  '/js/keychain-adapter.js',
  '/js/auth.js',
  '/js/composer-presentation.js',
  '/js/social-actions.js',
  '/js/m4-actions.js',
  '/js/m16-beta-usability.js',
  '/js/onboarding-customer.js',
  '/js/onboarding-staff.js',
  '/js/main.js',
]);

function createStaticAssetUrl(publicRoot) {
  const root = path.resolve(publicRoot);
  const revisions = new Map(
    FIRST_PARTY_ASSETS.map((publicPath) => {
      const filename = path.resolve(root, publicPath.slice(1));
      const relative = path.relative(root, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('First-party asset escaped the public root');
      }
      const digest = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
      return [publicPath, digest];
    }),
  );

  return (publicPath) => {
    const revision = revisions.get(publicPath);
    if (!revision) throw new TypeError('The first-party asset is not registered for versioning');
    return `${publicPath}?v=${revision}`;
  };
}

module.exports = { FIRST_PARTY_ASSETS, createStaticAssetUrl };
