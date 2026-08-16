'use strict';

const { version: PACKAGE_VERSION } = require('../../package.json');

const RELEASE_APP_TAG = `fourth-street-bar-app/${PACKAGE_VERSION}`;

module.exports = {
  PACKAGE_VERSION,
  RELEASE_APP_TAG,
};
