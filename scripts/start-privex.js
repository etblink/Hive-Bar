'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');
const { assertPrivexControlledPostingPilot } = require('../src/release/controlled-pilot-readiness');
const { assertPrivexBarOperatorPosting } = require('../src/release/bar-operator-readiness');
const { startServer } = require('../src/server');

try {
  const config = loadConfig();
  const summary = config.hive.writeMode !== 'controlled'
    ? assertPrivexReadOnlyRelease(config, process.env)
    : config.hive.m10OperatorArmedUntil || config.hive.m10OperatorAuditPath
      ? assertPrivexBarOperatorPosting(config, process.env)
      : assertPrivexControlledPostingPilot(config, process.env);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  startServer({ config });
} catch (error) {
  process.stderr.write(`Hive-Bar Privex startup refused: ${error.message}\n`);
  process.exitCode = 1;
}
