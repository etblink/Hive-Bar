'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { assertPrivexBarOperatorPosting } = require('../src/release/bar-operator-readiness');
const { appendOperatorAudit } = require('../src/social/operator-audit');
const { assertProbeTarget, runAuditSandboxProbe } = require('../scripts/check-m12-audit-remediation');
const { disabledEnvironment, replaceRegularFile } = require('../scripts/disable-m10-bar-operator');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ACCOUNT = 'fourthstreetbar';
const ORIGIN = 'http://localhost:3000';
const SECRET = 'm10-operator-session-secret-that-is-at-least-32-bytes';

function operatorConfig(directory, armedUntil) {
  return configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: ACCOUNT,
    HIVE_CONTROLLED_ACTIONS: 'post',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: '',
    HIVE_M10_OPERATOR_ARMED_UNTIL: armedUntil,
    HIVE_M10_OPERATOR_AUDIT_PATH: path.join(directory, 'm10-operator-audit.ndjson'),
    DISTRIATOR_ENABLED: 'false',
    SESSION_SECRET: SECRET,
    RATE_LIMIT_MAX: '1000',
  });
}

function operatorFixture(directory, armedUntil) {
  const config = operatorConfig(directory, armedUntil);
  const rpcPool = createFixtureRpc();
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { session, token } = sessionStore.create(ACCOUNT);
  return { app: createApp({ config, logger, rpcPool, sessionStore }), config, session, token };
}

function authorized(builder, fixture) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken);
}

