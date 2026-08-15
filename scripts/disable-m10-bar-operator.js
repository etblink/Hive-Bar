'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEYS = Object.freeze({
  HIVE_WRITE_MODE: 'disabled',
  HIVE_CONTROLLED_ACCOUNTS: '',
  HIVE_CONTROLLED_ACTIONS: '',
  HIVE_SIGNER_MODE: 'disabled',
  HIVE_M10_OPERATOR_ARMED_UNTIL: '',
  HIVE_M10_OPERATOR_AUDIT_PATH: '',
});

function disabledEnvironment(content) {
  const lines = String(content).split(/\r?\n/);
  const seen = new Set();
  const updated = lines.map((line) => {
    const key = Object.keys(KEYS).find((candidate) => line.startsWith(`${candidate}=`));
    if (!key) return line;
    seen.add(key);
    return `${key}=${KEYS[key]}`;
  });
  for (const [key, value] of Object.entries(KEYS)) {
    if (!seen.has(key)) updated.push(`${key}=${value}`);
  }
  return `${updated.filter((line, index, all) => line || index < all.length - 1).join('\n')}\n`;
}

function replaceRegularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('refusing a non-regular environment file');
  const directory = path.dirname(filename);
  const temp = path.join(directory, `.${path.basename(filename)}.m10-disable-${process.pid}`);
  const content = disabledEnvironment(fs.readFileSync(filename, 'utf8'));
  fs.writeFileSync(temp, content, { mode: stat.mode & 0o777 });
  fs.chmodSync(temp, stat.mode & 0o777);
  fs.chownSync(temp, stat.uid, stat.gid);
  fs.renameSync(temp, filename);
}

if (require.main === module) {
  const [mode, filename] = process.argv.slice(2);
  if (mode !== '--apply' || !filename) {
    process.stderr.write('Usage: node scripts/disable-m10-bar-operator.js --apply /absolute/path/to/hive-bar.env\n');
    process.exitCode = 64;
  } else if (!path.isAbsolute(filename)) {
    process.stderr.write('M10 disable refused: environment path must be absolute\n');
    process.exitCode = 64;
  } else {
    try {
      replaceRegularFile(filename);
      process.stdout.write('M10_OPERATOR_MODE=disabled\n');
    } catch (error) {
      process.stderr.write(`M10 disable refused: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

module.exports = { disabledEnvironment, replaceRegularFile };
