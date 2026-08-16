'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexBetaRelease } = require('../src/release/beta-readiness');

try {
  const config = loadConfig();
  const summary = assertPrivexBetaRelease(config, process.env);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Hive-Bar beta release refused: ${error.message}\n`);
  process.exitCode = 1;
}
