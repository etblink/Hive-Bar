'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexBarOperatorPosting } = require('../src/release/bar-operator-readiness');

try {
  const config = loadConfig();
  process.stdout.write(`${JSON.stringify(assertPrivexBarOperatorPosting(config, process.env))}\n`);
} catch (error) {
  process.stderr.write(`Hive-Bar M10 operator mode refused: ${error.message}\n`);
  process.exitCode = 1;
}
