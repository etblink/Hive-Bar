'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexControlledPostingPilot } = require('../src/release/controlled-pilot-readiness');

try {
  const config = loadConfig();
  process.stdout.write(`${JSON.stringify(assertPrivexControlledPostingPilot(config, process.env))}\n`);
} catch (error) {
  process.stderr.write(`Hive-Bar M9 pilot refused: ${error.message}\n`);
  process.exitCode = 1;
}
