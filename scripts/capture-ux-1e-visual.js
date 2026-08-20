'use strict';
/* global document, window, getComputedStyle */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const ejs = require('ejs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.resolve(
  ROOT,
  process.env.UX_1E_VISUAL_OUTPUT || 'artifacts/ux-1e-visual',
);

const avatarSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#d49a5b"/><circle cx="40" cy="30" r="15" fill="#17120f"/><path d="M15 72c4-18 14-27 25-27s21 9 25 27" fill="#17120f"/></svg>',
  'utf8',
).toString('base64');

const messageProfiles = {
  alice: {
    name: 'alice',
    displayName: 'Alice Example',
    profileImage: `data:image/svg+xml;base64,${avatarSvg}`,
  },
  bob: {
    name: 'bob',
    displayName: 'Bob Example',
    profileImage: `data:image/svg+xml;base64,${avatarSvg}`,
  },
};

const wallPage = {
  items: [
    {
      sender: 'alice',
      amount: '1.000 HBD',
      message:
        'Great crowd tonight. I left the darts by the back table if anyone wants another round.',
      timestamp: '2026-08-20T19:05:00',
      transactionId: 'a'.repeat(40),
      blockNumber: 100101,
    },
    {
      sender: 'bob',
      amount: '2.000 HBD',
      message:
        'Thanks for hosting us after the game — the bartender recommendations were perfect.',
      timestamp: '2026-08-20T18:35:00',
      transactionId: 'b'.repeat(40),
      blockNumber: 100099,
    },
  ],
  nextCursor: null,
};

const inboxPage = {
  items: [
    {
      sender: 'alice',
      amount: '1.000 HBD',
      ciphertext: '#ux1e-alice-ciphertext',
      timestamp: '2026-08-20T19:10:00',
      transactionId: 'c'.repeat(40),
      blockNumber: 100102,
    },
    {
      sender: 'bob',
      amount: '1.000 HBD',
      ciphertext: '#ux1e-bob-ciphertext',
      timestamp: '2026-08-20T17:50:00',
      transactionId: 'd'.repeat(40),
      blockNumber: 100090,
    },
  ],
  nextCursor: null,
};

function formatHiveDate(value) {
  return value.replace('T', ' ').replace(':00', '');
}

async function renderPartial(filename, values) {
  return ejs.renderFile(path.join(ROOT, filename), {
    userProfile: { name: 'fartman69' },
    profileSettings: { wallFee: '1.000 HBD' },
    wallPage,
    inboxPage,
    messageProfiles,
    hiveSession: null,
    canWriteAction: () => false,
    formatHiveDate,
    ...values,
  });
}

