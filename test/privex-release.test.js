'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadConfig } = require('../src/config');
const {
  PRIVEX_EXPLICIT_SETTINGS,
  assertPrivexReadOnlyRelease,
  normalizePublicHost,
} = require('../src/release/privex-readiness');

const root = path.join(__dirname, '..');
const opsRoot = path.join(root, 'ops', 'privex');
const sessionSecret = 'privex-release-test-secret-with-32-bytes';

function productionSource(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '3000',
    BIND_HOST: '127.0.0.1',
    HIVE_BAR_HOST: 'hive-bar.example',
    SITE_NAME: '4th Street Bar',
    BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.',
    BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
    HIVE_COMMUNITY_ID: 'hive-108590',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES:
      'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    APP_ORIGIN: 'https://hive-bar.example',
    SESSION_SECRET: sessionSecret,
    TRUST_PROXY: '1',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function configFrom(source) {
  return loadConfig(source, { loadDotenv: false });
}

function read(relativePath) {
  return fs.readFileSync(path.join(opsRoot, relativePath), 'utf8');
}

test('binds one redacted Privex public read-only topology', () => {
  const source = productionSource();
  const summary = assertPrivexReadOnlyRelease(configFrom(source), source);

  assert.deepEqual(PRIVEX_EXPLICIT_SETTINGS, [
    'HIVE_BAR_HOST',
    'PORT',
    'HIVE_PAYMENT_RECEIPT_DB_PATH',
  ]);
  assert.deepEqual(summary, {
    profile: 'privex-public-read-only',
    environment: 'production',
    origin: 'https://hive-bar.example',
    bindHost: '127.0.0.1',
    writeMode: 'disabled',
    controlledAccountCount: 0,
    paymentsEnabled: false,
    distriatorEnabled: false,
    rpcNodeCount: 3,
    trustProxy: 1,
    logLevel: 'info',
    provider: 'Privex',
    package: 'V1-US-NVME',
    region: 'US West',
    operatingSystem: 'Debian 12',
    topology: 'single-instance-caddy',
    publicHost: 'hive-bar.example',
    port: 3000,
  });
  assert.equal(JSON.stringify(summary).includes(sessionSecret), false);
  assert.equal(Object.isFrozen(summary), true);
});

test('rejects every material deviation from the Privex topology', () => {
  const cases = [
    [{ HIVE_BAR_HOST: 'Hive-Bar.example' }, /HIVE_BAR_HOST must be a canonical DNS hostname/],
    [{ HIVE_BAR_HOST: 'https://hive-bar.example' }, /HIVE_BAR_HOST must be a canonical DNS hostname/],
    [{ APP_ORIGIN: 'https://www.hive-bar.example' }, /APP_ORIGIN must exactly match/],
    [{ BIND_HOST: '0.0.0.0' }, /BIND_HOST must be 127\.0\.0\.1/],
    [{ PORT: '3001' }, /PORT must be 3000/],
    [{ TRUST_PROXY: 'false' }, /TRUST_PROXY must be exactly 1/],
    [
      { HIVE_PAYMENT_RECEIPT_DB_PATH: '/var/lib/hive-bar/receipts.sqlite' },
      /HIVE_PAYMENT_RECEIPT_DB_PATH must be :memory:/,
    ],
    [
      { SESSION_SECRET: 'REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES' },
      /SESSION_SECRET must not contain an example placeholder/,
    ],
  ];

  for (const [overrides, expected] of cases) {
    const source = productionSource(overrides);
    assert.throws(() => assertPrivexReadOnlyRelease(configFrom(source), source), expected);
  }

  for (const name of ['HIVE_BAR_HOST', 'PORT']) {
    const source = productionSource();
    delete source[name];
    assert.throws(() => assertPrivexReadOnlyRelease(configFrom(source), source), new RegExp(name));
  }

  assert.equal(normalizePublicHost('bar.example'), 'bar.example');
  assert.equal(normalizePublicHost('localhost'), null);
  assert.equal(normalizePublicHost('bar.example/path'), null);
});

test('runs the Privex gate as a safe non-network CLI', () => {
  const script = path.join(root, 'scripts', 'check-privex-release.js');
  const success = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...productionSource() },
  });

  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).profile, 'privex-public-read-only');
  assert.equal(success.stdout.includes(sessionSecret), false);

  const refused = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...productionSource({ SESSION_SECRET: 'REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES' }),
    },
  });

  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /^Hive-Bar Privex release refused:/);
  assert.doesNotMatch(refused.stderr, /\n\s+at /);
  assert.equal(refused.stderr.includes('REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES'), false);
});

