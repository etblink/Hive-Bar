'use strict';

const { randomBytes } = require('node:crypto');
const dotenv = require('dotenv');
const { z } = require('zod');
const { parseAsset } = require('./hive/assets');

const HIVE_ACCOUNT_PATTERN = /^(?=.{3,64}$)[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const COMMUNITY_PATTERN = /^hive-[0-9]{3,12}$/;
const PRODUCTION_REQUIRED_SETTINGS = [
  'SITE_NAME',
  'BAR_ADDRESS',
  'BAR_PHONE',
  'BAR_HOURS',
  'BAR_WEBSITE_URL',
  'BAR_MAP_URL',
  'HIVE_COMMUNITY_ID',
  'THREADS_CONTAINER_ACCOUNT',
  'HIVE_RPC_NODES',
  'HIVE_WRITE_MODE',
  'HIVE_WALL_DEFAULT_FEE',
  'HIVE_PAYMENT_MERCHANT_ACCOUNTS',
  'HIVE_PAYMENT_MAX_HBD',
  'HIVE_PAYMENT_RECEIPT_DB_PATH',
  'DISTRIATOR_ENABLED',
  'DISTRIATOR_CLAIM_URL',
  'HIVE_APP_TAG',
  'BIND_HOST',
  'APP_ORIGIN',
  'SESSION_SECRET',
];

function parseRpcNodes(value, context) {
  const nodes = value
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean);

  if (nodes.length === 0) {
    context.addIssue({ code: 'custom', message: 'At least one Hive RPC node is required' });
    return z.NEVER;
  }

  const unique = [...new Set(nodes)];
  for (const [index, node] of unique.entries()) {
    let parsed;
    try {
      parsed = new URL(node);
    } catch {
      context.addIssue({ code: 'custom', message: `Invalid Hive RPC URL at position ${index + 1}` });
      return z.NEVER;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      context.addIssue({
        code: 'custom',
        message: `Hive RPC node ${index + 1} must be a credential-free HTTPS URL`,
      });
      return z.NEVER;
    }
  }

  return unique;
}

function parseTrustProxy(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  if (normalized === 'loopback' || normalized === 'linklocal' || normalized === 'uniquelocal') {
    return normalized;
  }
  if (/^[1-9][0-9]*$/.test(normalized)) return Number.parseInt(normalized, 10);
  throw new Error('TRUST_PROXY must be false, a positive hop count, loopback, linklocal, or uniquelocal');
}

function parseAccountList(value, context) {
  const accounts = String(value || '')
    .split(',')
    .map((account) => account.trim().toLowerCase())
    .filter(Boolean);

  for (const account of accounts) {
    if (!HIVE_ACCOUNT_PATTERN.test(account)) {
      context.addIssue({ code: 'custom', message: `Invalid Hive account in allowlist: ${account}` });
      return z.NEVER;
    }
  }

  return [...new Set(accounts)];
}

function parseWallFee(value, context) {
  const raw = String(value || '').trim();
  const parsed = parseAsset(raw, 'HBD');
  if (!parsed || parsed.canonical !== raw || parsed.units <= 0n) {
    context.addIssue({
      code: 'custom',
      message: 'Must be a positive HBD amount with exactly three decimals',
    });
    return z.NEVER;
  }
  return parsed.canonical;
}

function parseBoolean(value, context) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  context.addIssue({ code: 'custom', message: 'Must be true or false' });
  return z.NEVER;
}

function parseReceiptPath(value, context) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.includes('\0') || Buffer.byteLength(normalized, 'utf8') > 1024) {
    context.addIssue({ code: 'custom', message: 'Must be an explicit SQLite file path or :memory:' });
    return z.NEVER;
  }
  return normalized;
}

function parseAppOrigin(value, context) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Must be a valid application origin' });
    return z.NEVER;
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Must be a credential-free HTTP(S) origin without a path, query, or fragment',
    });
    return z.NEVER;
  }

  return parsed.origin;
}

