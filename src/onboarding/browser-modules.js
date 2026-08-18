'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_BROWSER_MODULE_VERSIONS = Object.freeze({
  'hive-tx': '7.2.0',
  '@noble/ciphers': '2.3.0',
  '@noble/curves': '2.3.0',
  '@noble/hashes': '2.3.0',
  bs58: '6.0.0',
  'base-x': '5.0.1',
});

function packageRootFromResolved(resolvedFile, expectedName) {
  let cursor = path.dirname(resolvedFile);
  while (true) {
    const packageFile = path.join(cursor, 'package.json');
    if (fs.existsSync(packageFile)) {
      const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      if (metadata.name === expectedName) {
        const expectedVersion = EXPECTED_BROWSER_MODULE_VERSIONS[expectedName];
        if (metadata.version !== expectedVersion) {
          throw new Error(
            `Onboarding browser module ${expectedName} must be exactly ${expectedVersion}, found ${metadata.version}`,
          );
        }
        return Object.freeze({ name: expectedName, version: metadata.version, root: cursor });
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new Error(`Could not resolve package root for ${expectedName}`);
}

function resolvePackage(expectedName, specifier, paths) {
  return packageRootFromResolved(require.resolve(specifier, paths ? { paths } : undefined), expectedName);
}

const hiveTx = resolvePackage('hive-tx', 'hive-tx');
const nobleCiphers = resolvePackage('@noble/ciphers', '@noble/ciphers/aes.js', [hiveTx.root]);
const nobleCurves = resolvePackage('@noble/curves', '@noble/curves/secp256k1.js', [hiveTx.root]);
const nobleHashes = resolvePackage('@noble/hashes', '@noble/hashes/utils.js', [hiveTx.root]);
const bs58 = resolvePackage('bs58', 'bs58', [hiveTx.root]);
const baseX = resolvePackage('base-x', 'base-x', [bs58.root]);

const BROWSER_MODULE_MOUNTS = Object.freeze([
  Object.freeze({
    packageName: 'hive-tx',
    version: hiveTx.version,
    urlPrefix: `/vendor/onboarding/hive-tx/${hiveTx.version}`,
    root: path.dirname(require.resolve('hive-tx')),
  }),
  Object.freeze({
    packageName: '@noble/ciphers',
    version: nobleCiphers.version,
    urlPrefix: `/vendor/onboarding/noble-ciphers/${nobleCiphers.version}`,
    root: nobleCiphers.root,
  }),
  Object.freeze({
    packageName: '@noble/curves',
    version: nobleCurves.version,
    urlPrefix: `/vendor/onboarding/noble-curves/${nobleCurves.version}`,
    root: nobleCurves.root,
  }),
  Object.freeze({
    packageName: '@noble/hashes',
    version: nobleHashes.version,
    urlPrefix: `/vendor/onboarding/noble-hashes/${nobleHashes.version}`,
    root: nobleHashes.root,
  }),
  Object.freeze({
    packageName: 'bs58',
    version: bs58.version,
    urlPrefix: `/vendor/onboarding/bs58/${bs58.version}`,
    root: path.join(bs58.root, 'src', 'esm'),
  }),
  Object.freeze({
    packageName: 'base-x',
    version: baseX.version,
    urlPrefix: `/vendor/onboarding/base-x/${baseX.version}`,
    root: path.join(baseX.root, 'src', 'esm'),
  }),
]);

for (const mount of BROWSER_MODULE_MOUNTS) {
  if (!fs.statSync(mount.root).isDirectory()) {
    throw new Error(`Onboarding browser module root is unavailable for ${mount.packageName}`);
  }
}

const ONBOARDING_IMPORT_MAP = Object.freeze({
  imports: Object.freeze({
    'hive-tx': `/vendor/onboarding/hive-tx/${hiveTx.version}/index.mjs`,
    '@noble/ciphers/': `/vendor/onboarding/noble-ciphers/${nobleCiphers.version}/`,
    '@noble/curves/': `/vendor/onboarding/noble-curves/${nobleCurves.version}/`,
    '@noble/hashes/': `/vendor/onboarding/noble-hashes/${nobleHashes.version}/`,
    bs58: `/vendor/onboarding/bs58/${bs58.version}/index.js`,
    'base-x': `/vendor/onboarding/base-x/${baseX.version}/index.js`,
  }),
});

const ONBOARDING_IMPORT_MAP_TEXT = JSON.stringify(ONBOARDING_IMPORT_MAP);
const ONBOARDING_IMPORT_MAP_CSP_SOURCE = `'sha256-${createHash('sha256')
  .update(ONBOARDING_IMPORT_MAP_TEXT, 'utf8')
  .digest('base64')}'`;

function authorizeOnboardingImportMap(res) {
  const current = res.getHeader('Content-Security-Policy');
  if (typeof current !== 'string') {
    throw new Error('Onboarding import map requires the reviewed Content-Security-Policy header');
  }
  const marker = "script-src 'self'";
  if (!current.includes(marker) || current.includes(ONBOARDING_IMPORT_MAP_CSP_SOURCE)) {
    throw new Error('Onboarding import map could not bind the reviewed script-src policy exactly once');
  }
  res.setHeader(
    'Content-Security-Policy',
    current.replace(marker, `${marker} ${ONBOARDING_IMPORT_MAP_CSP_SOURCE}`),
  );
}

module.exports = {
  BROWSER_MODULE_MOUNTS,
  EXPECTED_BROWSER_MODULE_VERSIONS,
  ONBOARDING_IMPORT_MAP,
  ONBOARDING_IMPORT_MAP_CSP_SOURCE,
  ONBOARDING_IMPORT_MAP_TEXT,
  authorizeOnboardingImportMap,
};
