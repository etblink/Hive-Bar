'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexV1Release } = require('../src/release/v1-readiness');

function loadV1Config(source = process.env) {
  const requestedMode = String(source.HIVE_WRITE_MODE || '').trim();
  if (requestedMode !== 'production') {
    throw new Error('HIVE_WRITE_MODE must be production');
  }

  return loadConfig(source, {
    loadDotenv: source === process.env,
    allowV1Production: true,
  });
}

const loadDormantV1Config = loadV1Config;

if (require.main === module) {
  try {
    const config = loadV1Config(process.env);
    const summary = assertPrivexV1Release(config, process.env);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar V1 release refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadDormantV1Config, loadV1Config };
