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
const { assertPinnedRuntime, normalizeVersion } = require('../scripts/check-pinned-runtime');

const root = path.join(__dirname, '..');
const opsRoot = path.join(root, 'ops', 'privex');
const sessionSecret = 'privex-release-test-secret-with-32-bytes';

function productionSource(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '3000',
    BIND_HOST: '127.0.0.1',
    HIVE_BAR_HOST: 'fourthstreetbar.com',
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
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET: sessionSecret,
    TRUST_PROXY: 'loopback',
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
    origin: 'https://fourthstreetbar.com',
    bindHost: '127.0.0.1',
    writeMode: 'disabled',
    controlledAccountCount: 0,
    appTag: 'fourth-street-bar-app/0.1.0',
    paymentsEnabled: false,
    distriatorEnabled: false,
    rpcNodeCount: 3,
    trustProxy: 'loopback',
    logLevel: 'info',
    provider: 'Privex',
    package: 'V1-US-NVME',
    region: 'US West',
    operatingSystem: 'Debian 13',
    topology: 'single-instance-cloudflare-caddy',
    edgeProxy: 'Cloudflare',
    tlsMode: 'full-strict',
    visitorIpHeader: 'CF-Connecting-IP',
    publicHost: 'fourthstreetbar.com',
    port: 3000,
  });
  assert.equal(JSON.stringify(summary).includes(sessionSecret), false);
  assert.equal(Object.isFrozen(summary), true);
});

test('rejects every material deviation from the Privex topology', () => {
  const cases = [
    [{ HIVE_BAR_HOST: 'FourthStreetBar.com' }, /HIVE_BAR_HOST must be a canonical DNS hostname/],
    [{ HIVE_BAR_HOST: 'https://fourthstreetbar.com' }, /HIVE_BAR_HOST must be a canonical DNS hostname/],
    [{ HIVE_BAR_HOST: 'other.example', APP_ORIGIN: 'https://other.example' }, /HIVE_BAR_HOST must be exactly fourthstreetbar\.com/],
    [{ APP_ORIGIN: 'https://www.fourthstreetbar.com' }, /APP_ORIGIN must exactly match/],
    [{ BIND_HOST: '0.0.0.0' }, /BIND_HOST must be 127\.0\.0\.1/],
    [{ PORT: '3001' }, /PORT must be 3000/],
    [{ TRUST_PROXY: '1' }, /TRUST_PROXY must be exactly loopback/],
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

test('pins the exact Privex resource, host, and runtime provenance', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const installer = read('bin/hive-bar-install-node');
  const hostPreflight = read('bin/hive-bar-check-host');
  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const nodeVersionFile = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.equal(manifest.provider, 'Privex');
  assert.equal(manifest.package, 'V1-US-NVME');
  assert.equal(manifest.region, 'US West');
  assert.equal(manifest.operatingSystem, 'Debian 13');
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
    npmVersion: '11.17.0',
    platform: 'linux-x64',
    source: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
    sha256: '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
  });
  assert.equal(nodeVersionFile, '24.19.0\n');
  assert.deepEqual(packageManifest.engines, { node: '>=24.15 <25', npm: '>=11' });
  assert.equal(packageManifest.packageManager, 'npm@11.17.0');
  assert.match(workflow, /node-version-file: \.nvmrc/);
  assert.match(workflow, /npm run release:check:runtime/);
  assert.deepEqual(manifest.topology, {
    instances: 1,
    edgeProxy: 'Cloudflare',
    edgeDnsMode: 'proxied',
    reverseProxy: 'Caddy',
    applicationAddress: '127.0.0.1:3000',
    applicationTrustProxy: 'loopback',
    visitorIpHeader: 'CF-Connecting-IP',
    originIngress: 'cloudflare-only',
    cloudflareTlsMode: 'full-strict',
  });
  assert.equal(manifest.release.automaticDeploys, false);
  assert.equal(manifest.release.exactCommitRequired, true);
  assert.equal(manifest.release.publicHost, 'fourthstreetbar.com');
  assert.equal(manifest.release.redirectHost, 'www.fourthstreetbar.com');
  assert.equal(manifest.release.hiveAppTag, 'fourth-street-bar-app/0.1.0');
  assert.deepEqual(manifest.boundaries, {
    writeMode: 'disabled',
    controlledAccounts: 0,
    paymentsEnabled: false,
    distriatorEnabled: false,
    receiptDatabase: ':memory:',
  });

  assert.match(installer, /readonly node_version=24\.19\.0/);
  assert.match(installer, /readonly npm_version=11\.17\.0/);
  assert.match(installer, new RegExp(`readonly archive_sha256=${manifest.runtime.sha256}`));
  assert.match(installer, /sha256sum --check --strict/);
  assert.match(installer, /curl --proto '=https' --tlsv1\.2 --fail/);
  assert.match(installer, /"\$runtime_root\/bin\/node"/);
  assert.match(
    installer,
    /"\$runtime_root\/lib\/node_modules\/npm\/bin\/npm-cli\.js" --version/,
  );
  assert.deepEqual(installer.match(/read_bundled_npm_version "\$(?:staging|install_root)"/g), [
    'read_bundled_npm_version "$staging"',
    'read_bundled_npm_version "$install_root"',
  ]);
  assert.doesNotMatch(installer, /"\$(?:staging|install_root)\/bin\/npm" --version/);
  assert.doesNotMatch(installer, /nodesource/i);
  assert.doesNotMatch(installer, /curl[^\n]*\|\s*(?:ba)?sh/);

  assert.deepEqual(manifest.hostPreflight, {
    architecture: 'x86_64',
    minimumMemoryKiB: 900000,
    minimumFreeStorageKiB: 8388608,
  });
  assert.match(hostPreflight, /VERSION_ID=/);
  assert.match(hostPreflight, /\[\[ "\$version_id" == 13 \]\]/);
  assert.match(hostPreflight, /minimum_memory_kib=900000/);
  assert.match(hostPreflight, /minimum_free_storage_kib=8388608/);
});

