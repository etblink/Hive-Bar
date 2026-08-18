'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { createFixtureApp } = require('../test/support/test-app');

const ROOT = path.join(__dirname, '..');
const USERNAME = 'browserqual';
const MASTER_PASSWORD = 'P5Kbrowser-qualification-master';
const EXPECTED_PUBLIC_KEYS = Object.freeze({
  owner: 'STM6pbYm2TgVWgzb3FsfwkZFLNEqCZ133eM5BDMQjEfGM1S6Uqus9',
  active: 'STM8mnuYALhWKgmEgg2ehxNEh62vKhKSg9gBUTctqSTiUXr1UKoMS',
  posting: 'STM67N3WrJNTjUxk2UDnDGKE7tjZbCysYesfHW382t4o6TyTnYrnT',
  memo: 'STM6Z5YnEj9n5LnPpfhg7P2oT36nzhxy982q4xPt3FxvEtkh3Ksjr',
});

async function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  const rpcCalls = [];
  const rpcPool = {
    async call(api, method, params) {
      rpcCalls.push({ api, method, params });
      if (`${api}.${method}` === 'condenser_api.get_accounts') return [];
      throw new Error(`Unexpected browser-qualification RPC ${api}.${method}`);
    },
  };
  const { app } = createFixtureApp({
    configOverrides: {
      HIVE_WRITE_MODE: 'beta',
      HIVE_SIGNER_MODE: 'keychain',
    },
    rpcPool,
  });
  app.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  app.locals.onboardingEnvironment = {
    HIVE_ONBOARDING_ENABLED: 'true',
    HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_STARTER_HP: '5.000',
    HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
  };

  let server;
  let browser;
  try {
    server = await listen(app);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || null });
    });

    await page.addInitScript(() => {
      const nativeBtoa = globalThis.btoa.bind(globalThis);
      const nativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.btoa = (value) =>
        value.length === 32 ? 'browser-qualification-master' : nativeBtoa(value);
      globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = String(init.method || 'GET').toUpperCase();
        if (url === '/api/onboarding/requests' && method === 'POST') {
          globalThis.__m1931OnboardingPayload = JSON.parse(init.body);
          return new Response(
            JSON.stringify({
              request: { id: 'browser-qualification-request', username: 'browserqual' },
              staffUrl: 'https://fourthstreetbar.com/onboarding/staff/browser-qualification-request',
              statusUrl: '/api/onboarding/requests/browser-qualification-request',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url === '/api/onboarding/requests/browser-qualification-request') {
          return new Response(
            JSON.stringify({ request: { status: 'pending', username: 'browserqual' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return nativeFetch(input, init);
      };
    });

    const response = await page.goto(`${origin}/create-account`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator('[data-onboarding-customer]').count(), 1);

    const csp = response?.headers()['content-security-policy'] || '';
    assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);

    await page.locator('[data-onboarding-username]').fill(USERNAME);
    await page.locator('[data-onboarding-check]').click();
    await page.locator('[data-onboarding-recovery]').waitFor({ state: 'visible' });

    const recovery = await page.locator('[data-onboarding-recovery-text]').textContent();
    assert.ok(recovery);
    assert.match(recovery, new RegExp(`Hive username: @${USERNAME}`));
    assert.match(recovery, new RegExp(`Master password: ${MASTER_PASSWORD}`));
    for (const label of ['Owner', 'Active', 'Posting', 'Memo']) {
      assert.match(recovery, new RegExp(`${label} private key: 5[1-9A-HJ-NP-Za-km-z]{49,51}`));
    }

    await page.locator('[data-onboarding-saved]').check();
    await page.locator('[data-onboarding-create-qr]').click();
    await page.locator('[data-onboarding-qr-panel]').waitFor({ state: 'visible' });

    const payload = await page.evaluate(() => globalThis.__m1931OnboardingPayload || null);
    assert.deepEqual(payload, {
      username: USERNAME,
      recoveryAcknowledged: true,
      publicKeys: EXPECTED_PUBLIC_KEYS,
    });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(requestFailures, []);
    assert.deepEqual(rpcCalls, [
      { api: 'condenser_api', method: 'get_accounts', params: [[USERNAME]] },
    ]);

    const evidence = {
      qualification: 'PASS',
      username: USERNAME,
      masterPasswordFixture: MASTER_PASSWORD,
      publicKeys: EXPECTED_PUBLIC_KEYS,
      consoleErrors,
      pageErrors,
      requestFailures,
      rpcCalls,
    };
    const output = process.env.M18_VISUAL_OUTPUT;
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(
        path.join(output, 'm19-3-1-browser-module-qualification.json'),
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8',
      );
    }
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close();
    await close(server);
  }
}

main().catch((error) => {
  process.stderr.write(`M19.3.1 browser-module qualification failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
