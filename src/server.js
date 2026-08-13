'use strict';

const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { HiveRpcPool } = require('./hive/rpc-pool');
const { createLogger } = require('./lib/logger');

function startServer(options = {}) {
  const config = options.config || loadConfig();
  const logger = options.logger || createLogger(config);
  const rpcPool =
    options.rpcPool ||
    new HiveRpcPool({
      nodes: config.hive.rpcNodes,
      timeoutMs: config.hive.rpcTimeoutMs,
      failureThreshold: config.hive.rpcFailureThreshold,
      cooldownMs: config.hive.rpcCooldownMs,
      logger,
    });
  const app =
    options.app ||
    createApp({
      config,
      logger,
      rpcPool,
      now: options.now,
      paymentObserver: options.paymentObserver,
      receiptStore: options.receiptStore,
    });
  const server = app.listen(config.server.port, () => {
    logger.info(
      {
        port: config.server.port,
        communityId: config.hive.communityId,
        threadsContainerAccount: config.hive.threadsContainerAccount,
        writeMode: config.hive.writeMode,
      },
      'Hive-Bar server started',
    );
  });

  server.on('error', (error) => {
    logger.fatal({ err: error, port: config.server.port }, 'Hive-Bar server failed');
    process.exitCode = 1;
  });

  let closing = false;
  let resourcesClosed = false;
  function closeResources() {
    if (resourcesClosed) return;
    resourcesClosed = true;
    try {
      app.locals.services?.receiptStore?.close?.();
    } catch (error) {
      logger.error({ err: error }, 'Hive-Bar receipt store shutdown failed');
      process.exitCode = 1;
    }
  }
  server.once('close', closeResources);
  function shutdown(signal) {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Hive-Bar server shutting down');

    const forceTimer = setTimeout(() => {
      logger.fatal('Graceful shutdown timed out');
      process.exitCode = 1;
      server.closeAllConnections?.();
    }, 10000);
    forceTimer.unref();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logger.error({ err: error }, 'Hive-Bar shutdown failed');
        process.exitCode = 1;
      }
    });
  }

  if (options.installSignalHandlers !== false) {
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }

  return { app, config, logger, rpcPool, server, shutdown };
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    process.stderr.write(`Hive-Bar failed to start: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { startServer };