function requireHttpsUrl(value, context) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Must be a valid URL' });
    return z.NEVER;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    context.addIssue({ code: 'custom', message: 'Must be a credential-free HTTPS URL' });
    return z.NEVER;
  }

  return parsed.toString();
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BIND_HOST: z.enum(['127.0.0.1', '::1', '0.0.0.0', '::']).default('127.0.0.1'),
    SITE_NAME: z.string().trim().min(1).max(80).default('4th Street Bar'),
    BAR_ADDRESS: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .default('1114 E. 4th Street, Reno, NV 89512'),
    BAR_PHONE: z.string().trim().min(1).max(40).default('(775) 324-7827'),
    BAR_HOURS: z.string().trim().min(1).max(120).default('Daily, 12:00 p.m.–2:00 a.m.'),
    BAR_WEBSITE_URL: z
      .string()
      .trim()
      .default('https://4thstreetbarreno.com/')
      .transform(requireHttpsUrl),
    BAR_MAP_URL: z
      .string()
      .trim()
      .default(
        'https://www.google.com/maps/search/?api=1&query=1114%20E.%204th%20Street%2C%20Reno%2C%20NV%2089512',
      )
      .transform(requireHttpsUrl),
    HIVE_COMMUNITY_ID: z.string().trim().regex(COMMUNITY_PATTERN).default('hive-108590'),
    THREADS_CONTAINER_ACCOUNT: z
      .string()
      .trim()
      .regex(HIVE_ACCOUNT_PATTERN)
      .default('fourthst.threads'),
    HIVE_RPC_NODES: z
      .string()
      .default('https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network')
      .transform(parseRpcNodes),
    HIVE_WRITE_MODE: z.enum(['disabled', 'controlled', 'production']).default('disabled'),
    HIVE_CONTROLLED_ACCOUNTS: z.string().default('').transform(parseAccountList),
    HIVE_WALL_DEFAULT_FEE: z.string().default('1.000 HBD').transform(parseWallFee),
    HIVE_GLOBAL_WALL_EXCLUSIONS: z.string().default('').transform(parseAccountList),
    HIVE_MESSAGE_HISTORY_PAGE_SIZE: z.coerce.number().int().min(5).max(100).default(25),
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: z
      .string()
      .default('fourthstreetbar')
      .transform(parseAccountList),
    HIVE_PAYMENT_MAX_HBD: z.string().default('1.000 HBD').transform(parseWallFee),
    HIVE_PAYMENT_RECEIPT_DB_PATH: z.string().default(':memory:').transform(parseReceiptPath),
    HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(600000)
      .default(120000),
    DISTRIATOR_ENABLED: z.string().default('false').transform(parseBoolean),
    DISTRIATOR_CLAIM_URL: z
      .string()
      .trim()
      .default('https://distriator.com/#/claim')
      .transform(requireHttpsUrl),
    HIVE_APP_TAG: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9.-]{1,31}\/[0-9]+\.[0-9]+\.[0-9]+$/)
      .default('fourth-street-bar-app/0.1.0'),
    HIVE_RPC_TIMEOUT_MS: z.coerce.number().int().min(250).max(30000).default(8000),
    HIVE_RPC_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(10).default(2),
    HIVE_RPC_COOLDOWN_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
    APP_ORIGIN: z.string().trim().default('http://localhost:3000').transform(parseAppOrigin),
    SESSION_SECRET: z
      .string()
      .default('')
      .refine((value) => !value || Buffer.byteLength(value, 'utf8') >= 32, {
        message: 'Must contain at least 32 bytes',
      }),
    SESSION_TTL_MS: z.coerce.number().int().min(300000).max(86400000).default(28800000),
    AUTH_CHALLENGE_TTL_MS: z.coerce.number().int().min(30000).max(600000).default(300000),
    SOCIAL_PREFLIGHT_TTL_MS: z.coerce.number().int().min(30000).max(600000).default(300000),
    TRUST_PROXY: z.string().default('false'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.HIVE_RPC_NODES.length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['HIVE_RPC_NODES'],
        message: 'Production requires at least three distinct Hive RPC nodes',
      });
    }
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Production requires an HTTPS application origin',
      });
    }
    if (env.NODE_ENV === 'production' && Buffer.byteLength(env.SESSION_SECRET, 'utf8') < 32) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'Production requires an explicit secret of at least 32 bytes',
      });
    }
    if (env.HIVE_WRITE_MODE === 'controlled' && env.HIVE_CONTROLLED_ACCOUNTS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['HIVE_CONTROLLED_ACCOUNTS'],
        message: 'Controlled mode requires at least one explicitly allowlisted Hive account',
      });
    }
    if (
      env.NODE_ENV !== 'test' &&
      env.HIVE_WRITE_MODE === 'controlled' &&
      env.HIVE_PAYMENT_RECEIPT_DB_PATH === ':memory:'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['HIVE_PAYMENT_RECEIPT_DB_PATH'],
        message: 'Controlled mode requires an explicit durable receipt database path',
      });
    }
    if (env.HIVE_WRITE_MODE === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['HIVE_WRITE_MODE'],
        message: 'Production write mode is not authorized before the V1 release gate',
      });
    }
  });

