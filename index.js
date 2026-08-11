'use strict';

const { createApp } = require('./src/app');
const { startServer } = require('./src/server');

if (require.main === module) startServer();

module.exports = { createApp, startServer };