test('M10 records prepared and Keychain-accepted post operations without recording post body', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-audit-'));
  try {
    const fixture = operatorFixture(directory, new Date(Date.now() + 60_000).toISOString());
    const response = await authorized(request(fixture.app).post('/api/social/preflight/post'), fixture)
      .send({ title: 'M10 fixture', body: 'This body must not enter the audit log.', tags: ['reno'] })
      .expect(201);
    await authorized(request(fixture.app).post(`/api/social/preflight/${response.body.id}/accepted`), fixture)
      .send({ transactionId: 'a'.repeat(40) })
      .expect(200);
    const records = fs.readFileSync(fixture.config.hive.m10OperatorAuditPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(records.map((record) => record.event), ['prepared', 'keychain_accepted']);
    assert.equal(records[0].account, ACCOUNT);
    assert.equal(records[1].transactionId, 'a'.repeat(40));
    assert.doesNotMatch(JSON.stringify(records), /This body must not enter/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M10 surfaces an unavailable audit target before any signing request can be prepared', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-audit-unavailable-'));
  try {
    const config = operatorConfig(directory, new Date(Date.now() + 60_000).toISOString());
    fs.rmSync(directory, { recursive: true, force: true });
    assert.throws(
      () => appendOperatorAudit(config, 'prepared', {
        account: ACCOUNT,
        signer: ACCOUNT,
        action: 'post',
        authority: 'Posting',
        fingerprint: 'a'.repeat(64),
      }),
      (error) => error.code === 'OPERATOR_AUDIT_UNAVAILABLE'
        && error.statusCode === 503
        && error.expose === true
        && /No Hive signing request was prepared/.test(error.message),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M10 preflight returns an explicit audit refusal instead of a generic 500', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-preflight-audit-unavailable-'));
  try {
    const fixture = operatorFixture(directory, new Date(Date.now() + 60_000).toISOString());
    fs.rmSync(directory, { recursive: true, force: true });
    const response = await authorized(
      request(fixture.app).post('/api/social/preflight/post'),
      fixture,
    )
      .send({ title: 'Blocked safely', body: 'No audit means no signing request.', tags: ['reno'] })
      .expect(503);
    assert.equal(response.body.error.code, 'OPERATOR_AUDIT_UNAVAILABLE');
    assert.match(response.body.error.message, /No Hive signing request was prepared/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M12 audit sandbox probe writes one metadata-only record and removes its exact target', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm12-audit-probe-'));
  const filename = path.join(directory, '.m12-audit-probe-m12a-20260815T024750Z-fb37a3eeeddb.ndjson');
  try {
    assert.throws(
      () => assertProbeTarget(path.join(directory, 'wrong-name.ndjson'), directory),
      /filename is invalid/,
    );
    const result = runAuditSandboxProbe(filename, directory);
    assert.equal(result.auditSandbox, 'writable');
    assert.equal(fs.existsSync(filename), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M10 expiry hides posting controls and rejects the post before any RPC request', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-expired-'));
  try {
    const fixture = operatorFixture(directory, new Date(Date.now() - 1_000).toISOString());
    const page = await request(fixture.app).get('/community').set('cookie', `hive_bar_session=${fixture.token}`).expect(200);
    assert.doesNotMatch(page.text, /data-social-action="post"/);
    const response = await authorized(request(fixture.app).post('/api/social/preflight/post'), fixture)
      .send({ title: 'Blocked', body: 'expired operator window', tags: ['reno'] })
      .expect(503);
    assert.equal(response.body.error.code, 'OPERATOR_ARM_EXPIRED');
    assert.equal(fs.existsSync(fixture.config.hive.m10OperatorAuditPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M12 development fixture separates the personal signer from the merchant author', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm12-delegated-'));
  try {
    const config = configFrom({
      HIVE_WRITE_MODE: 'controlled', HIVE_CONTROLLED_ACCOUNTS: ACCOUNT,
      HIVE_CONTROLLED_ACTIONS: 'post', HIVE_SIGNER_MODE: 'keychain',
      HIVE_M10_OPERATOR_ARMED_UNTIL: new Date(Date.now() + 60_000).toISOString(),
      HIVE_M10_OPERATOR_AUDIT_PATH: path.join(directory, 'audit.ndjson'),
      HIVE_M12_MERCHANT_AUTHOR: ACCOUNT, HIVE_M12_AUTHORIZED_SIGNERS: 'fartman69',
      HIVE_PAYMENT_MERCHANT_ACCOUNTS: '', DISTRIATOR_ENABLED: 'false',
      SESSION_SECRET: SECRET, RATE_LIMIT_MAX: '1000',
    });
    const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
    const { session, token } = sessionStore.create('fartman69');
    const calls = [];
    const authorityVerifier = {
      async isDirectAccountAuthorized(author, signer) {
        calls.push({ author, signer });
        return author === ACCOUNT && signer === 'fartman69';
      },
    };
    const app = createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore, authorityVerifier });
    const response = await authorized(request(app).post('/api/social/preflight/post'), { session, token })
      .send({ title: 'M12 fixture', body: 'Personal signer, merchant author.', tags: ['reno'] })
      .expect(201);
    assert.equal(response.body.account, ACCOUNT);
    assert.equal(response.body.signer, 'fartman69');
    assert.equal(response.body.operations[0][1].author, ACCOUNT);
    assert.deepEqual(calls, [{ author: ACCOUNT, signer: 'fartman69' }]);
    const audit = fs.readFileSync(config.hive.m10OperatorAuditPath, 'utf8');
    assert.match(audit, /"author":"fourthstreetbar"/);
    assert.match(audit, /"signer":"fartman69"/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M12 refuses the development signer after simulated authority revocation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm12-revoked-'));
  try {
    const config = configFrom({
      HIVE_WRITE_MODE: 'controlled', HIVE_CONTROLLED_ACCOUNTS: ACCOUNT,
      HIVE_CONTROLLED_ACTIONS: 'post', HIVE_SIGNER_MODE: 'keychain',
      HIVE_M10_OPERATOR_ARMED_UNTIL: new Date(Date.now() + 60_000).toISOString(),
      HIVE_M10_OPERATOR_AUDIT_PATH: path.join(directory, 'audit.ndjson'),
      HIVE_M12_MERCHANT_AUTHOR: ACCOUNT, HIVE_M12_AUTHORIZED_SIGNERS: 'fartman69',
      HIVE_PAYMENT_MERCHANT_ACCOUNTS: '', DISTRIATOR_ENABLED: 'false',
      SESSION_SECRET: SECRET, RATE_LIMIT_MAX: '1000',
    });
    const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
    const { session, token } = sessionStore.create('fartman69');
    const authorityVerifier = { async isDirectAccountAuthorized() { return false; } };
    const app = createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore, authorityVerifier });
    const response = await authorized(request(app).post('/api/social/preflight/post'), { session, token })
      .send({ title: 'Blocked', body: 'No authority', tags: ['reno'] })
      .expect(403);
    assert.equal(response.body.error.code, 'DELEGATED_POSTING_AUTHORITY_MISSING');
    assert.equal(fs.existsSync(config.hive.m10OperatorAuditPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M10 production gate permits only a finite, post-only, Keychain-backed operator configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-gate-'));
  try {
    const now = Date.now();
    const source = {
      NODE_ENV: 'production', PORT: '3000', BIND_HOST: '127.0.0.1', HIVE_BAR_HOST: 'fourthstreetbar.com',
      SITE_NAME: '4th Street Bar', BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512', BAR_PHONE: '(775) 324-7827',
      BAR_HOURS: 'Daily, noon–2:00 a.m.', BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
      BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno', HIVE_COMMUNITY_ID: 'hive-108590',
      THREADS_CONTAINER_ACCOUNT: 'fourthst.threads', HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
      HIVE_WRITE_MODE: 'controlled', HIVE_CONTROLLED_ACCOUNTS: ACCOUNT, HIVE_CONTROLLED_ACTIONS: 'post', HIVE_SIGNER_MODE: 'keychain',
      HIVE_M10_OPERATOR_ARMED_UNTIL: new Date(now + 60_000).toISOString(),
      HIVE_M10_OPERATOR_AUDIT_PATH: path.join(directory, 'm10-operator-audit.ndjson'), HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
      DISTRIATOR_ENABLED: 'false', DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim', HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
      APP_ORIGIN: 'https://fourthstreetbar.com', SESSION_SECRET: SECRET, TRUST_PROXY: 'loopback',
    };
    const config = loadConfig(source, { loadDotenv: false });
    assert.equal(assertPrivexBarOperatorPosting(config, source, now).profile, 'm10-bar-operator-posting');
    const tooLong = loadConfig({ ...source, HIVE_M10_OPERATOR_ARMED_UNTIL: new Date(now + 86_400_001).toISOString() }, { loadDotenv: false });
    assert.throws(() => assertPrivexBarOperatorPosting(tooLong, source, now), /no more than 24 hours/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('M10 explicit disable clears only operator-write settings in a regular environment file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm10-disable-'));
  try {
    const filename = path.join(directory, 'hive-bar.env');
    fs.writeFileSync(filename, [
      'SESSION_SECRET=preserve-me',
      'HIVE_WRITE_MODE=controlled',
      'HIVE_CONTROLLED_ACCOUNTS=fourthstreetbar',
      'HIVE_CONTROLLED_ACTIONS=post',
      'HIVE_SIGNER_MODE=keychain',
      'HIVE_M10_OPERATOR_ARMED_UNTIL=2030-01-01T00:00:00.000Z',
      'HIVE_M10_OPERATOR_AUDIT_PATH=/var/lib/hive-bar/audit/m10-operator-audit.ndjson',
    ].join('\n'));
    const before = fs.statSync(filename);
    assert.match(disabledEnvironment('HIVE_WRITE_MODE=controlled\n'), /HIVE_SIGNER_MODE=disabled/);
    replaceRegularFile(filename);
    const result = fs.readFileSync(filename, 'utf8');
    assert.match(result, /^SESSION_SECRET=preserve-me$/m);
    assert.match(result, /^HIVE_WRITE_MODE=disabled$/m);
    assert.match(result, /^HIVE_CONTROLLED_ACCOUNTS=$/m);
    assert.match(result, /^HIVE_CONTROLLED_ACTIONS=$/m);
    assert.match(result, /^HIVE_SIGNER_MODE=disabled$/m);
    assert.match(result, /^HIVE_M10_OPERATOR_ARMED_UNTIL=$/m);
    assert.match(result, /^HIVE_M10_OPERATOR_AUDIT_PATH=$/m);
    const after = fs.statSync(filename);
    assert.equal(after.uid, before.uid);
    assert.equal(after.gid, before.gid);
    assert.equal(after.mode & 0o777, before.mode & 0o777);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
