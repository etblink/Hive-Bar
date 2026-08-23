'use strict';

const { loadConfig } = require('../src/config');
const { parseOnboardingConfig } = require('../src/onboarding/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');
const { assertPrivexBetaRelease } = require('../src/release/beta-readiness');
const { assertPrivexV1Release } = require('../src/release/v1-readiness');
const { assertPrivexControlledPostingPilot } = require('../src/release/controlled-pilot-readiness');
const { assertPrivexBarOperatorPosting } = require('../src/release/bar-operator-readiness');
const { assertPrivexControlledPayment } = require('../src/release/payment-readiness');
const { startServer } = require('../src/server');

function qualifyPrivexRuntime(config, source = process.env) {
  const onboarding = parseOnboardingConfig(source, config.hive);
  if (onboarding.enabled && !onboarding.active) {
    throw new Error('Enabled onboarding requires the beta + keychain runtime profile');
  }
  if (config.hive.writeMode === 'disabled') {
    return assertPrivexReadOnlyRelease(config, source);
  }
  if (config.hive.writeMode === 'beta') {
    return assertPrivexBetaRelease(config, source);
  }
  if (config.hive.writeMode === 'production') {
    return assertPrivexV1Release(config, source);
  }
  if (config.hive.writeMode !== 'controlled') {
    throw new Error(`Unsupported Hive write mode: ${config.hive.writeMode}`);
  }
  if (
    config.hive.controlledActions.length === 1 &&
    config.hive.controlledActions[0] === 'payment'
  ) {
    return assertPrivexControlledPayment(config, source);
  }
  if (config.hive.m10OperatorArmedUntil || config.hive.m10OperatorAuditPath) {
    return assertPrivexBarOperatorPosting(config, source);
  }
  return assertPrivexControlledPostingPilot(config, source);
}

try {
  if (require.main === module) {
    const requestedMode = String(process.env.HIVE_WRITE_MODE || '').trim();
    const config = loadConfig(process.env, {
      allowV1Production: requestedMode === 'production',
    });
    const summary = qualifyPrivexRuntime(config, process.env);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    startServer({ config, onboardingEnvironment: process.env });
  }
} catch (error) {
  process.stderr.write(`Hive-Bar Privex startup refused: ${error.message}\n`);
  process.exitCode = 1;
}

module.exports = { qualifyPrivexRuntime };
