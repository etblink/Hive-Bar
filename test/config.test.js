'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadConfig } = require('../src/config');

function configFrom(overrides = {}) {
  return loadConfig(
    {
      NODE_ENV: 'test',
      HIVE_WRITE_MODE: 'disabled',
      ...overrides,
    },
    { loadDotenv: false },
  );
}

test('loads the accepted identifiers, secure session settings, and write-disabled defaults', () => {
  const config = configFrom();

  assert.equal(config.hive.communityId, 'hive-108590');
  assert.equal(config.hive.officialBarAccount, 'fourthstreetbar');
  assert.equal(config.hive.threadsContainerAccount, 'fourthst.threads');
  assert.equal(config.hive.writeMode, 'disabled');
  assert.equal(config.hive.writesEnabled, false);
  assert.deepEqual(config.hive.controlledAccounts, []);
  assert.deepEqual(config.hive.controlledActions, [
    'post', 'thread', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
    'profile', 'claim-rewards', 'wall', 'inbox', 'payment',
  ]);
  assert.equal(config.hive.signerMode, 'disabled');
  assert.equal(config.hive.m12MerchantAuthor, '');
  assert.deepEqual(config.hive.m12AuthorizedSigners, []);
  assert.equal(config.hive.defaultWallFee, '1.000 HBD');
  assert.deepEqual(config.hive.globalWallExclusions, []);
  assert.equal(config.hive.messageHistoryPageSize, 25);
  assert.equal(config.hive.appTag, 'fourth-street-bar-app/0.1.0');
  assert.deepEqual(config.payments.merchantAccounts, ['fourthstreetbar']);
  assert.equal(config.payments.maxHbd, '1.000 HBD');
  assert.equal(config.payments.receiptDbPath, ':memory:');
  assert.equal(config.payments.confirmationTimeoutMs, 120000);
  assert.equal(config.payments.enabled, false);
  assert.equal(config.distriator.enabled, false);
  assert.equal(config.distriator.claimUrl, 'https://distriator.com/#/claim');
  assert.equal(config.auth.appOrigin, 'http://localhost:3000');
  assert.ok(config.auth.sessionSecret.length >= 32);
  assert.equal(config.site.business.address, '1114 E. 4th Street, Reno, NV 89512');
  assert.equal(config.site.business.phone, '(775) 324-7827');
  assert.equal(config.site.business.websiteUrl, 'https://4thstreetbarreno.com/');
  assert.equal(config.server.port, 3000);
  assert.equal(config.server.bindHost, '127.0.0.1');
  assert.equal(config.hive.rpcNodes.length, 3);
});

test('rejects a production configuration with fewer than three RPC nodes', () => {
  assert.throws(
    () =>
      configFrom({
        NODE_ENV: 'production',
        SITE_NAME: '4th Street Bar',
        BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
        BAR_PHONE: '(775) 324-7827',
        BAR_HOURS: 'Daily, noon–2:00 a.m.',
        BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
        BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
        HIVE_COMMUNITY_ID: 'hive-108590',
        HIVE_OFFICIAL_BAR_ACCOUNT: 'fourthstreetbar',
        THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
        HIVE_RPC_NODES: 'https://api.hive.blog',
        HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
        HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
        HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
        HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
        DISTRIATOR_ENABLED: 'false',
        DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
        HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
        BIND_HOST: '127.0.0.1',
        APP_ORIGIN: 'https://hive-bar.example',
        SESSION_SECRET: 'a-production-session-secret-with-32-bytes',
      }),
    /Production requires at least three distinct Hive RPC nodes/,
  );
});

