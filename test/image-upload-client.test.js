'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TextEncoder } = require('node:util');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(ROOT, 'public/js/image-upload.js'), 'utf8');

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function markup() {
  return `<!doctype html><body>
    <form id="social-form">
      <div data-image-upload data-image-mode="social">
        <input type="file" data-image-file>
        <input type="hidden" name="imageUrl" data-image-url>
        <input name="imageAlt" data-image-alt>
        <div data-image-preview-shell hidden><img data-image-preview><p data-image-meta></p></div>
        <button type="button" data-image-upload-button disabled>Upload image</button>
        <button type="button" data-image-remove hidden>Remove image</button>
        <p data-image-status></p>
      </div>
      <button type="submit">Review</button>
    </form>
  </body>`;
}

function createDom() {
  const dom = new JSDOM(markup(), {
    runScripts: 'outside-only',
    url: 'https://fourthstreetbar.test/community',
  });
  dom.window.TextEncoder = TextEncoder;
  dom.window.URL.createObjectURL = () => 'blob:hive-bar-test';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.eval(client);
  return dom;
}

test('C2-D.1 signing message is byte-exact ImageSigningChallenge plus raw image bytes', async () => {
  const dom = createDom();
  const file = new dom.window.File([Uint8Array.from([0, 1, 2, 255])], 'photo.png', { type: 'image/png' });
  const message = await dom.window.HiveBarImageUpload.createSigningMessage(file);
  const parsed = JSON.parse(message);
  assert.equal(parsed.type, 'Buffer');
  const bytes = Buffer.from(parsed.data);
  const prefix = Buffer.from('ImageSigningChallenge', 'utf8');
  assert.deepEqual(bytes.subarray(0, prefix.length), prefix);
  assert.deepEqual([...bytes.subarray(prefix.length)], [0, 1, 2, 255]);
  dom.window.close();
});

test('C2-D.1 client rejects unsupported or oversized files before Keychain', () => {
  const dom = createDom();
  const api = dom.window.HiveBarImageUpload;
  assert.throws(
    () => api.validateFile({ type: 'image/svg+xml', size: 100, name: 'unsafe.svg' }),
    /PNG, JPEG, WebP, or GIF/,
  );
  assert.throws(
    () => api.validateFile({ type: 'image/png', size: api.MAX_IMAGE_BYTES + 1, name: 'huge.png' }),
    /10\.0 MB or smaller/,
  );
  dom.window.close();
});

test('C2-D.1 explicit upload uses session account + Posting signBuffer, performs one ImageHoster POST, then marks draft uploaded', async () => {
  const dom = createDom();
  const { document } = dom.window;
  const container = document.querySelector('[data-image-upload]');
  const calls = [];
  let signArgs;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url === '/auth/session') return response({ authenticated: true, account: 'etblink' });
    assert.match(url, /^https:\/\/images\.hive\.blog\/etblink\/[0-9a-f]{130}$/);
    assert.equal(options.method, 'POST');
    return response({ url: 'https://images.hive.blog/DQmExample/photo.png' });
  };
  const controller = new dom.window.HiveBarImageUpload.ImageUploadController({
    fetchImpl,
    keychainFactory: () => ({
      async signBuffer(args) {
        signArgs = args;
        return { signature: 'a'.repeat(130), publicKey: 'STMtest' };
      },
    }),
    createObjectUrl: () => 'blob:preview',
    revokeObjectUrl: () => {},
  });
  controller.stateFor(container);
  controller.setState(container, 'empty');
  const file = new dom.window.File([Uint8Array.from([1, 2, 3])], 'photo.png', { type: 'image/png' });
  assert.equal(controller.select(container, file), true);
  const url = await controller.upload(container);
  assert.equal(url, 'https://images.hive.blog/DQmExample/photo.png');
  assert.equal(signArgs.account, 'etblink');
  assert.match(signArgs.title, /image upload authorization/i);
  assert.match(signArgs.message, /"type":"Buffer"/);
  assert.equal(calls.length, 2);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(container.dataset.imageUploadState, 'uploaded');
  assert.equal(container.querySelector('[data-image-url]').value, url);
  assert.match(container.querySelector('[data-image-status]').textContent, /post has not been sent/i);
  dom.window.close();
});

test('C2-D.1 ambiguous upload locks the attachment and cannot automatically retry', async () => {
  const dom = createDom();
  const container = dom.window.document.querySelector('[data-image-upload]');
  let posts = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === '/auth/session') return response({ authenticated: true, account: 'etblink' });
    if (options.method === 'POST') {
      posts += 1;
      throw new Error('network outcome unknown');
    }
    throw new Error('unexpected request');
  };
  const controller = new dom.window.HiveBarImageUpload.ImageUploadController({
    fetchImpl,
    keychainFactory: () => ({ async signBuffer() { return { signature: 'b'.repeat(130) }; } }),
    createObjectUrl: () => 'blob:preview',
    revokeObjectUrl: () => {},
  });
  controller.stateFor(container);
  const file = new dom.window.File([Uint8Array.from([1])], 'photo.png', { type: 'image/png' });
  controller.select(container, file);
  await controller.upload(container);
  assert.equal(posts, 1);
  assert.equal(container.dataset.imageUploadState, 'ambiguous');
  assert.match(container.querySelector('[data-image-status]').textContent, /Do not retry/i);
  await controller.upload(container);
  assert.equal(posts, 1);
  dom.window.close();
});

test('C2-D.1 selected-but-not-uploaded image blocks downstream social/profile submit', () => {
  const dom = createDom();
  const container = dom.window.document.querySelector('[data-image-upload]');
  const form = dom.window.document.querySelector('#social-form');
  const controller = new dom.window.HiveBarImageUpload.ImageUploadController({
    createObjectUrl: () => 'blob:preview',
    revokeObjectUrl: () => {},
  });
  controller.stateFor(container);
  controller.setState(container, 'selected');
  assert.equal(controller.blocksSubmit(form), true);
  assert.match(container.querySelector('[data-image-status]').textContent, /Upload or remove/);
  controller.setState(container, 'uploaded');
  assert.equal(controller.blocksSubmit(form), false);
  dom.window.close();
});
