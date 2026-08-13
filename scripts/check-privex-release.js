'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');

try {
  const config = loadConfig();
  const summary = assertPrivexReadOnlyRelease(config, process.env);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Hive-Bar Privex release refused: ${error.message}\n`);
  process.exitCode = 1;
}
