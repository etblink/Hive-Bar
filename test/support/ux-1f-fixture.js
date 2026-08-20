'use strict';

const path = require('node:path');
const express = require('express');
const { createApp } = require('../../src/app');
const { createStaticAssetUrl } = require('../../src/release/static-assets');
const { configFrom, logger } = require('./test-app');

const ROOT = path.join(__dirname, '..', '..');
const UX1F_STATUSES = Object.freeze(['ready', 'empty', 'unavailable']);
const UX1F_UPDATES = Object.freeze([
  {
    author: 'fourthstreetbar',
    permlink: 'patio-lights-at-sunset',
    title: 'Patio lights at sunset',
    excerpt: 'A quick look at the patio as the evening settles over East 4th Street.',
  },
  {
    author: 'fourthstreetbar',
    permlink: 'from-behind-the-bar',
    title: 'From behind the bar',
    excerpt: 'A short update from the people keeping the conversation moving tonight.',
  },
  {
    author: 'fourthstreetbar',
    permlink: 'join-the-community-conversation',
    title: 'Join the community conversation',
    excerpt: 'See what friends of 4th Street Bar are posting and talking about online.',
  },
]);

function createUx1fVisualFixture(status = 'ready') {
  if (!UX1F_STATUSES.includes(status)) throw new TypeError(`Unsupported UX-1F status: ${status}`);

  const config = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    HIVE_SIGNER_MODE: 'disabled',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: 'ux-1f-home-visual-session-secret-at-least-32-bytes',
  });
  const readCalls = [];
  const unexpectedReadCalls = [];
  const hiveReadService = new Proxy({
    async getOfficialCommunityPosts(options) {
      readCalls.push({ method: 'getOfficialCommunityPosts', options: structuredClone(options) });
      if (status === 'unavailable') throw new Error('UX-1F deterministic update outage');
      return status === 'ready' ? structuredClone(UX1F_UPDATES) : [];
    },
  }, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (typeof property !== 'string') return Reflect.get(target, property, receiver);
      return async (...args) => {
        unexpectedReadCalls.push({ method: property, args: structuredClone(args) });
        throw new Error(`UX-1F visual fixture forbids unexpected read: ${property}`);
      };
    },
  });
  const rpcPool = {
    calls: [],
    getStatus: () => [],
    async call(api, method, params) {
      this.calls.push({ api, method, params: structuredClone(params) });
      throw new Error(`UX-1F visual fixture forbids Hive RPC: ${api}.${method}`);
    },
  };
  const application = createApp({ config, logger, rpcPool, hiveReadService });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  application.locals.currentYear = 2026;

  const mutationAttempts = [];
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({
      error: {
        code: 'UX_1F_VISUAL_MUTATION_FORBIDDEN',
        message: 'The UX-1F visual fixture is presentation-only.',
      },
    });
  });
  app.use(application);

  return {
    app,
    config,
    hiveReadService,
    mutationAttempts,
    readCalls,
    rpcPool,
    status,
    unexpectedReadCalls,
  };
}

module.exports = {
  UX1F_STATUSES,
  UX1F_UPDATES,
  createUx1fVisualFixture,
};
