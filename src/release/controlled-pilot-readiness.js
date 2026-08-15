'use strict';

const fs = require('node:fs');
const { RELEASE_PUBLIC_HOST, normalizePublicHost } = require('./privex-readiness');

function assertPrivexControlledPostingPilot(config, source = {}) {
  const issues = [];
  const host = normalizePublicHost(source.HIVE_BAR_HOST);
  if (config.env !== 'production') issues.push('NODE_ENV must be production');
  if (host !== RELEASE_PUBLIC_HOST) issues.push('HIVE_BAR_HOST must be fourthstreetbar.com');
  if (config.auth.appOrigin !== `https://${RELEASE_PUBLIC_HOST}`) issues.push('APP_ORIGIN must be the canonical HTTPS host');
  if (config.server.bindHost !== '127.0.0.1' || config.server.port !== 3000 || config.server.trustProxy !== 'loopback') issues.push('the approved loopback and proxy topology changed');
  if (config.hive.writeMode !== 'controlled') issues.push('HIVE_WRITE_MODE must be controlled');
  if (config.hive.controlledAccounts.length !== 1 || config.hive.controlledAccounts[0] !== 'fourthstreetbar') issues.push('only @fourthstreetbar may be controlled');
  if (config.hive.controlledActions.length !== 1 || config.hive.controlledActions[0] !== 'post') issues.push('only the post action may be controlled');
  if (config.hive.signerMode !== 'keychain') issues.push('HIVE_SIGNER_MODE must be keychain');
  if (config.payments.enabled || config.distriator.enabled) issues.push('payments and Distriator must remain disabled');
  if (!config.hive.m9PilotControlPath || !pathIsSafeDirectory(config.hive.m9PilotControlPath)) issues.push('the pilot terminal-control directory is invalid');
  if (config.hive.rpcNodes.length < 3) issues.push('at least three Hive RPC nodes are required');
  if (issues.length > 0) throw new Error(`M9 controlled pilot gate failed: ${issues.join('; ')}`);
  return Object.freeze({ profile: 'm9-controlled-posting-pilot', account: 'fourthstreetbar', action: 'post', authority: 'Posting', signer: 'keychain' });
}

function pathIsSafeDirectory(directory) {
  try {
    const stat = fs.statSync(directory);
    return stat.isDirectory() && !fs.lstatSync(directory).isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = { assertPrivexControlledPostingPilot };
