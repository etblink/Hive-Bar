'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadConfig } = require('../src/config');
const { assertPrivexControlledPostingPilot } = require('../src/release/controlled-pilot-readiness');
const { recordPilotTerminal } = require('../src/social/pilot-terminal-marker');

const secret = 'm9-controlled-pilot-session-secret-with-32-bytes';

function source(directory, overrides = {}) {
  return {
    NODE_ENV: 'production', PORT: '3000', BIND_HOST: '127.0.0.1', HIVE_BAR_HOST: 'fourthstreetbar.com',
    SITE_NAME: '4th Street Bar', BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512', BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.', BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno', HIVE_COMMUNITY_ID: 'hive-108590',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads', HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'controlled', HIVE_CONTROLLED_ACCOUNTS: 'fourthstreetbar', HIVE_CONTROLLED_ACTIONS: 'post', HIVE_SIGNER_MODE: 'keychain',
    HIVE_M9_PILOT_CONTROL_PATH: directory, HIVE_WALL_DEFAULT_FEE: '1.000 HBD', HIVE_PAYMENT_MERCHANT_ACCOUNTS: '',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD', HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:', DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim', HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: 'https://fourthstreetbar.com', SESSION_SECRET: secret, TRUST_PROXY: 'loopback', LOG_LEVEL: 'info', ...overrides,
  };
}

test('M9 pilot gate admits only the exact temporary posting configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm9-pilot-'));
  try {
    const env = source(directory);
    const config = loadConfig(env, { loadDotenv: false });
    assert.deepEqual(assertPrivexControlledPostingPilot(config, env), {
      profile: 'm9-controlled-posting-pilot', account: 'fourthstreetbar', action: 'post', authority: 'Posting', signer: 'keychain',
    });
    const wrongAction = source(directory, { HIVE_CONTROLLED_ACTIONS: 'post,follow' });
    assert.throws(() => assertPrivexControlledPostingPilot(loadConfig(wrongAction, { loadDotenv: false }), wrongAction), /only the post action/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('M9 post-only production pilot requires no payment merchant configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm9-post-only-'));
  try {
    const config = loadConfig(source(directory), { loadDotenv: false });
    assert.equal(config.payments.enabled, false);
    assert.deepEqual(config.payments.merchantAccounts, []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('M9 terminal marker records only the exact pilot post outcome', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm9-marker-'));
  try {
    const config = loadConfig(source(directory), { loadDotenv: false });
    recordPilotTerminal(config, { account: 'fourthstreetbar', action: 'post', fingerprint: 'a'.repeat(64), transactionId: 'b'.repeat(40) }, 'observed');
    const record = JSON.parse(fs.readFileSync(path.join(directory, 'terminal.json'), 'utf8'));
    assert.equal(record.outcome, 'observed');
    assert.equal(record.transactionId, 'b'.repeat(40));
    recordPilotTerminal(config, { account: 'fourthstreetbar', action: 'follow', fingerprint: 'x' }, 'cancelled');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'terminal.json'), 'utf8')).outcome, 'observed');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
