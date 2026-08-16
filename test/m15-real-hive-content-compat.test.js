'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const test = require('node:test');
const { renderMarkdown } = require('../src/content/markdown');

const root = path.join(__dirname, '..');

function runCssBuild() {
  execSync('npm run build:css --silent', {
    cwd: root,
    stdio: 'pipe',
  });
}

test('M15.5.4 renders observed raw Hive image, table, and subscript HTML through the sanitizer', () => {
  const peakdImage = 'https://files.peakd.com/file/peakd-hive/etblink/48GgZY95Dpu4kHpk6I6hH7YDm7ocAkKfGdAetx5RiwymSxkBX4G3TJMBYPgqBiXE2e.jpg';
  const rendered = renderMarkdown([
    `<img src="${peakdImage}" alt="Gemini Generated Image">`,
    '',
    '<table><tr><td><img src="https://images.hive.blog/60x70/https://hivebuzz.me/@etblink/upvoted.png?202606300248"></td><td>You received more than 5000 upvotes.<br>Your next target is to reach 6000 upvotes.</td></tr></table>',
    '',
    '<sub>You can view your badges on <a href="https://hivebuzz.me/@etblink">your board</a>.</sub>',
  ].join('\n'));

  assert.match(rendered, /<table>/);
  assert.match(rendered, /<sub>You can view your badges/);
  assert.match(rendered, /src="https:\/\/images\.hive\.blog\/0x0\/https:\/\/files\.peakd\.com\/file\/peakd-hive\/etblink\//);
  assert.match(rendered, /src="https:\/\/images\.hive\.blog\/60x70\/https:\/\/hivebuzz\.me\/@etblink\/upvoted\.png\?202606300248"/);
  assert.match(rendered, /target="_blank"/);
  assert.match(rendered, /rel="nofollow noopener noreferrer"/);
  assert.doesNotMatch(rendered, /&lt;(?:img|table|sub)\b/i);
});

test('M15.5.4 raw Hive HTML remains fail-closed against active content and raw MathML injection', () => {
  const rendered = renderMarkdown([
    '<script>alert(1)</script>',
    '<iframe src="https://example.com"></iframe>',
    '<img src="javascript:alert(1)" onerror="alert(2)">',
    '<div class="fixed inset-0">overlay</div>',
    '<math><mtext>untrusted raw math</mtext></math>',
  ].join('\n'));

  assert.doesNotMatch(rendered, /<(?:script|iframe|math|mtext)\b/i);
  assert.doesNotMatch(rendered, /javascript:/i);
  assert.doesNotMatch(rendered, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(rendered, /class="(?:fixed|inset-0)/i);
});

test('M15.5.4 renders the observed bare TeX conventions without requiring dollar delimiters', () => {
  const rendered = renderMarkdown([
    'An admissible extension is a map',
    '',
    "E : \\mathcal{S} \\to \\mathcal{S}'",
    '',
    'Let (\\mathfrak{E}) denote the admissible extension class.',
    '',
    'Closure under composition: If (E_1, E_2 \\in \\mathfrak{E}), then (E_2 \\circ E_1 \\in \\mathfrak{E}).',
  ].join('\n'));

  assert.match(rendered, /class="hb-math hb-math--display"/);
  assert.match(rendered, /mathvariant="script"/);
  assert.match(rendered, /→/);
  assert.match(rendered, /mathvariant="fraktur"/);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assert.match(rendered, /∈/);
  assert.match(rendered, /∘/);
  assert.match(rendered, /An admissible extension is a map/);
  assert.match(rendered, /denote the admissible extension class/);
});

test('M15.5.4 Tailwind build ignores backend/docs class-like text while retaining explicit UI sources', () => {
  const packageJson = require('../package.json');
  assert.match(packageJson.scripts['build:css'], /tailwindcss --cwd \.\/views /);

  const stylePath = path.join(root, 'public', 'css', 'style.css');
  const sentinelPath = path.join(root, 'docs', '.m15-5-4-tailwind-sentinel.tmp');
  const before = fs.readFileSync(stylePath);

  try {
    fs.writeFileSync(
      sentinelPath,
      '<div class="bg-fuchsia-950 ring-8 shadow-2xl text-9xl">must not affect CSS</div>\n',
      'utf8',
    );
    runCssBuild();
    const after = fs.readFileSync(stylePath);
    assert.deepEqual(after, before);
  } finally {
    fs.rmSync(sentinelPath, { force: true });
    runCssBuild();
  }
});
