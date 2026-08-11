'use strict';

const express = require('express');

function createHealthRouter({ config, rpcPool }) {
  const router = express.Router();

  router.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'ok',
      service: 'hive-bar',
      environment: config.env,
      writeMode: config.hive.writeMode,
    });
  });

  router.get('/readyz', async (_req, res) => {
    try {
      await rpcPool.call('condenser_api', 'get_dynamic_global_properties', [], { timeoutMs: 3000 });
      res.set('Cache-Control', 'no-store').json({ status: 'ready' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ status: 'not_ready' });
    }
  });

  return router;
}

module.exports = { createHealthRouter };
