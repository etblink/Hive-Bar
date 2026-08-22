'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('C2-E visual harness freezes mobile/desktop moderation and unavailable-store scenarios', () => {
  const script = read('scripts/capture-c2-e-visual.js');
  assert.match(script, /WIDTHS = Object\.freeze\(\[390, 1440\]\)/);
  for (const id of [
    'community-controls',
    'threads-suppressed-branch',
    'conversation-suppressed-branch',
    'moderation-management',
    'moderation-store-unavailable',
  ]) {
    assert.ok(script.includes(id));
  }
  assert.match(script, /C2_E_VISUAL_MUTATION_FORBIDDEN/);
  assert.match(script, /C2-E visual qualification forbids Keychain signing/);
  assert.match(script, /focusReturned/);
  assert.match(script, /status of 503/);
});

test('C2-E workflow is pinned, read-only during capture, and preserves rendered evidence', () => {
  const workflow = read('.github/workflows/c2-e-visual.yml');
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(workflow, /npm run test:visual:c2-e/);
  assert.match(workflow, /retention-days: 90/);
});

test('C2-E controls disclose local-only effect and preserve accessible dialog semantics', () => {
  const control = read('views/common/moderation-control.ejs');
  const management = read('views/pages/moderation/index.ejs');
  assert.match(control, /aria-haspopup="dialog"/);
  assert.match(control, /aria-labelledby=/);
  assert.match(control, /role="status" aria-live="polite"/);
  assert.match(control, /does not delete, edit, flag, or otherwise change anything on Hive/);
  assert.match(control, /Maximum 240 UTF-8 bytes/);
  assert.match(management, /Hive content remains unchanged and independently available on Hive/);
  assert.match(management, /aria-label="Unhide/);
});

test('C2-E browser client never auto-retries ambiguous local moderation writes', () => {
  const client = read('public/js/moderation.js');
  assert.doesNotMatch(client, /for\s*\([^)]*attempt/i);
  assert.doesNotMatch(client, /setTimeout\s*\(/);
  assert.match(client, /check Moderation history before trying again/i);
  assert.match(client, /x-csrf-token/);
  assert.doesNotMatch(client, /HiveBarKeychain|requestSign|broadcast\s*\(/);
});

test('C2-E production storage source is explicit but does not activate moderation', () => {
  const helper = read('ops/privex/bin/hive-bar-prepare-moderation-storage');
  const dropin = read('ops/privex/hive-bar-moderation.service.d/10-moderation-storage.conf');
  const env = read('ops/privex/hive-bar.env.example');
  assert.match(helper, /install -d -o hivebar -g hivebar -m 0700/);
  assert.match(helper, /chmod 0600/);
  assert.match(helper, /Moderation was not enabled/);
  assert.match(dropin, /\/var\/lib\/hive-bar\/mod(eration)?/);
  assert.match(env, /HIVE_MODERATION_ENABLED=false/);
  assert.match(env, /HIVE_MODERATION_DB_PATH=\/var\/lib\/hive-bar\/moderation\/moderation\.sqlite3/);
});
