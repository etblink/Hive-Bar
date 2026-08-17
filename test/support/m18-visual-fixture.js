'use strict';

const path = require('node:path');
const express = require('express');
const { SessionStore } = require('../../src/auth/session-store');
const { createApp } = require('../../src/app');
const { createStaticAssetUrl } = require('../../src/release/static-assets');
const { configFrom, logger } = require('./test-app');

const FIXTURE_ACCOUNT = 'etblink';
const FIXTURE_NOW_MS = Date.parse('2026-08-17T12:00:00Z');
const FIXTURE_SESSION_SECRET = 'm18-visual-fixture-session-secret-32-bytes-minimum';
const VISUAL_WIDTHS = Object.freeze([360, 390, 768, 1024, 1440, 1600]);
const VISUAL_HEIGHT = 900;

const FIXTURE_PROFILE = Object.freeze({
  name: FIXTURE_ACCOUNT,
  displayName: 'Evan',
  about: 'Building the 4th Street Bar community.',
  profileImage: '/images/fourth-street-bar-logo.jpg',
  followerCount: 42,
  followingCount: 17,
  postCount: 123,
  reputation: '68.4',
});

function deterministicSessionRandom() {
  const values = ['m18-visual-session-id', 'm18-visual-csrf-token'];
  return () => {
    const value = values.shift();
    if (!value) throw new Error('The M18 visual fixture requested unexpected session randomness');
    return value;
  };
}

function createFailClosedRpc() {
  const calls = [];
  return {
    calls,
    getStatus: () => [],
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      throw new Error(`M18 visual fixture forbids Hive RPC: ${api}.${method}`);
    },
  };
}

function createVisualReadService() {
  const calls = [];
  const unexpectedCalls = [];
  const allowed = {
    async getProfile(account) {
      calls.push({ method: 'getProfile', account });
      if (account !== FIXTURE_ACCOUNT) {
        throw new Error(`M18 visual fixture has no profile for @${account}`);
      }
      return structuredClone(FIXTURE_PROFILE);
    },
    async getAccountPosts(options) {
      calls.push({ method: 'getAccountPosts', options: structuredClone(options) });
      if (options.account !== FIXTURE_ACCOUNT || options.cursor !== undefined) {
        throw new Error('M18 visual fixture received an unexpected profile-post query');
      }
      return {
        items: [],
        profiles: { [FIXTURE_ACCOUNT]: structuredClone(FIXTURE_PROFILE) },
        nextCursor: null,
      };
    },
  };

  return new Proxy(allowed, {
    get(target, property, receiver) {
      if (property === 'calls') return calls;
      if (property === 'unexpectedCalls') return unexpectedCalls;
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (typeof property !== 'string') return Reflect.get(target, property, receiver);
      return async (...args) => {
        unexpectedCalls.push({ method: property, args: structuredClone(args) });
        throw new Error(`M18 visual fixture forbids unexpected read: ${property}`);
      };
    },
  });
}

function createM18VisualFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    HIVE_SIGNER_MODE: 'disabled',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: FIXTURE_SESSION_SECRET,
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
    now: () => FIXTURE_NOW_MS,
    random: deterministicSessionRandom(),
  });
  const { session, token } = sessionStore.create(FIXTURE_ACCOUNT);
  const rpcPool = createFailClosedRpc();
  const hiveReadService = createVisualReadService();
  const application = createApp({
    config,
    logger,
    now: () => FIXTURE_NOW_MS,
    rpcPool,
    hiveReadService,
    sessionStore,
  });
  application.locals.assetUrl = createStaticAssetUrl(path.join(__dirname, '..', '..', 'public'));
  application.locals.currentYear = new Date(FIXTURE_NOW_MS).getUTCFullYear();

  const mutationAttempts = [];
  const guardedApp = express();
  guardedApp.disable('x-powered-by');
  guardedApp.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({
      error: {
        code: 'M18_VISUAL_MUTATION_FORBIDDEN',
        message: 'The M18 visual fixture is presentation-only.',
      },
    });
  });
  guardedApp.use(application);

  return {
    app: guardedApp,
    config,
    hiveReadService,
    mutationAttempts,
    rpcPool,
    session,
    token,
  };
}

module.exports = {
  FIXTURE_ACCOUNT,
  FIXTURE_NOW_MS,
  VISUAL_HEIGHT,
  VISUAL_WIDTHS,
  createM18VisualFixture,
};
