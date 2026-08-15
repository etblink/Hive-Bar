'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RELEASE_PUBLIC_HOST, normalizePublicHost } = require('./privex-readiness');
const { assertOperatorAuditWritable } = require('../social/operator-audit');
const { MAX_OPERATOR_ARM_MS, isM10OperatorMode, parseOperatorArm } = require('../social/operator-posting-mode');

function assertPrivexBarOperatorPosting(config, source = {}, now = Date.now()) {
  const issues = [];
  const host = normalizePublicHost(source.HIVE_BAR_HOST);
  const armedUntil = parseOperatorArm(config.hive.m10OperatorArmedUntil);
  if (config.env !== 'production') issues.push('NODE_ENV must be production');
  if (host !== RELEASE_PUBLIC_HOST) issues.push('HIVE_BAR_HOST must be fourthstreetbar.com');
  if (config.auth.appOrigin !== `https://${RELEASE_PUBLIC_HOST}`) issues.push('APP_ORIGIN must be the canonical HTTPS host');
  if (config.server.bindHost !== '127.0.0.1' || config.server.port !== 3000 || config.server.trustProxy !== 'loopback') issues.push('the approved loopback and proxy topology changed');
  if (config.hive.writeMode !== 'controlled') issues.push('HIVE_WRITE_MODE must be controlled');
  if (config.hive.controlledAccounts.length !== 1 || config.hive.controlledAccounts[0] !== 'fourthstreetbar') issues.push('only @fourthstreetbar may be controlled');
  if (config.hive.controlledActions.length !== 1 || config.hive.controlledActions[0] !== 'post') issues.push('only the post action may be controlled');
  if (config.hive.signerMode !== 'keychain') issues.push('HIVE_SIGNER_MODE must be keychain');
  if (config.payments.enabled || config.distriator.enabled) issues.push('payments and Distriator must remain disabled');
  if (config.hive.m9PilotControlPath) issues.push('the one-shot M9 pilot control path must be absent');
  if (!isM10OperatorMode(config) || !armedUntil) issues.push('a finite M10 arming deadline and audit path are required');
  if (armedUntil && (armedUntil <= now || armedUntil - now > MAX_OPERATOR_ARM_MS)) issues.push('the M10 arming deadline must be future and no more than 24 hours away');
  if (!isSafeAuditTarget(config.hive.m10OperatorAuditPath)) issues.push('the M10 audit target is unsafe');
  if (config.hive.rpcNodes.length < 3) issues.push('at least three Hive RPC nodes are required');
  if (issues.length > 0) throw new Error(`M10 bar operator gate failed: ${issues.join('; ')}`);
  assertOperatorAuditWritable(config);
  return Object.freeze({
    profile: 'm10-bar-operator-posting', account: 'fourthstreetbar', action: 'post', authority: 'Posting',
    signer: 'keychain', armedUntil: new Date(armedUntil).toISOString(), auditPath: config.hive.m10OperatorAuditPath,
  });
}

function isSafeAuditTarget(filename) {
  if (!path.isAbsolute(filename) || path.basename(filename) !== 'm10-operator-audit.ndjson') return false;
  try {
    const directory = path.dirname(filename);
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false;
    if (!fs.existsSync(filename)) return true;
    const fileStat = fs.lstatSync(filename);
    return fileStat.isFile() && !fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = { assertPrivexBarOperatorPosting, isSafeAuditTarget };
