'use strict';

const { createHash } = require('node:crypto');
const { HIVE_ACCOUNT_PATTERN } = require('../config');
const { ConflictError, ValidationError } = require('../lib/errors');
const { parseAsset } = require('./assets');

const PROFILE_LIMITS = Object.freeze({
  aboutBytes: 512,
  blocklistAccounts: 100,
  displayNameBytes: 128,
  imageUrlBytes: 2048,
  metadataBytes: 8 * 1024,
});

function utf8Bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function metadataRevision(rawMetadata) {
  return createHash('sha256').update(String(rawMetadata ?? ''), 'utf8').digest('hex');
}

function parsePostingMetadata(rawMetadata) {
  const raw =
    typeof rawMetadata === 'string'
      ? rawMetadata
      : rawMetadata === null || rawMetadata === undefined
        ? ''
        : String(rawMetadata);
  const revision = metadataRevision(raw);
  if (!raw.trim()) return { metadata: {}, raw, revision, valid: true, empty: true };

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return { metadata: {}, raw, revision, valid: false, empty: false };
    }
    return { metadata: parsed, raw, revision, valid: true, empty: false };
  } catch {
    return { metadata: {}, raw, revision, valid: false, empty: false };
  }
}

function validFeeOrDefault(value, defaultWallFee) {
  const parsed = parseAsset(value, 'HBD');
  return parsed && parsed.units > 0n ? parsed.canonical : defaultWallFee;
}

function normalizedReadBlocklist(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((account) => String(account || '').trim().toLowerCase())
        .filter((account) => HIVE_ACCOUNT_PATTERN.test(account)),
    ),
  ];
}

function readProfileSettings(parsedMetadata, { defaultWallFee }) {
  const metadata = isPlainObject(parsedMetadata?.metadata) ? parsedMetadata.metadata : {};
  const profile = isPlainObject(metadata.profile) ? metadata.profile : {};
  const hivebar = isPlainObject(metadata.hivebar) ? metadata.hivebar : {};

  return {
    displayName: typeof profile.name === 'string' ? profile.name : '',
    about: typeof profile.about === 'string' ? profile.about : '',
    profileImage: typeof profile.profile_image === 'string' ? profile.profile_image : '',
    wallFee: validFeeOrDefault(hivebar.wall_fee, defaultWallFee),
    blocklist: normalizedReadBlocklist(hivebar.wall_blocklist),
    metadataValid: parsedMetadata?.valid !== false,
    revision: parsedMetadata?.revision || metadataRevision(''),
  };
}

function requireBoundedText(value, label, maximumBytes) {
  const text = String(value ?? '').trim();
  if (utf8Bytes(text) > maximumBytes) {
    throw new ValidationError(`${label} must be ${maximumBytes.toLocaleString('en-US')} UTF-8 bytes or fewer`);
  }
  return text;
}

function requireProfileImage(value) {
  const url = requireBoundedText(value, 'Profile image URL', PROFILE_LIMITS.imageUrlBytes);
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Profile image URL must be a valid HTTPS images.hive.blog URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'images.hive.blog' || parsed.username || parsed.password) {
    throw new ValidationError('Profile image URL must use HTTPS on images.hive.blog');
  }
  return parsed.toString();
}

function requireWallFee(value) {
  const raw = String(value ?? '').trim();
  const parsed = parseAsset(raw, 'HBD');
  if (!parsed || parsed.canonical !== raw || parsed.units <= 0n) {
    throw new ValidationError('Wall fee must be a positive HBD amount with exactly three decimals');
  }
  return parsed.canonical;
}

function requireBlocklist(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  const normalized = values.map((account) => String(account || '').trim().toLowerCase()).filter(Boolean);
  if (normalized.length > PROFILE_LIMITS.blocklistAccounts) {
    throw new ValidationError(`Wall sender exclusions are limited to ${PROFILE_LIMITS.blocklistAccounts} accounts`);
  }
  for (const account of normalized) {
    if (!HIVE_ACCOUNT_PATTERN.test(account)) {
      throw new ValidationError(`Wall sender exclusion @${account} is not a valid Hive account`);
    }
  }
  return [...new Set(normalized)];
}

