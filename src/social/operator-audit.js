'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { FeatureUnavailableError } = require('../lib/errors');
const { isM10OperatorMode } = require('./operator-posting-mode');

function openAuditDescriptor(config) {
  const filename = config.hive.m10OperatorAuditPath;
  const directory = path.dirname(filename);
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('M10 operator audit directory is unsafe');
  }
  if (fs.existsSync(filename)) {
    const fileStat = fs.lstatSync(filename);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('M10 operator audit file is unsafe');
  }
  return fs.openSync(
    filename,
    fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
    0o600,
  );
}

function auditUnavailable(cause) {
  return new FeatureUnavailableError(
    'Operator audit storage is unavailable. No Hive signing request was prepared.',
    { code: 'OPERATOR_AUDIT_UNAVAILABLE', cause },
  );
}

function assertOperatorAuditWritable(config) {
  if (!isM10OperatorMode(config)) return;
  let descriptor;
  try {
    descriptor = openAuditDescriptor(config);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('M10 operator audit target is not a regular file');
  } catch (error) {
    throw auditUnavailable(error);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function appendOperatorAudit(config, event, preflight) {
  if (!isM10OperatorMode(config)) return;
  const record = {
    event,
    recordedAt: new Date().toISOString(),
    account: preflight.account,
    author: preflight.account,
    signer: preflight.signer || preflight.account,
    action: preflight.action,
    authority: preflight.authority,
    fingerprint: preflight.fingerprint,
    transactionId: preflight.transactionId || null,
  };
  let descriptor;
  try {
    descriptor = openAuditDescriptor(config);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('M10 operator audit target is not a regular file');
    fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    throw auditUnavailable(error);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

module.exports = { appendOperatorAudit, assertOperatorAuditWritable };
