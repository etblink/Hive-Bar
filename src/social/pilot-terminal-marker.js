'use strict';

const fs = require('node:fs');
const path = require('node:path');

function recordPilotTerminal(config, preflight, outcome) {
  const directory = config.hive.m9PilotControlPath;
  if (!directory) return;
  if (preflight.account !== 'fourthstreetbar' || preflight.action !== 'post') return;
  const target = path.join(directory, 'terminal.json');
  const temporary = path.join(directory, `.terminal.${process.pid}.json`);
  const record = {
    outcome,
    account: preflight.account,
    action: preflight.action,
    fingerprint: preflight.fingerprint,
    transactionId: preflight.transactionId || null,
    recordedAt: new Date().toISOString(),
  };
  fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
}

module.exports = { recordPilotTerminal };