function validateProfileInput(payload, { existingProfileImage = null } = {}) {
  const submittedProfileImage = String(payload?.profileImage ?? '');
  const profileImage =
    typeof existingProfileImage === 'string' && submittedProfileImage === existingProfileImage
      ? existingProfileImage
      : requireProfileImage(payload?.profileImage);

  return {
    displayName: requireBoundedText(
      payload?.displayName,
      'Display name',
      PROFILE_LIMITS.displayNameBytes,
    ),
    about: requireBoundedText(payload?.about, 'About text', PROFILE_LIMITS.aboutBytes),
    profileImage,
    wallFee: requireWallFee(payload?.wallFee),
    blocklist: requireBlocklist(payload?.blocklist),
  };
}

function ownedSnapshot(metadata, defaultWallFee) {
  return readProfileSettings(
    { metadata, revision: '', valid: true },
    { defaultWallFee },
  );
}

function withoutEmptyProperty(object, key, value) {
  if (value) object[key] = value;
  else delete object[key];
}

function prepareProfileUpdate({ rawMetadata, baseRevision, payload, defaultWallFee }) {
  const parsed = parsePostingMetadata(rawMetadata);
  if (parsed.revision !== String(baseRevision || '')) {
    throw new ConflictError('Profile metadata changed after this settings page was loaded', {
      code: 'PROFILE_METADATA_STALE',
    });
  }
  if (!parsed.valid) {
    throw new ConflictError(
      'Current posting metadata is malformed; Hive-Bar will not replace it because unrelated fields cannot be preserved safely',
      { code: 'PROFILE_METADATA_MALFORMED' },
    );
  }

  const before = ownedSnapshot(parsed.metadata, defaultWallFee);
  const input = validateProfileInput(payload, { existingProfileImage: before.profileImage });
  const next = { ...parsed.metadata };
  const profile = isPlainObject(parsed.metadata.profile) ? { ...parsed.metadata.profile } : {};
  const hivebar = isPlainObject(parsed.metadata.hivebar) ? { ...parsed.metadata.hivebar } : {};

  withoutEmptyProperty(profile, 'name', input.displayName);
  withoutEmptyProperty(profile, 'about', input.about);
  withoutEmptyProperty(profile, 'profile_image', input.profileImage);
  hivebar.version = 1;
  hivebar.wall_fee = input.wallFee;
  hivebar.wall_blocklist = input.blocklist;
  next.profile = profile;
  next.hivebar = hivebar;

  const postingJsonMetadata = JSON.stringify(next);
  if (utf8Bytes(postingJsonMetadata) > PROFILE_LIMITS.metadataBytes) {
    throw new ValidationError(
      `Merged posting metadata must be ${PROFILE_LIMITS.metadataBytes.toLocaleString('en-US')} UTF-8 bytes or fewer`,
    );
  }

  const after = ownedSnapshot(next, defaultWallFee);
  const diff = Object.fromEntries(
    ['displayName', 'about', 'profileImage', 'wallFee', 'blocklist']
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map((field) => [field, { before: before[field], after: after[field] }]),
  );
  if (Object.keys(diff).length === 0) {
    throw new ConflictError('No profile setting has changed', { code: 'PROFILE_NO_CHANGES' });
  }

  return {
    postingJsonMetadata,
    proposedRevision: metadataRevision(postingJsonMetadata),
    diff,
    settings: after,
  };
}

module.exports = {
  PROFILE_LIMITS,
  metadataRevision,
  parsePostingMetadata,
  prepareProfileUpdate,
  readProfileSettings,
  requireBlocklist,
  requireProfileImage,
  requireWallFee,
  validateProfileInput,
};
