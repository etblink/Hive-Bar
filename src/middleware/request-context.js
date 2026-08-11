'use strict';

const { randomUUID } = require('node:crypto');

function requestContext(logger) {
  return function attachRequestContext(req, res, next) {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();

    req.id = requestId;
    req.log = logger.child({ requestId });
    res.setHeader('X-Request-Id', requestId);

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      req.log.info(
        {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
        },
        'request completed',
      );
    });

    next();
  };
}

module.exports = { requestContext };
