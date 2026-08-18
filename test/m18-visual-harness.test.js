'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const {
  EXPECTED_INTENTIONAL_401_CONSOLE_ERROR,
  assertExpectedConsoleErrors,
} = require('../scripts/capture-m18-visual');
const {
  FIXTURE_ACCOUNT,
  VISUAL_HEIGHT,
  VISUAL_WIDTHS,
  createM18VisualFixture,
} = require('./support/m18-visual-fixture');

const ROOT = path.join(__dirname, '..');

test('M18.2 console policy permits only one exact intentional main-document 401 error', () => {
  const documentUrl = 'http://127.0.0.1:3000/profile/etblink/inbox';
  const exactWithoutLocation = {
    locationUrl: null,
    text: EXPECTED_INTENTIONAL_401_CONSOLE_ERROR,
  };
  const exactWithLocation = {
    locationUrl: documentUrl,
    text: EXPECTED_INTENTIONAL_401_CONSOLE_ERROR,
  };

  assert.doesNotThrow(() =>
    assertExpectedConsoleErrors({
      consoleErrors: [exactWithoutLocation],
      documentUrl,
      statusCode: 401,
    }),
  );
  assert.doesNotThrow(() =>
    assertExpectedConsoleErrors({
      consoleErrors: [exactWithLocation],
      documentUrl,
      statusCode: 401,
    }),
  );
  assert.doesNotThrow(() =>
    assertExpectedConsoleErrors({ consoleErrors: [], documentUrl, statusCode: 200 }),
  );

  const rejectedConsoleErrors = [
    [],
    [exactWithoutLocation, exactWithoutLocation],
    [
      exactWithoutLocation,
      { locationUrl: null, text: 'Unrelated console error' },
    ],
    [
      {
        locationUrl: null,
        text: 'Failed to load resource: the server responded with a status of 401',
      },
    ],
    [
      {
        locationUrl: 'http://127.0.0.1:3000/unexpected-resource',
        text: EXPECTED_INTENTIONAL_401_CONSOLE_ERROR,
      },
    ],
  ];
  for (const consoleErrors of rejectedConsoleErrors) {
    assert.throws(() =>
      assertExpectedConsoleErrors({ consoleErrors, documentUrl, statusCode: 401 }),
    );
  }
  assert.throws(() =>
    assertExpectedConsoleErrors({
      consoleErrors: [exactWithoutLocation],
      documentUrl,
      statusCode: 200,
    }),
  );
});

test('M18.2 visual fixture is deterministic, non-signing, and mutation-fail-closed', async () => {
  const fixture = createM18VisualFixture();

  assert.deepEqual(VISUAL_WIDTHS, [360, 390, 768, 1024, 1440, 1600]);
  assert.equal(VISUAL_HEIGHT, 900);
  assert.equal(fixture.config.hive.writeMode, 'disabled');
  assert.equal(fixture.config.hive.signerMode, 'disabled');
  assert.equal(fixture.config.hive.writesEnabled, false);
  assert.equal(fixture.config.payments.enabled, false);
  assert.equal(fixture.session.account, FIXTURE_ACCOUNT);

  const blocked = await request(fixture.app)
    .post('/auth/challenge')
    .send({ account: FIXTURE_ACCOUNT })
    .expect(405);
  assert.equal(blocked.body.error.code, 'M18_VISUAL_MUTATION_FORBIDDEN');
  assert.deepEqual(fixture.mutationAttempts, [{ method: 'POST', path: '/auth/challenge' }]);
  assert.deepEqual(fixture.rpcPool.calls, []);
  assert.deepEqual(fixture.hiveReadService.calls, []);
});

