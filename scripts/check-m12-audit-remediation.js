'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendOperatorAudit, assertOperatorAuditWritable } = require('../src/social/operator-audit');

const AUDIT_DIRECTORY = '/var/lib/hive-bar/audit';
// The activation identifier uses ISO-8601 UTC separators (the literal upper-
// case T and Z), plus a lower-case overlay digest prefix.  Keep the probe
// name exact rather than merely accepting a broad scratch-file pattern.
const PROBE_PATTERN = /^\.m12-audit-probe-m12a-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}\.ndjson$/;

function assertProbeTarget(filename, expectedDirectory = AUDIT_DIRECTORY) {
  if (!path.isAbsolute(filename) || path.dirname(filename) !== expectedDirectory) {
    throw new Error('M12 audit probe target is outside the exact audit directory');
  }
  if (!PROBE_PATTERN.test(path.basename(filename))) {
    throw new Error('M12 audit probe filename is invalid');
  }
  const directory = fs.lstatSync(expectedDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('M12 audit probe directory is unsafe');
  }
  if (fs.existsSync(filename)) throw new Error('M12 audit probe target already exists');
}

function runAuditSandboxProbe(filename, expectedDirectory = AUDIT_DIRECTORY) {
  assertProbeTarget(filename, expectedDirectory);
  const config = {
    hive: {
      m10OperatorArmedUntil: new Date(Date.now() + 60_000).toISOString(),
      m10OperatorAuditPath: filename,
    },
  };
  try {
    assertOperatorAuditWritable(config);
    appendOperatorAudit(config, 'sandbox_probe', {
      account: 'fourthstreetbar',
      signer: 'fartman69',
      action: 'post',
      authority: 'Posting',
      fingerprint: '0'.repeat(64),
    });
    const lines = fs.readFileSync(filename, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length !== 1) throw new Error('M12 audit probe wrote an unexpected record count');
    const record = JSON.parse(lines[0]);
    if (record.event !== 'sandbox_probe' || record.action !== 'post') {
      throw new Error('M12 audit probe record differs');
    }
    return Object.freeze({ auditSandbox: 'writable', probeCleanup: 'pending' });
  } finally {
    if (fs.existsSync(filename)) {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('M12 audit probe cleanup target is unsafe');
      }
      fs.unlinkSync(filename);
    }
  }
}

if (require.main === module) {
  try {
    const filename = process.argv[2] || '';
    const result = runAuditSandboxProbe(filename);
    process.stdout.write(`${JSON.stringify({ ...result, probeCleanup: 'complete' })}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar M12 audit sandbox probe refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { AUDIT_DIRECTORY, assertProbeTarget, runAuditSandboxProbe };
