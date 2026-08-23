'use strict';

const path = require('node:path');
const {
  DEFAULT_ONBOARDING_DB_PATH,
} = require('../src/onboarding/config');
const {
  ONBOARDING_SCHEMA_VERSION,
  OnboardingRequestStore,
  inspectOnboardingStore,
} = require('../src/onboarding/request-store');

function prepareOnboardingStorage(filename = DEFAULT_ONBOARDING_DB_PATH) {
  const target = String(filename || '').trim();
  if (!target || target === ':memory:' || !path.isAbsolute(target)) {
    throw new Error('Onboarding storage preparation requires an absolute durable SQLite path');
  }
  const store = new OnboardingRequestStore({ filename: target, requireExisting: true });
  store.close();
  const inspection = inspectOnboardingStore(target);
  if (inspection.schemaVersion !== ONBOARDING_SCHEMA_VERSION) {
    throw new Error('Prepared onboarding database has an unsupported schema version');
  }
  return inspection;
}

if (require.main === module) {
  try {
    const inspection = prepareOnboardingStorage(process.argv[2]);
    process.stdout.write(`${JSON.stringify(inspection)}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar onboarding storage preparation refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { prepareOnboardingStorage };
