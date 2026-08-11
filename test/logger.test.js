'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Writable } = require('node:stream');
const { loadConfig } = require('../src/config');
const { createLogger } = require('../src/lib/logger');

test('structured logging redacts credentials, request bodies, cookies, and decrypted memos', () => {
  let output = '';
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const config = loadConfig(
    { NODE_ENV: 'test', HIVE_WRITE_MODE: 'disabled', LOG_LEVEL: 'info' },
    { loadDotenv: false },
  );
  const logger = createLogger(config, destination);

  logger.info(
    {
      body: { postingKey: 'body-secret' },
      credentials: {
        privateKey: 'key-secret',
        decryptedMemo: 'memo-secret',
        signature: 'signature-secret',
        csrfToken: 'csrf-secret',
      },
      req: { headers: { authorization: 'Bearer auth-secret', cookie: 'session=cookie-secret' } },
    },
    'redaction test',
  );

  assert.doesNotMatch(
    output,
    /body-secret|key-secret|memo-secret|signature-secret|csrf-secret|auth-secret|cookie-secret/,
  );
  assert.match(output, /\[REDACTED\]/);
  const record = JSON.parse(output);
  assert.equal(record.service, 'hive-bar');
  assert.equal(record.environment, 'test');
});