function loadConfig(source = process.env, { loadDotenv = source === process.env } = {}) {
  if (loadDotenv) dotenv.config({ quiet: true });

  if (String(source.NODE_ENV || '').trim() === 'production') {
    const missing = PRODUCTION_REQUIRED_SETTINGS.filter(
      (name) => source[name] === undefined || String(source[name]).trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(
        `Invalid Hive-Bar configuration: production requires explicit ${missing.join(', ')}`,
      );
    }
  }

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid Hive-Bar configuration: ${details}`);
  }

  let trustProxy;
  try {
    trustProxy = parseTrustProxy(result.data.TRUST_PROXY);
  } catch (error) {
    throw new Error(`Invalid Hive-Bar configuration: TRUST_PROXY: ${error.message}`);
  }

  const config = {
    env: result.data.NODE_ENV,
    isProduction: result.data.NODE_ENV === 'production',
    server: {
      port: result.data.PORT,
      bindHost: result.data.BIND_HOST,
      trustProxy,
      rateLimit: {
        windowMs: result.data.RATE_LIMIT_WINDOW_MS,
        max: result.data.RATE_LIMIT_MAX,
      },
      authRateLimitMax: result.data.AUTH_RATE_LIMIT_MAX,
    },
    site: {
      name: result.data.SITE_NAME,
      business: {
        address: result.data.BAR_ADDRESS,
        phone: result.data.BAR_PHONE,
        hours: result.data.BAR_HOURS,
        websiteUrl: result.data.BAR_WEBSITE_URL,
        mapUrl: result.data.BAR_MAP_URL,
      },
    },
    hive: {
      communityId: result.data.HIVE_COMMUNITY_ID,
      threadsContainerAccount: result.data.THREADS_CONTAINER_ACCOUNT,
      rpcNodes: result.data.HIVE_RPC_NODES,
      rpcTimeoutMs: result.data.HIVE_RPC_TIMEOUT_MS,
      rpcFailureThreshold: result.data.HIVE_RPC_FAILURE_THRESHOLD,
      rpcCooldownMs: result.data.HIVE_RPC_COOLDOWN_MS,
      writeMode: result.data.HIVE_WRITE_MODE,
      controlledAccounts: result.data.HIVE_CONTROLLED_ACCOUNTS,
      defaultWallFee: result.data.HIVE_WALL_DEFAULT_FEE,
      globalWallExclusions: result.data.HIVE_GLOBAL_WALL_EXCLUSIONS,
      messageHistoryPageSize: result.data.HIVE_MESSAGE_HISTORY_PAGE_SIZE,
      appTag: result.data.HIVE_APP_TAG,
      writesEnabled: result.data.HIVE_WRITE_MODE === 'controlled',
    },
    payments: {
      merchantAccounts: result.data.HIVE_PAYMENT_MERCHANT_ACCOUNTS,
      maxHbd: result.data.HIVE_PAYMENT_MAX_HBD,
      receiptDbPath: result.data.HIVE_PAYMENT_RECEIPT_DB_PATH,
      confirmationTimeoutMs: result.data.HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS,
      enabled:
        result.data.HIVE_WRITE_MODE === 'controlled' &&
        result.data.HIVE_PAYMENT_MERCHANT_ACCOUNTS.length > 0,
    },
    distriator: {
      enabled: result.data.DISTRIATOR_ENABLED,
      claimUrl: result.data.DISTRIATOR_CLAIM_URL,
    },
    auth: {
      appOrigin: result.data.APP_ORIGIN,
      sessionSecret: result.data.SESSION_SECRET || randomBytes(32).toString('base64url'),
      sessionTtlMs: result.data.SESSION_TTL_MS,
      challengeTtlMs: result.data.AUTH_CHALLENGE_TTL_MS,
      preflightTtlMs: result.data.SOCIAL_PREFLIGHT_TTL_MS,
    },
    logging: {
      level: result.data.LOG_LEVEL,
    },
  };

  return deepFreeze(config);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  COMMUNITY_PATTERN,
  HIVE_ACCOUNT_PATTERN,
  PRODUCTION_REQUIRED_SETTINGS,
  parseAccountList,
  parseBoolean,
  parseReceiptPath,
  parseWallFee,
  loadConfig,
};