test('binds exact Node and npm versions without accepting compatible drift', () => {
  assert.deepEqual(assertPinnedRuntime('v24.19.0', '11.17.0'), {
    nodeVersion: '24.19.0',
    npmVersion: '11.17.0',
  });
  assert.equal(normalizeVersion(' v24.19.0\n'), '24.19.0');
  assert.throws(() => assertPinnedRuntime('24.18.0', '11.17.0'), /Node must be exactly/);
  assert.throws(() => assertPinnedRuntime('24.19.0', '11.16.0'), /npm must be exactly/);
});

test('hardens one loopback service and one exact-commit manual release path', () => {
  const service = read('hive-bar.service');
  const caddy = read('Caddyfile');
  const caddyEnvironment = read('caddy-hive-bar.conf');
  const deploy = read('bin/hive-bar-deploy');
  const installNode = read('bin/hive-bar-install-node');
  const rollback = read('bin/hive-bar-rollback');
  const healthcheck = read('bin/hive-bar-healthcheck');
  const environment = read('hive-bar.env.example');
  const caddyEnv = read('caddy.env.example');
  const cloudflareCidrs = JSON.parse(read('cloudflare-origin-cidrs.json'));

  assert.match(service, /^User=hivebar$/m);
  assert.match(service, /^ExecStart=\/usr\/local\/bin\/node .*start-privex\.js$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectProc=invisible$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ProcSubset=pid$/m);
  assert.match(service, /^CapabilityBoundingSet=$/m);
  assert.match(service, /^RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX$/m);
  assert.doesNotMatch(service, /Environment=.*SESSION_SECRET/);

  assert.match(caddy, /^www\.\{\$HIVE_BAR_HOST\} \{$/m);
  assert.match(caddy, /^\{\$HIVE_BAR_HOST\} \{$/m);
  assert.equal(caddy.match(/^\s*route \{$/gm).length, 2);
  assert.match(caddy, /^\s*trusted_proxies_strict$/m);
  assert.match(caddy, /^\s*client_ip_headers CF-Connecting-IP$/m);
  assert.match(caddy, /^\s*header_up X-Forwarded-For \{client_ip\}$/m);
  assert.match(caddy, /^\s*header_up -CF-Connecting-IP$/m);
  assert.match(caddy, /^\s*redir https:\/\/\{\$HIVE_BAR_HOST\}\{uri\} permanent$/m);
  assert.match(caddy, /Direct origin access is not permitted\./);
  assert.match(caddy, /^\s*reverse_proxy 127\.0\.0\.1:3000 \{$/m);
  assert.match(caddy, /^\s*health_uri \/healthz$/m);
  assert.match(caddyEnvironment, /EnvironmentFile=\/etc\/hive-bar\/caddy\.env/);
  assert.doesNotMatch(caddyEnvironment, /hive-bar\.env/);
  assert.match(caddyEnv, /^HIVE_BAR_HOST=fourthstreetbar\.com$/m);
  assert.doesNotMatch(caddyEnv, /SECRET|HIVE_RPC|WRITE_MODE/);

  assert.match(environment, /^BIND_HOST=127\.0\.0\.1$/m);
  assert.match(environment, /^HIVE_BAR_HOST=fourthstreetbar\.com$/m);
  assert.match(environment, /^APP_ORIGIN=https:\/\/fourthstreetbar\.com$/m);
  assert.match(environment, /^HIVE_APP_TAG=fourth-street-bar-app\/0\.1\.0$/m);
  assert.match(environment, /^HIVE_WRITE_MODE=disabled$/m);
  assert.match(environment, /^HIVE_CONTROLLED_ACCOUNTS=$/m);
  assert.match(environment, /^HIVE_PAYMENT_RECEIPT_DB_PATH=:memory:$/m);
  assert.match(environment, /^DISTRIATOR_ENABLED=false$/m);
  assert.match(environment, /^TRUST_PROXY=loopback$/m);
  assert.match(environment, /owner root:hivebar and mode 0640/);

  assert.match(deploy, /commit must be 40 lowercase hexadecimal characters/);
  assert.match(deploy, /cat-file -e "\$\{commit\}\^\{commit\}"/);
  assert.match(deploy, /git --git-dir="\$repository" archive --format=tar "\$commit"/);
  assert.match(deploy, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(deploy, /npm runtime is not 11\.17\.0/);
  assert.match(deploy, /node scripts\/check-pinned-runtime\.js/);
  assert.match(deploy, /npx --no-install patch-package/);
  assert.match(deploy, /runuser -u hivebar -- env -i/);
  assert.match(deploy, /node scripts\/check-privex-release\.js/);
  assert.match(deploy, /\.hive-bar-commit/);
  assert.match(deploy, /\.hive-bar-tree/);
  assert.match(deploy, /the previous release was restored when available/);
  assert.doesNotMatch(deploy, /git (?:fetch|pull)/);
  assert.doesNotMatch(deploy, /npm install/);
  const runtimeRootModeIndex = installNode.indexOf('chmod 0755 "$staging"');
  assert.notEqual(
    runtimeRootModeIndex,
    -1,
    'the runtime root must receive an explicit traversable mode',
  );
  assert.ok(
    runtimeRootModeIndex < installNode.indexOf('mv -T "$staging" "$install_root"'),
    'the runtime root must become traversable before installation',
  );
  assert.match(installNode, /stat -c '%U:%G:%a' "\$install_root"/);
  assert.match(installNode, /root:root:755/);
  assert.match(
    installNode,
    /runuser -u hivebar -- "\$install_root\/bin\/node" --version/,
  );
  assert.equal(
    installNode.match(/runuser -u hivebar -- "\$install_root\/bin\/node"/g)
      .length,
    2,
  );
  assert.match(
    installNode,
    /"\$install_root\/lib\/node_modules\/npm\/bin\/npm-cli\.js" --version/,
  );
  assert.match(rollback, /provide exactly one previously installed full commit SHA/);
  assert.match(rollback, /node scripts\/check-privex-release\.js/);
  assert.match(healthcheck, /http:\/\/127\.0\.0\.1:3000\/healthz/);
  assert.match(healthcheck, /'"writeMode":"disabled"'/);

  assert.equal(cloudflareCidrs.reviewedAt, '2026-08-13');
  assert.equal(cloudflareCidrs.ipv4.length, 15);
  assert.equal(cloudflareCidrs.ipv6.length, 7);
  for (const cidr of [...cloudflareCidrs.ipv4, ...cloudflareCidrs.ipv6]) {
    assert.equal(caddy.split(cidr).length - 1, 2, `${cidr} must bind trust and ingress`);
  }
});

test('keeps every Privex asset LF-stable and shell syntax valid', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  const files = fs
    .readdirSync(opsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));

  assert.match(attributes, /^\.nvmrc text eol=lf$/m);
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
      'bin/hive-bar-check-host',
    ]) {
      execFileSync('bash', ['-n', path.join(opsRoot, relativePath)], { stdio: 'pipe' });
    }
  }
});