test('M18.2 visual fixture renders real signed-out and fixture-authenticated shell states', async () => {
  const fixture = createM18VisualFixture();

  const signedOut = await request(fixture.app)
    .get(`/profile/${FIXTURE_ACCOUNT}/inbox`)
    .expect(401);
  const signedOutDocument = new JSDOM(signedOut.text).window.document;
  assert.equal(signedOutDocument.querySelector('h1')?.textContent.trim(), 'Sign in required');
  assert.deepEqual(
    Array.from(signedOutDocument.querySelectorAll('.app-nav-label'), (item) =>
      item.textContent.trim(),
    ),
    ['Home', 'Community', 'Threads', 'Sign in'],
  );
  assert.ok(signedOutDocument.querySelector('.app-signin__panel .app-field-control'));
  assert.ok(signedOutDocument.querySelector('.app-state--access .button-primary'));

  const authenticated = await request(fixture.app)
    .get(`/profile/${FIXTURE_ACCOUNT}`)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  const authenticatedDocument = new JSDOM(authenticated.text).window.document;
  assert.deepEqual(
    Array.from(authenticatedDocument.querySelectorAll('.app-nav-label'), (item) =>
      item.textContent.trim(),
    ),
    ['Home', 'Community', 'Threads', 'You'],
  );
  assert.equal(
    authenticatedDocument
      .querySelector(`a[href="/profile/${FIXTURE_ACCOUNT}"]`)
      ?.getAttribute('aria-current'),
    'page',
  );
  assert.equal(authenticatedDocument.querySelector('#profile-heading')?.textContent.trim(), 'Evan');
  assert.ok(authenticatedDocument.querySelector('[data-keychain-logout]'));
  assert.equal(authenticatedDocument.querySelector('[data-keychain-login]'), null);
  assert.ok(authenticatedDocument.querySelector('.transaction-review[data-social-confirm]'));
  assert.deepEqual(fixture.rpcPool.calls, []);
  assert.deepEqual(fixture.hiveReadService.unexpectedCalls, []);
  assert.deepEqual(
    fixture.hiveReadService.calls.map((call) => call.method),
    ['getProfile', 'getAccountPosts'],
  );
});

test('M18.2 CI retains dual-OS source qualification and one pinned Ubuntu visual artifact job', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const capture = fs.readFileSync(path.join(ROOT, 'scripts', 'capture-m18-visual.js'), 'utf8');
  const visualJob = workflow.match(/  visual-acceptance:\n[\s\S]*?(?=\n  live-read-smoke:)/)?.[0];

  assert.match(workflow, /os:\s*[\s\S]*ubuntu-latest[\s\S]*windows-latest/);
  assert.ok(visualJob);
  assert.match(visualJob, /runs-on:\s*ubuntu-latest/);
  assert.match(
    visualJob,
    /with:\n\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}\n\s+fetch-depth: 2\n\s+persist-credentials: false/,
  );
  assert.match(visualJob, /npm run test:visual:m18/);
  assert.match(
    visualJob,
    /m18-2-visual-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  );
  assert.equal(
    visualJob.match(/\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g)?.length,
    2,
  );
  assert.match(visualJob, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(capture, /M18 visual qualification forbids Keychain access/);
  assert.match(capture, /method !== 'GET' && method !== 'HEAD'/);
  assert.match(capture, /assert\.deepEqual\(network\.violations, \[\]\)/);
  assert.match(capture, /assertExpectedConsoleErrors\(\{/);
  assert.match(capture, /assert\.deepEqual\(pageErrors, \[\]\)/);
  assert.match(capture, /footerNavigationOverlap/);
  assert.match(
    capture,
    /assert\.ok\(evidence\.footerLineBottom <= evidence\.navigationRect\.top \+ 1\)/,
  );
  assert.match(capture, /wordmark\.clipped/);
  assert.match(capture, /horizontalCenterDelta/);
  assert.match(capture, /summaryHorizontalOverflow/);
  assert.match(capture, /busyCueContent/);
  assert.match(capture, /details\.busy\.footerNavigationOverlap <= 1/);
  assert.match(
    capture,
    /details\.busy\.footerLineBottom <= details\.busy\.navigationTop \+ 1/,
  );
  assert.match(
    capture,
    /const screenshot = await page\.screenshot\([\s\S]*?details\.busy\.footerNavigationOverlap <= 1/,
  );
});
