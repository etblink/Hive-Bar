'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..');
const thisScript = path.relative(repositoryRoot, __filename);
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: repositoryRoot, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);

const patterns = [
  ['Hive private key', /\b5[HJK][1-9A-HJ-NP-Za-km-z]{49,50}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['Slack token', /\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{10,}\b/],
  ['PEM private key', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/],
];

const findings = [];
for (const relativePath of files) {
  if (relativePath === thisScript) continue;

  const filename = path.join(repositoryRoot, relativePath);
  let contents;
  try {
    contents = fs.readFileSync(filename);
  } catch {
    continue;
  }
  if (contents.includes(0)) continue;

  const text = contents.toString('utf8');
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${relativePath}: ${label}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential secrets detected:\n${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan passed (${files.length} repository files checked).\n`);
}
