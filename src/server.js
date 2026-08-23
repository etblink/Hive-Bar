'use strict';

const path = require('node:path');
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { applyReadConsistencyHardening } = require('./hive/read-consistency');
const { HiveRpcPool } = require('./hive/rpc-pool');
const { createLogger } = require('./lib/logger');
const { readDeploymentIdentity } = require('./release/deployment-identity');
const { createStaticAssetUrl } = require('./release/static-assets');

function isInstalledPrivexRelease(rootDir) {
  const normalized = path.posix.normalize(String(rootDir).replace(/\\/g, '/'));
  return normalized === '/opt/hive-bar/current' || normalized.startsWith('/opt/hive-bar/releases/');
}

function startServer(options = {}) {
  const config = options.config || loadConfig();
  const logger = options.logger || createLogger(config);
  const releaseRoot = options.releaseRoot || path.join(__dirname, '..');
  const deploymentIdentity =
    options.deploymentIdentity ||
    readDeploymentIdentity({
      rootDir: releaseRoot,
      strict: config.isProduction && isInstalledPrivexRelease(releaseRoot),
    });
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
      deploymentIdentity,
      now: options.now,
      paymentObserver: options.paymentObserver,
      receiptStore: options.receiptStore,
      moderationStore: options.moderationStore,
      moderationService: options.moderationService,
      onboardingConfig: options.onboardingConfig,
      onboardingEnvironment: options.onboardingEnvironment,
      onboardingStore: options.onboardingStore,
      onboardingService: options.onboardingService,
    });
  if (app.locals?.services?.hiveReads) {
    applyReadConsistencyHardening(app.locals.services.hiveReads);
  }
  app.locals.assetUrl = createStaticAssetUrl(path.join(__dirname, '..', 'public'));
  const server = app.listen(config.server.port, config.server.bindHost, () => {
    logger.info(
      {
        port: config.server.port,
        bindHost: config.server.bindHost,
        communityId: config.hive.communityId,
        threadsContainerAccount: config.hive.threadsContainerAccount,
        writeMode: config.hive.writeMode,
        moderationEnabled: config.moderation.enabled,
        onboardingEnabled: app.locals.onboardingConfig?.enabled === true,
        onboardingAvailable: app.locals.services?.onboardingService?.publicConfig?.().available === true,
        build: deploymentIdentity.build,
        commit: deploymentIdentity.commit,
        tree: deploymentIdentity.tree,
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
    for (const [name, resource] of [
      ['receipt', app.locals.services?.receiptStore],
      ['moderation', app.locals.services?.moderationStore],
      ['onboarding', app.locals.services?.onboardingStore],
    ]) {
      try {
        resource?.close?.();
      } catch (error) {
        logger.error({ err: error }, `Hive-Bar ${name} store shutdown failed`);
        process.exitCode = 1;
      }
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

  return { app, config, deploymentIdentity, logger, rpcPool, server, shutdown };
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    process.stderr.write(`Hive-Bar failed to start: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { isInstalledPrivexRelease, startServer };
