'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PAYMENT_DB_PATH = '/var/lib/hive-bar/payments/receipts.sqlite3';

function isSafePaymentDatabasePath(filename) {
  if (filename !== PAYMENT_DB_PATH || path.basename(filename) !== 'receipts.sqlite3') return false;
  const directory = path.dirname(filename);
  try {
    if (!fs.existsSync(directory)) return true;
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false;
    if (!fs.existsSync(filename)) return true;
    const fileStat = fs.lstatSync(filename);
    return fileStat.isFile() && !fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = { PAYMENT_DB_PATH, isSafePaymentDatabasePath };
