'use strict';

const pino = require('pino');

const sensitiveFields = [
  'activeKey',
  'decryptedMemo',
  'masterPassword',
  'memoKey',
  'postingKey',
  'privateKey',
  'private_key',
  'seed',
];

const redactPaths = [
  'body',
  'req.body',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.body',
  'request.headers.authorization',
  'request.headers.cookie',
  ...sensitiveFields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

function createLogger(config, destination) {
  return pino(
    {
      level: config.logging.level,
      base: {
        service: 'hive-bar',
        environment: config.env,
      },
      redact: {
        paths: redactPaths,
        censor: '[REDACTED]',
      },
      serializers: {
        err(error) {
          return {
            type: error?.name,
            message: error?.message,
            code: error?.code,
          };
        },
      },
    },
    destination,
  );
}

module.exports = {
  createLogger,
};