test('pins the exact Privex resource and Node runtime provenance', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const installer = read('bin/hive-bar-install-node');

  assert.equal(manifest.provider, 'Privex');
  assert.equal(manifest.package, 'V1-US-NVME');
  assert.equal(manifest.region, 'US West');
  assert.equal(manifest.operatingSystem, 'Debian 12');
  assert.deepEqual(manifest.resources, {
    virtualCpu: 1,
    memoryMiB: 1024,
    storageGiB: 20,
    networkMbps: 100,
    ipv4: true,
    ipv6: true,
    monthlyReferenceUsd: 10,
    referenceDate: '2026-08-13',
  });
  assert.deepEqual(manifest.runtime, {
    nodeVersion: '24.19.0',
    platform: 'linux-x64',
    source: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
    sha256: '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
  });
  assert.equal(manifest.topology.applicationAddress, '127.0.0.1:3000');
  assert.equal(manifest.release.automaticDeploys, false);
  assert.equal(manifest.release.exactCommitRequired, true);
  assert.deepEqual(manifest.boundaries, {
    writeMode: 'disabled',
    controlledAccounts: 0,
    paymentsEnabled: false,
    distriatorEnabled: false,
    receiptDatabase: ':memory:',
  });

  assert.match(installer, /readonly node_version=24\.19\.0/);
  assert.match(installer, new RegExp(`readonly archive_sha256=${manifest.runtime.sha256}`));
  assert.match(installer, /sha256sum --check --strict/);
  assert.match(installer, /curl --proto '=https' --tlsv1\.2 --fail/);
  assert.doesNotMatch(installer, /nodesource/i);
  assert.doesNotMatch(installer, /curl[^\n]*\|\s*(?:ba)?sh/);
});

test('hardens one loopback service and one exact-commit manual release path', () => {
  const service = read('hive-bar.service');
  const caddy = read('Caddyfile');
  const caddyEnvironment = read('caddy-hive-bar.conf');
  const deploy = read('bin/hive-bar-deploy');
  const rollback = read('bin/hive-bar-rollback');
  const healthcheck = read('bin/hive-bar-healthcheck');
  const environment = read('hive-bar.env.example');
  const caddyEnv = read('caddy.env.example');

  assert.match(service, /^User=hivebar$/m);
  assert.match(service, /^ExecStart=\/usr\/local\/bin\/node .*start-privex\.js$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectProc=invisible$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ProcSubset=pid$/m);
  assert.match(service, /^CapabilityBoundingSet=$/m);
  assert.match(service, /^RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX$/m);
  assert.doesNotMatch(service, /Environment=.*SESSION_SECRET/);

  assert.match(caddy, /^\{\$HIVE_BAR_HOST\} \{$/m);
  assert.match(caddy, /^\s*reverse_proxy 127\.0\.0\.1:3000 \{$/m);
  assert.match(caddy, /^\s*health_uri \/healthz$/m);
  assert.match(caddyEnvironment, /EnvironmentFile=\/etc\/hive-bar\/caddy\.env/);
  assert.doesNotMatch(caddyEnvironment, /hive-bar\.env/);
  assert.match(caddyEnv, /^HIVE_BAR_HOST=REPLACE_WITH_PUBLIC_HOST$/m);
  assert.doesNotMatch(caddyEnv, /SECRET|HIVE_RPC|WRITE_MODE/);

  assert.match(environment, /^BIND_HOST=127\.0\.0\.1$/m);
  assert.match(environment, /^HIVE_WRITE_MODE=disabled$/m);
  assert.match(environment, /^HIVE_CONTROLLED_ACCOUNTS=$/m);
  assert.match(environment, /^HIVE_PAYMENT_RECEIPT_DB_PATH=:memory:$/m);
  assert.match(environment, /^DISTRIATOR_ENABLED=false$/m);
  assert.match(environment, /^TRUST_PROXY=1$/m);
  assert.match(environment, /owner root:hivebar and mode 0640/);

  assert.match(deploy, /commit must be 40 lowercase hexadecimal characters/);
  assert.match(deploy, /cat-file -e "\$\{commit\}\^\{commit\}"/);
  assert.match(deploy, /git --git-dir="\$repository" archive --format=tar "\$commit"/);
  assert.match(deploy, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(deploy, /npx --no-install patch-package/);
  assert.match(deploy, /runuser -u hivebar -- env -i/);
  assert.match(deploy, /node scripts\/check-privex-release\.js/);
  assert.match(deploy, /\.hive-bar-commit/);
  assert.match(deploy, /\.hive-bar-tree/);
  assert.match(deploy, /the previous release was restored when available/);
  assert.doesNotMatch(deploy, /git (?:fetch|pull)/);
  assert.doesNotMatch(deploy, /npm install/);
  assert.match(rollback, /provide exactly one previously installed full commit SHA/);
  assert.match(rollback, /node scripts\/check-privex-release\.js/);
  assert.match(healthcheck, /http:\/\/127\.0\.0\.1:3000\/healthz/);
  assert.match(healthcheck, /'"writeMode":"disabled"'/);
});

test('keeps every Privex asset LF-stable and shell syntax valid', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  const files = fs
    .readdirSync(opsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));

  assert.match(attributes, /^ops\/privex\/\*\* text eol=lf$/m);
  assert.ok(files.length >= 14);
  for (const file of files) {
    const contents = fs.readFileSync(file);
    assert.equal(contents.includes(13), false, `${path.relative(root, file)} must contain LF only`);
  }

  if (process.platform !== 'win32') {
    for (const relativePath of [
      'bin/hive-bar-install-node',
      'bin/hive-bar-deploy',
      'bin/hive-bar-rollback',
      'bin/hive-bar-healthcheck',
    ]) {
      execFileSync('bash', ['-n', path.join(opsRoot, relativePath)], { stdio: 'pipe' });
    }
  }
});
