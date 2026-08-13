'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');
const { startServer } = require('../src/server');

try {
  const config = loadConfig();
  const summary = assertPrivexReadOnlyRelease(config, process.env);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  startServer({ config });
} catch (error) {
  process.stderr.write(`Hive-Bar Privex startup refused: ${error.message}\n`);
  process.exitCode = 1;
}
