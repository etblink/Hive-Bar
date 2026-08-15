'use strict';

const { loadConfig } = require('../src/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');
const { assertPrivexControlledPostingPilot } = require('../src/release/controlled-pilot-readiness');
const { assertPrivexBarOperatorPosting } = require('../src/release/bar-operator-readiness');
const { assertPrivexControlledPayment } = require('../src/release/payment-readiness');
const { startServer } = require('../src/server');

try {
  const config = loadConfig();
  let summary;
  if (config.hive.writeMode !== 'controlled') {
    summary = assertPrivexReadOnlyRelease(config, process.env);
  } else if (
    config.hive.controlledActions.length === 1 &&
    config.hive.controlledActions[0] === 'payment'
  ) {
    summary = assertPrivexControlledPayment(config, process.env);
  } else if (config.hive.m10OperatorArmedUntil || config.hive.m10OperatorAuditPath) {
    summary = assertPrivexBarOperatorPosting(config, process.env);
  } else {
    summary = assertPrivexControlledPostingPilot(config, process.env);
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  startServer({ config });
} catch (error) {
  process.stderr.write(`Hive-Bar Privex startup refused: ${error.message}\n`);
  process.exitCode = 1;
}