test('fails closed when production settings are only implicit defaults', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }, { loadDotenv: false }),
    /production requires explicit SITE_NAME, BAR_ADDRESS, BAR_PHONE, BAR_HOURS, BAR_WEBSITE_URL, BAR_MAP_URL, HIVE_COMMUNITY_ID, THREADS_CONTAINER_ACCOUNT, HIVE_RPC_NODES, HIVE_WRITE_MODE, HIVE_WALL_DEFAULT_FEE, DISTRIATOR_ENABLED, DISTRIATOR_CLAIM_URL, HIVE_APP_TAG, BIND_HOST, APP_ORIGIN, SESSION_SECRET/,
  );
});

test('requires payment settings only for an explicitly payment-enabled controlled production mode', () => {
  const production = {
    NODE_ENV: 'production', SITE_NAME: '4th Street Bar', BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827', BAR_HOURS: 'Daily, noon–2:00 a.m.', BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno', HIVE_COMMUNITY_ID: 'hive-108590', HIVE_OFFICIAL_BAR_ACCOUNT: 'fourthstreetbar',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads', HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'controlled', HIVE_CONTROLLED_ACCOUNTS: 'fourthstreetbar', HIVE_CONTROLLED_ACTIONS: 'post',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD', DISTRIATOR_ENABLED: 'false', DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0', BIND_HOST: '127.0.0.1', APP_ORIGIN: 'https://hive-bar.example',
    SESSION_SECRET: 'a-production-session-secret-with-32-bytes',
  };
  assert.doesNotThrow(() => loadConfig(production, { loadDotenv: false }));
  assert.throws(
    () => loadConfig({ ...production, HIVE_CONTROLLED_ACTIONS: 'payment' }, { loadDotenv: false }),
    /production requires explicit HIVE_PAYMENT_MERCHANT_ACCOUNTS, HIVE_PAYMENT_MAX_HBD, HIVE_PAYMENT_RECEIPT_DB_PATH/,
  );
});

test('allows only explicitly account-scoped controlled mode and still rejects production mode', () => {
  const controlled = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink, etblink',
  });
  assert.equal(controlled.hive.writesEnabled, true);
  assert.deepEqual(controlled.hive.controlledAccounts, ['etblink']);
  assert.deepEqual(controlled.hive.controlledActions, [
    'post', 'thread', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
    'profile', 'claim-rewards', 'wall', 'inbox', 'payment',
  ]);
  assert.equal(controlled.hive.signerMode, 'disabled');

  assert.equal(
    configFrom({ HIVE_SIGNER_MODE: 'keychain' }).hive.signerMode,
    'keychain',
  );
  assert.throws(
    () => configFrom({ HIVE_SIGNER_MODE: 'browser-wallet' }),
    /Invalid option: expected one of "disabled"\|"keychain"/,
  );

  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'controlled' }),
    /Controlled mode requires at least one explicitly allowlisted Hive account/,
  );
  assert.deepEqual(
    configFrom({
      HIVE_WRITE_MODE: 'controlled',
      HIVE_CONTROLLED_ACCOUNTS: 'fourthstreetbar',
      HIVE_CONTROLLED_ACTIONS: 'post, post',
    }).hive.controlledActions,
    ['post'],
  );
  assert.throws(
    () => configFrom({
      HIVE_WRITE_MODE: 'controlled',
      HIVE_CONTROLLED_ACCOUNTS: 'fourthstreetbar',
      HIVE_CONTROLLED_ACTIONS: '',
    }),
    /Controlled mode requires at least one explicitly allowlisted action/,
  );
  assert.throws(
    () => configFrom({ HIVE_CONTROLLED_ACTIONS: 'post,transfer' }),
    /Invalid controlled action: transfer/,
  );
  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'production' }),
    /Production write mode is not authorized before the V1 release gate/,
  );
});

test('requires complete explicit M12 delegated-posting configuration', () => {
  assert.throws(
    () => configFrom({ HIVE_M12_MERCHANT_AUTHOR: 'fourthstreetbar' }),
    /M12 delegated posting requires both a merchant author and at least one explicit signer/,
  );
  const config = configFrom({
    HIVE_M12_MERCHANT_AUTHOR: 'fourthstreetbar',
    HIVE_M12_AUTHORIZED_SIGNERS: 'fartman69, fartman69',
  });
  assert.equal(config.hive.m12MerchantAuthor, 'fourthstreetbar');
  assert.deepEqual(config.hive.m12AuthorizedSigners, ['fartman69']);
});

