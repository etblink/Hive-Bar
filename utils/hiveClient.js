const { Client } = require('@hiveio/dhive');

const hiveClient = new Client('https://api.hive.blog');

module.exports = hiveClient;
