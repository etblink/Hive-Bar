'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const HEADER = fs.readFileSync(path.join(ROOT, 'views', 'common', 'header.ejs'), 'utf8');
const INPUT_CSS = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
const BUILT_CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');

test('M15.5 keeps primary navigation viewport-fixed at the bottom through tablet widths', () => {
  assert.match(
    HEADER,
    /<header class="app-shell-header \[backdrop-filter:none\]">/,
    'the sticky header must neutralize backdrop-filter so it cannot capture the fixed nav containing block',
  );
  assert.doesNotMatch(HEADER, /<header[^>]*\sstyle=/i, 'the fix must remain CSP-safe and avoid inline style');

  assert.match(
    INPUT_CSS,
    /\.app-primary-nav\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;[^}]*left:\s*0;/s,
    'mobile/tablet navigation must remain fixed to the viewport bottom',
  );
  assert.match(
    INPUT_CSS,
    /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.app-primary-nav\s*\{[^}]*position:\s*static;/,
    'desktop rail conversion must not begin before 1024px',
  );

  assert.match(
    BUILT_CSS,
    /backdrop-filter:none/,
    'the compiled stylesheet must contain the no-filter override used by the shell header',
  );
});
