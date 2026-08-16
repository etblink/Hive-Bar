'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexV1Release } = require('../src/release/v1-readiness');

function loadDormantV1Config(source = process.env) {
  const requestedMode = String(source.HIVE_WRITE_MODE || '').trim();
  if (requestedMode !== 'production') {
    throw new Error('HIVE_WRITE_MODE must be production');
  }

  const parsed = loadConfig(
    { ...source, HIVE_WRITE_MODE: 'beta' },
    { loadDotenv: false },
  );

  return Object.freeze({
    ...parsed,
    hive: Object.freeze({
      ...parsed.hive,
      writeMode: 'production',
      betaSelfSigningEnabled: false,
    }),
  });
}

if (require.main === module) {
  try {
    const config = loadDormantV1Config(process.env);
    const summary = assertPrivexV1Release(config, process.env);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar V1 release refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadDormantV1Config };