test('validates the canonical M4 wall fee and both normalized exclusion layers', () => {
  const config = configFrom({
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot, spammer, rewardbot',
    HIVE_MESSAGE_HISTORY_PAGE_SIZE: '50',
  });
  assert.equal(config.hive.defaultWallFee, '1.000 HBD');
  assert.deepEqual(config.hive.globalWallExclusions, ['rewardbot', 'spammer']);
  assert.equal(config.hive.messageHistoryPageSize, 50);
  assert.throws(() => configFrom({ HIVE_WALL_DEFAULT_FEE: '1.00 HBD' }), /three decimals/);
  assert.throws(() => configFrom({ HIVE_WALL_DEFAULT_FEE: '0.000 HBD' }), /positive HBD/);
});

test('binds a protocol-valid versioned application tag', () => {
  assert.equal(configFrom().hive.appTag, 'fourth-street-bar-app/0.1.0');
  assert.throws(
    () => configFrom({ HIVE_APP_TAG: 'fourth-street-bar-app-v#' }),
    /Invalid Hive-Bar configuration: HIVE_APP_TAG/,
  );
});

test('binds the controlled M5 merchant, amount, receipt, timeout, and Distriator settings', () => {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar, fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: '/var/lib/hive-bar/receipts.sqlite',
    HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS: '90000',
    DISTRIATOR_ENABLED: 'true',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
  });
  assert.deepEqual(config.payments.merchantAccounts, ['fourthstreetbar']);
  assert.equal(config.payments.enabled, true);
  assert.equal(config.payments.maxHbd, '1.000 HBD');
  assert.equal(config.payments.receiptDbPath, '/var/lib/hive-bar/receipts.sqlite');
  assert.equal(config.payments.confirmationTimeoutMs, 90000);
  assert.equal(config.distriator.enabled, true);
  assert.equal(config.distriator.claimUrl, 'https://distriator.com/#/claim');
  assert.throws(() => configFrom({ HIVE_PAYMENT_MAX_HBD: '1.00 HBD' }), /three decimals/);
  assert.throws(() => configFrom({ DISTRIATOR_ENABLED: 'maybe' }), /true or false/);
  assert.throws(
    () => configFrom({ DISTRIATOR_CLAIM_URL: 'javascript:alert(1)' }),
    /credential-free HTTPS URL/,
  );
  assert.throws(
    () =>
      loadConfig(
        {
          NODE_ENV: 'development',
          HIVE_WRITE_MODE: 'controlled',
          HIVE_CONTROLLED_ACCOUNTS: 'etblink',
          HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
        },
        { loadDotenv: false },
      ),
    /Controlled mode requires an explicit durable receipt database path/,
  );
});

test('rejects insecure or credential-bearing RPC URLs', () => {
  assert.throws(
    () => configFrom({ HIVE_RPC_NODES: 'http://api.hive.blog' }),
    /credential-free HTTPS URL/,
  );
  assert.throws(
    () => configFrom({ HIVE_RPC_NODES: 'https://user:secret@example.com' }),
    /credential-free HTTPS URL/,
  );
});

test('normalizes and de-duplicates RPC nodes', () => {
  const config = configFrom({
    HIVE_RPC_NODES: ' https://api.hive.blog,https://api.hive.blog,https://api.openhive.network ',
  });

  assert.deepEqual(config.hive.rpcNodes, [
    'https://api.hive.blog',
    'https://api.openhive.network',
  ]);
  assert.equal(Object.isFrozen(config.hive.rpcNodes), true);
  assert.equal(Object.isFrozen(config.hive), true);
});
