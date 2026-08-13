'use strict';

const { loadConfig } = require('../src/config');
const { assertReadOnlyRelease } = require('../src/release/read-only-readiness');

try {
  const config = loadConfig();
  const summary = assertReadOnlyRelease(config, process.env);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
