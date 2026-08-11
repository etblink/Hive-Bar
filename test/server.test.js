'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { loadConfig } = require('../src/config');
const { startServer } = require('../src/server');

const logger = {
  child() {
    return this;
  },
  error() {},
  fatal() {},
  info() {},
  warn() {},
};

test('starts on a real TCP socket in production mode and shuts down cleanly', async () => {
  const validated = loadConfig(
    {
      NODE_ENV: 'production',
      PORT: '3000',
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
      APP_ORIGIN: 'https://hive-bar.example',
      SESSION_SECRET: 'a-production-session-secret-with-32-bytes',
      LOG_LEVEL: 'silent',
    },
    { loadDotenv: false },
  );
  const config = {
    ...validated,
    server: { ...validated.server, port: 0 },
  };
  const rpcPool = { call: async () => ({ head_block_number: 123 }), getStatus: () => [] };
  const running = startServer({ config, logger, rpcPool, installSignalHandlers: false });
  await once(running.server, 'listening');

  try {
    const address = running.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'hive-bar',
      environment: 'production',
      writeMode: 'disabled',
    });
  } finally {
    const closed = once(running.server, 'close');
    running.shutdown('test');
    await closed;
  }

  assert.equal(running.server.listening, false);
});
