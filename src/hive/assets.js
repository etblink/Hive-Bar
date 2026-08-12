'use strict';

const ASSET_SPECS = Object.freeze({
  HBD: Object.freeze({ precision: 3, nai: '@@000000013' }),
  HIVE: Object.freeze({ precision: 3, nai: '@@000000021' }),
  VESTS: Object.freeze({ precision: 6, nai: '@@000000037' }),
});

const NAI_SYMBOLS = Object.freeze(
  Object.fromEntries(Object.entries(ASSET_SPECS).map(([symbol, spec]) => [spec.nai, symbol])),
);

function canonicalFromUnits(units, precision, symbol) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const divisor = 10n ** BigInt(precision);
  const whole = absolute / divisor;
  const fraction = String(absolute % divisor).padStart(precision, '0');
  return `${negative ? '-' : ''}${whole}.${fraction} ${symbol}`;
}

function parseStringAsset(value) {
  const match = /^(0|[1-9][0-9]*)\.([0-9]+) (HIVE|HBD|VESTS)$/.exec(String(value || ''));
  if (!match) return null;
  const [, whole, fraction, symbol] = match;
  const spec = ASSET_SPECS[symbol];
  if (!spec || fraction.length !== spec.precision) return null;
  return {
    units: BigInt(`${whole}${fraction}`),
    precision: spec.precision,
    symbol,
    canonical: `${whole}.${fraction} ${symbol}`,
  };
}

function parseObjectAsset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const symbol = NAI_SYMBOLS[value.nai];
  const spec = symbol ? ASSET_SPECS[symbol] : null;
  if (
    !spec ||
    value.precision !== spec.precision ||
    !/^(0|[1-9][0-9]*)$/.test(String(value.amount ?? ''))
  ) {
    return null;
  }
  const units = BigInt(String(value.amount));
  return {
    units,
    precision: spec.precision,
    symbol,
    canonical: canonicalFromUnits(units, spec.precision, symbol),
  };
}

function parseAsset(value, expectedSymbol) {
  const parsed = typeof value === 'string' ? parseStringAsset(value) : parseObjectAsset(value);
  if (!parsed || (expectedSymbol && parsed.symbol !== expectedSymbol)) return null;
  return parsed;
}

function requireCanonicalAsset(value, expectedSymbol, label = expectedSymbol) {
  const parsed = parseAsset(value, expectedSymbol);
  if (!parsed) {
    throw new TypeError(`${label} must be a canonical ${expectedSymbol} asset`);
  }
  return parsed;
}

module.exports = {
  ASSET_SPECS,
  canonicalFromUnits,
  parseAsset,
  requireCanonicalAsset,
};