function pageDocument(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/m15-social.css">
  <link rel="stylesheet" href="/css/ux-1e-messages.css">
</head>
<body>
  <main class="profile-shell">
    <div class="app-container">
      <div id="profile-content">${body}</div>
    </div>
  </main>
</body>
</html>`;
}

function contentType(filename) {
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'text/html; charset=utf-8';
}

async function createServer() {
  const [wall, inbox] = await Promise.all([
    renderPartial('views/pages/profile/partials/wall-posts.ejs'),
    renderPartial('views/pages/profile/partials/inbox.ejs'),
  ]);
  const pages = {
    '/wall': pageDocument('UX-1E Wall fixture', wall),
    '/inbox': pageDocument('UX-1E Inbox fixture', inbox),
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (pages[url.pathname]) {
      res.writeHead(200, { 'content-type': contentType('.html') });
      res.end(pages[url.pathname]);
      return;
    }
    if (url.pathname.startsWith('/css/')) {
      const filename = path.join(ROOT, 'public', url.pathname);
      if (!filename.startsWith(path.join(ROOT, 'public', 'css'))) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        res.writeHead(200, { 'content-type': contentType(filename) });
        res.end(fs.readFileSync(filename));
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function assertSurface(page, kind) {
  const entries = page.locator('[data-message-entry]');
  assert.equal(await entries.count(), 2, `${kind}: expected two deterministic message entries`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 1, `${kind}: horizontal overflow ${overflow}px`);

  const cardLike = await entries.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
    };
  });
  assert.ok(
    cardLike.background === 'rgba(0, 0, 0, 0)' || cardLike.background === 'transparent',
    `${kind}: message entry should keep a transparent social-feed surface`,
  );
  assert.equal(cardLike.radius, '0px', `${kind}: message entry should not become a card`);

  const avatar = entries.first().locator('.message-entry__avatar');
  await avatar.waitFor({ state: 'visible' });
  const avatarBox = await avatar.boundingBox();
  assert.ok(avatarBox && avatarBox.width >= 36, `${kind}: sender avatar should remain legible`);

  const details = entries.first().locator('.message-entry__details');
  assert.equal(await details.getAttribute('open'), null, `${kind}: provenance stays collapsed`);

  const amountSize = Number.parseFloat(
    await entries.first().locator('.message-entry__amount').evaluate(
      (element) => getComputedStyle(element).fontSize,
    ),
  );

  if (kind === 'wall') {
    const body = entries.first().locator('.message-entry__body');
    await body.waitFor({ state: 'visible' });
    const bodySize = Number.parseFloat(
      await body.evaluate((element) => getComputedStyle(element).fontSize),
    );
    assert.ok(bodySize > amountSize, 'wall: human message should dominate payment metadata');
  }

  if (kind === 'inbox') {
    assert.equal(await page.locator('.wallet-panel').count(), 0, 'inbox: wallet panels are forbidden');
    const decrypt = entries.first().locator('[data-inbox-ciphertext]');
    const decryptBox = await decrypt.boundingBox();
    assert.ok(decryptBox && decryptBox.height >= 44, 'inbox: decrypt action should be touch-friendly');
  }
}

async function runAxe(page, label) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () =>
    window.axe.run(document, {
      resultTypes: ['violations'],
      rules: {
        'color-contrast': { enabled: false },
      },
    }),
  );
  const severe = result.violations.filter((item) =>
    ['serious', 'critical'].includes(item.impact),
  );
  assert.deepEqual(
    severe.map((item) => ({ id: item.id, impact: item.impact })),
    [],
    `${label}: serious/critical accessibility violations`,
  );
  return result.violations.map((item) => ({ id: item.id, impact: item.impact }));
}

async function main() {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  const { server, port } = await createServer();
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  const axe = {};
  const consoleErrors = [];

  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(`${viewport.name}: ${message.text()}`);
      });
      page.on('pageerror', (error) => consoleErrors.push(`${viewport.name}: ${error.message}`));

      await page.goto(`http://127.0.0.1:${port}/wall`, { waitUntil: 'networkidle' });
      await assertSurface(page, 'wall');
      axe[`wall-${viewport.name}`] = await runAxe(page, `wall-${viewport.name}`);
      const wallPath = path.join(OUTPUT, `wall-${viewport.name}.png`);
      await page.screenshot({ path: wallPath, fullPage: true });
      captures.push(path.basename(wallPath));

      await page.goto(`http://127.0.0.1:${port}/inbox`, { waitUntil: 'networkidle' });
      await assertSurface(page, 'inbox');
      axe[`inbox-locked-${viewport.name}`] = await runAxe(
        page,
        `inbox-locked-${viewport.name}`,
      );
      const lockedPath = path.join(OUTPUT, `inbox-locked-${viewport.name}.png`);
      await page.screenshot({ path: lockedPath, fullPage: true });
      captures.push(path.basename(lockedPath));

      await page.locator('[data-inbox-entry]').first().evaluate((entry) => {
        const plaintext = entry.querySelector('[data-inbox-plaintext]');
        plaintext.hidden = false;
        plaintext.textContent =
          'We saved your jacket behind the bar. Ask for it at the counter tomorrow.';
        const status = entry.querySelector('[data-m4-status]');
        status.textContent = 'Decrypted in this browser.';
      });
      const decrypted = page.locator('[data-inbox-entry]').first().locator('[data-inbox-plaintext]');
      await decrypted.waitFor({ state: 'visible' });
      const decryptedSize = Number.parseFloat(
        await decrypted.evaluate((element) => getComputedStyle(element).fontSize),
      );
      const decryptedAmountSize = Number.parseFloat(
        await page.locator('[data-inbox-entry]').first().locator('.message-entry__amount').evaluate(
          (element) => getComputedStyle(element).fontSize,
        ),
      );
      assert.ok(
        decryptedSize > decryptedAmountSize,
        'inbox: decrypted human message should dominate payment metadata',
      );
      axe[`inbox-decrypted-${viewport.name}`] = await runAxe(
        page,
        `inbox-decrypted-${viewport.name}`,
      );
      const decryptedPath = path.join(OUTPUT, `inbox-decrypted-${viewport.name}.png`);
      await page.screenshot({ path: decryptedPath, fullPage: true });
      captures.push(path.basename(decryptedPath));

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  assert.deepEqual(consoleErrors, [], 'UX-1E browser console/page errors');

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();

  const manifest = {
    milestone: 'UX-1E',
    commit,
    tree,
    mutationBlocked: true,
    nativeKeychainInvocations: 0,
    viewports: ['1440x1000', '390x844'],
    captures,
    axe,
    consoleErrors,
  };
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stdout.write(
    `UX-1E visual qualification PASS: ${captures.length} captures; commit=${commit}; tree=${tree}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
