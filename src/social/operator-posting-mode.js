'use strict';

const { FeatureUnavailableError } = require('../lib/errors');

const MAX_OPERATOR_ARM_MS = 24 * 60 * 60 * 1000;

function parseOperatorArm(armedUntil) {
  if (!armedUntil) return null;
  const value = Date.parse(armedUntil);
  return Number.isFinite(value) ? value : null;
}

function isM10OperatorMode(config) {
  return Boolean(config.hive.m10OperatorArmedUntil || config.hive.m10OperatorAuditPath);
}

function isM10OperatorArmActive(config, now = Date.now()) {
  if (!isM10OperatorMode(config)) return true;
  const armedUntil = parseOperatorArm(config.hive.m10OperatorArmedUntil);
  return Boolean(armedUntil && armedUntil > now);
}

function assertM10OperatorArmActive(config, now = Date.now()) {
  if (!isM10OperatorMode(config)) return;
  if (!isM10OperatorArmActive(config, now)) {
    throw new FeatureUnavailableError(
      'Bar operator posting is disabled because its finite arming window has expired.',
      { code: 'OPERATOR_ARM_EXPIRED' },
    );
  }
}

module.exports = {
  MAX_OPERATOR_ARM_MS,
  assertM10OperatorArmActive,
  isM10OperatorArmActive,
  isM10OperatorMode,
  parseOperatorArm,
};
