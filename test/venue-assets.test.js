'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createFixtureApp } = require('./support/test-app');

const root = path.join(__dirname, '..');
const assets = [
  {
    name: 'fourth-street-bar-bartender.jpg',
    width: 768,
    height: 960,
    sha256: 'aff6d1d746820f78cd659e658801cac0d20a2485e4b367d0c71eb14ee4a518fa',
  },
  {
    name: 'fourth-street-bar-exterior.jpg',
    width: 720,
    height: 960,
    sha256: '585b3e80a50723b3cd0209b244f3a57efb14c018313f64ea34bd7f3108bc654a',
  },
  {
    name: 'fourth-street-bar-patio.jpg',
    width: 2048,
    height: 1536,
    sha256: 'c65d5c0c00ea9ff6ce556586285eeabfa02e255fb87569556a58621014f1e100',
  },
  {
    name: 'fourth-street-bar-pool-table.jpg',
    width: 720,
    height: 960,
    sha256: 'db6b18d3cb7f33778072fe980e6bfeade38e1e6c9aa895229d4b0ed4a687e18f',
  },
];

function inspectJpeg(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'JPEG must start with SOI');
  const markers = [];
  let dimensions = null;
  let offset = 2;

  while (offset < buffer.length) {
    assert.equal(buffer[offset], 0xff, `invalid JPEG marker at byte ${offset}`);
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const length = buffer.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= buffer.length, 'JPEG segment is bounded');
    markers.push(marker);

    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      dimensions = {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  return { markers, dimensions };
}

test('serves four exact owner-approved venue photographs without embedded metadata', async () => {
  const { app } = createFixtureApp();

  for (const asset of assets) {
    const file = path.join(root, 'public', 'images', asset.name);
    const contents = fs.readFileSync(file);
    const digest = createHash('sha256').update(contents).digest('hex');
    const { markers, dimensions } = inspectJpeg(contents);

    assert.equal(digest, asset.sha256, asset.name);
    assert.deepEqual(dimensions, { width: asset.width, height: asset.height }, asset.name);
    assert.equal(
      markers.some((marker) => marker >= 0xe1 && marker <= 0xef),
      false,
      `${asset.name} must not contain EXIF, ICC, IPTC, or Photoshop application metadata`,
    );
    assert.equal(markers.includes(0xfe), false, `${asset.name} must not contain comments`);

    const response = await request(app).get(`/images/${asset.name}`).expect(200);
    assert.match(response.headers['content-type'], /^image\/jpeg/);
    assert.equal(createHash('sha256').update(response.body).digest('hex'), asset.sha256);
  }
});
