'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  metadataRevision,
  parsePostingMetadata,
  prepareProfileUpdate,
  readProfileSettings,
  validateProfileInput,
} = require('../src/hive/profile-settings');

const DEFAULT_FEE = '1.000 HBD';
const ORIGINAL = JSON.stringify({
  profile: {
    name: 'Old Name',
    about: 'Old about',
    profile_image: 'https://images.hive.blog/u/etblink/avatar',
    location: 'Reno',
    website: 'https://example.test',
    cover_image: 'https://images.hive.blog/u/etblink/cover',
  },
  other_client: { keep: true, nested: ['exact'] },
  hivebar: { future_field: 'preserve', wall_fee: '2.000 HBD', wall_blocklist: ['spammer'] },
});

test('tolerates empty and malformed posting metadata without crashing', () => {
  const empty = parsePostingMetadata('');
  assert.equal(empty.valid, true);
  assert.deepEqual(empty.metadata, {});
  assert.equal(readProfileSettings(empty, { defaultWallFee: DEFAULT_FEE }).wallFee, DEFAULT_FEE);

  const malformed = parsePostingMetadata('{broken');
  assert.equal(malformed.valid, false);
  const settings = readProfileSettings(malformed, { defaultWallFee: DEFAULT_FEE });
  assert.equal(settings.metadataValid, false);
  assert.equal(settings.wallFee, DEFAULT_FEE);
});

test('merges only owned fields while preserving unrelated profile and client metadata', () => {
  const prepared = prepareProfileUpdate({
    rawMetadata: ORIGINAL,
    baseRevision: metadataRevision(ORIGINAL),
    defaultWallFee: DEFAULT_FEE,
    payload: {
      displayName: 'New Name',
      about: 'New about',
      profileImage: 'https://images.hive.blog/u/etblink/new-avatar',
      wallFee: '1.000 HBD',
      blocklist: 'spammer\nrewardbot',
    },
  });
  const merged = JSON.parse(prepared.postingJsonMetadata);
  assert.equal(merged.profile.name, 'New Name');
  assert.equal(merged.profile.location, 'Reno');
  assert.equal(merged.profile.website, 'https://example.test');
  assert.equal(merged.profile.cover_image, 'https://images.hive.blog/u/etblink/cover');
  assert.deepEqual(merged.other_client, { keep: true, nested: ['exact'] });
  assert.equal(merged.hivebar.future_field, 'preserve');
  assert.equal(merged.hivebar.wall_fee, '1.000 HBD');
  assert.deepEqual(merged.hivebar.wall_blocklist, ['spammer', 'rewardbot']);
  assert.deepEqual(Object.keys(prepared.diff).sort(), [
    'about',
    'blocklist',
    'displayName',
    'profileImage',
    'wallFee',
  ]);
});

test('preserves an unchanged legacy profile image while changing the wall fee', () => {
  const legacyImage = 'https://files.peakd.com/file/peakd-hive/etblink/me.jpg';
  const legacyMetadata = JSON.stringify({
    profile: {
      name: 'Evan Kotler',
      about: '',
      profile_image: legacyImage,
      location: 'Reno',
    },
    other_client: { keep: true },
    hivebar: { wall_fee: '1.000 HBD', wall_blocklist: [] },
  });

  const prepared = prepareProfileUpdate({
    rawMetadata: legacyMetadata,
    baseRevision: metadataRevision(legacyMetadata),
    defaultWallFee: DEFAULT_FEE,
    payload: {
      displayName: 'Evan Kotler',
      about: '',
      profileImage: legacyImage,
      wallFee: '0.050 HBD',
      blocklist: '',
    },
  });

  const merged = JSON.parse(prepared.postingJsonMetadata);
  assert.equal(merged.profile.profile_image, legacyImage);
  assert.equal(merged.hivebar.wall_fee, '0.050 HBD');
  assert.deepEqual(prepared.diff, {
    wallFee: { before: '1.000 HBD', after: '0.050 HBD' },
  });

  assert.throws(
    () => prepareProfileUpdate({
      rawMetadata: legacyMetadata,
      baseRevision: metadataRevision(legacyMetadata),
      defaultWallFee: DEFAULT_FEE,
      payload: {
        displayName: 'Evan Kotler',
        about: '',
        profileImage: 'https://example.com/replacement.jpg',
        wallFee: '0.050 HBD',
        blocklist: '',
      },
    }),
    /images\.hive\.blog/,
  );

  const approved = prepareProfileUpdate({
    rawMetadata: legacyMetadata,
    baseRevision: metadataRevision(legacyMetadata),
    defaultWallFee: DEFAULT_FEE,
    payload: {
      displayName: 'Evan Kotler',
      about: '',
      profileImage: 'https://images.hive.blog/u/etblink/new-avatar',
      wallFee: '0.050 HBD',
      blocklist: '',
    },
  });
  assert.equal(
    JSON.parse(approved.postingJsonMetadata).profile.profile_image,
    'https://images.hive.blog/u/etblink/new-avatar',
  );
});

test('blocks stale, malformed, no-op, and independently invalid settings updates', () => {
  const validPayload = {
    displayName: 'New Name',
    about: 'New about',
    profileImage: 'https://images.hive.blog/u/etblink/avatar',
    wallFee: '1.000 HBD',
    blocklist: '',
  };
  assert.throws(
    () => prepareProfileUpdate({ rawMetadata: ORIGINAL, baseRevision: '0'.repeat(64), payload: validPayload, defaultWallFee: DEFAULT_FEE }),
    (error) => error.code === 'PROFILE_METADATA_STALE',
  );
  assert.throws(
    () => prepareProfileUpdate({ rawMetadata: '{broken', baseRevision: metadataRevision('{broken'), payload: validPayload, defaultWallFee: DEFAULT_FEE }),
    (error) => error.code === 'PROFILE_METADATA_MALFORMED',
  );
  const current = readProfileSettings(parsePostingMetadata(ORIGINAL), { defaultWallFee: DEFAULT_FEE });
  assert.throws(
    () => prepareProfileUpdate({
      rawMetadata: ORIGINAL,
      baseRevision: metadataRevision(ORIGINAL),
      defaultWallFee: DEFAULT_FEE,
      payload: { ...current, blocklist: current.blocklist },
    }),
    (error) => error.code === 'PROFILE_NO_CHANGES',
  );
  assert.throws(() => validateProfileInput({ ...validPayload, wallFee: '1.00 HBD' }), /three decimals/);
  assert.throws(
    () => validateProfileInput({ ...validPayload, profileImage: 'https://example.com/avatar.png' }),
    /images\.hive\.blog/,
  );
  assert.throws(
    () => validateProfileInput({ ...validPayload, blocklist: 'INVALID!' }),
    /not a valid Hive account/,
  );
});
