'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axe = require('axe-core');
const { chromium } = require('playwright');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { createFixtureApp } = require('../test/support/test-app');

const ROOT = path.join(__dirname, '..');
const OUTPUT = process.env.C2_F_VISUAL_OUTPUT || path.join(ROOT, 'artifacts', 'c2-f-visual');
const KEYS = Object.freeze({
  owner: 'STM6pbYm2TgVWgzb3FsfwkZFLNEqCZ133eM5BDMQjEfGM1S6Uqus9',
  active: 'STM8mnuYALhWKgmEgg2ehxNEh62vKhKSg9gBUTctqSTiUXr1UKoMS',
  posting: 'STM67N3WrJNTjUxk2UDnDGKE7tjZbCysYesfHW382t4o6TyTnYrnT',
  memo: 'STM6Z5YnEj9n5LnPpfhg7P2oT36nzhxy982q4xPt3FxvEtkh3Ksjr',
});

function rpc() {
  return {
    getStatus: () => [],
    async call(api, method, params) {
      if (`${api}.${method}` === 'condenser_api.get_accounts') {
        const rows = [];
        if (params[0].includes('etblink')) rows.push({
          name: 'etblink', pending_claimed_accounts: 2,
          vesting_shares: '100000.000000 VESTS', delegated_vesting_shares: '0.000000 VESTS',
          to_withdraw: '0', withdrawn: '0',
        });
        return rows;
      }
      if (`${api}.${method}` === 'condenser_api.get_dynamic_global_properties') {
        return { total_vesting_fund_hive: '1000.000 HIVE', total_vesting_shares: '2000000.000000 VESTS' };
      }
      if (`${api}.${method}` === 'condenser_api.get_vesting_delegations') return [];
      throw new Error(`Unexpected C2-F visual RPC ${api}.${method}`);
    },
  };
}

async function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function accessibility(page) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(async () => globalThis.axe.run(globalThis.document, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  }));
  return result.violations
    .filter(({ impact }) => ['critical', 'serious'].includes(impact))
    .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));
}

async function capture(page, origin, scenario) {
  const response = await page.goto(`${origin}${scenario.path}`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), scenario.status || 200);
  const violations = await accessibility(page);
  assert.deepEqual(violations, [], `${scenario.name} accessibility violations`);
  await page.screenshot({ path: path.join(OUTPUT, `${scenario.name}.png`), fullPage: true });
  return {
    name: scenario.name,
    path: scenario.path,
    viewport: page.viewportSize(),
    status: response?.status(),
    accessibility: 'PASS',
  };
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const { app } = createFixtureApp({
    configOverrides: { HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' },
    rpcPool: rpc(),
  });
  app.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  app.locals.onboardingEnvironment = {
    HIVE_ONBOARDING_ENABLED: 'true',
    HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_CASH_FEE_USD: '5.00',
    HIVE_ONBOARDING_STARTER_HP: '5.000',
    HIVE_ONBOARDING_MIN_REMAINING_HP: '10.000',
    HIVE_ONBOARDING_LOW_ACT_THRESHOLD: '3',
    HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
  };

  let server;
  let browser;
  try {
    server = await listen(app);
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const results = [];

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    results.push(await capture(desktop, origin, { name: 'customer-desktop', path: '/create-account' }));
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    results.push(await capture(mobile, origin, { name: 'customer-mobile', path: '/create-account' }));
    await mobile.close();

    const init = await browser.newPage();
    await init.goto(`${origin}/create-account`, { waitUntil: 'networkidle' });
    const service = app.locals.onboardingEnvironmentService;
    const created = await service.createRequest({
      idempotencyKey: 'c2f_visual_request_idempotency_key_00001',
      username: 'visualhiver', publicKeys: KEYS, recoveryAcknowledged: true,
    });
    const session = app.locals.services.sessionStore.create('etblink');
    await init.close();

    const staff = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await staff.context().addCookies([{
      name: 'hive_bar_session', value: session.token, url: origin, httpOnly: true, sameSite: 'Strict',
    }]);
    results.push(await capture(staff, origin, {
      name: 'staff-pending-desktop', path: `/onboarding/staff/${created.request.id}`,
    }));
    await staff.waitForFunction(() => !globalThis.document.querySelector('[data-onboarding-cash]')?.disabled);
    assert.equal(await staff.locator('[data-onboarding-cash]').isDisabled(), false);
    const readinessText = await staff.locator('[data-onboarding-readiness]').textContent();
    assert.match(readinessText || '', /retain at least 10\.000 HP/i);
    assert.match(readinessText || '', /ACT inventory is low/i);
    await staff.close();

    const evidence = {
      qualification: 'PASS',
      scenarios: results,
      secretArtifacts: 'none',
      policyEvidence: {
        minimumRemainingHp: '10.000 HP',
        lowActWarning: 'visible-below-3',
      },
    };
    fs.writeFileSync(path.join(OUTPUT, 'qualification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  process.stderr.write(`C2-F visual qualification failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
