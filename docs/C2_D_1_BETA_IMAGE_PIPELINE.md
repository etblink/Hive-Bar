# C2-D.1 Beta Image Pipeline

Status: **SOURCE CANDIDATE — CI + HUMAN REVIEW REQUIRED**

## Binding

C2-D.1 is rooted directly at the accepted C2-C.1 production/source baseline:

- parent commit: `ba13470f0e79f5704f229774a6c8aacc23e358f4`
- parent tree: `c953995ccf1eb2cf01d63eb5d0ffedba7f904ef9`
- feature branch: `codex/c2-d1-beta-image-pipeline`

C2-D.0 established the external compatibility prerequisite with one controlled real ImageHoster upload:

- Hive Keychain `requestSignBuffer` using Posting authority: PASS
- browser-direct `POST https://images.hive.blog/<account>/<signature>`: HTTP 200
- returned `images.hive.blog` URL: PASS
- fetched byte identity with the local PNG: PASS
- Hive broadcast during the spike: NONE

## Product scope

C2-D.1 adds **one image per draft** to these public/social surfaces:

1. community root posts;
2. personal/profile root posts;
3. Threads;
4. root replies;
5. nested replies; and
6. profile-image settings.

Explicitly outside this candidate:

- Wall messages;
- Inbox/private messages;
- video;
- galleries or multiple images;
- server-side image storage;
- deletion or lifecycle management for already-uploaded ImageHoster objects.

## Architecture

### Browser-local selection

Selecting a file creates only a browser-local preview. The file input has no form name, so the raw `File` object is not serialized into the existing social or M4 preflight payloads.

C2-D.1 accepts PNG, JPEG, WebP, or GIF up to a conservative application limit of 10 MiB. This is below the current upstream ImageHoster 20,000,000-byte limit and intentionally excludes SVG and less-portable browser formats for the beta.

### Explicit ImageHoster upload

The user must press **Upload image**. The browser then:

1. reads the authenticated Hive session to derive the account;
2. constructs the exact C2-D.0-proven signing buffer: UTF-8 `ImageSigningChallenge` followed by the raw image bytes, represented through Keychain's Buffer-compatible JSON shape;
3. asks Hive Keychain to sign that buffer with Posting authority;
4. performs one direct multipart POST to `https://images.hive.blog/<account>/<signature>`; and
5. accepts only a returned HTTPS URL whose hostname is exactly `images.hive.blog`.

This ImageHoster mutation is separate from Hive publishing. The upload status explicitly says when the image is public but the post/profile update has **not** been sent to Hive.

### No automatic retry

If the fetch crosses the POST boundary and no trustworthy response is received, that attachment enters a locked ambiguous state. C2-D.1 does not automatically retry it and blocks downstream form submission from that page.

A confirmed non-2xx ImageHoster response is reported as a confirmed failure; no automatic retry is sent.

Removing a successfully uploaded image removes it only from the current draft. The UI explicitly states that the already-uploaded ImageHoster object remains public.

### Hive operation binding

For post, Thread, and reply operations, the server—not the browser—validates the returned URL and constructs the final Hive content:

- the image URL must be HTTPS on `images.hive.blog`;
- the optional image description is bounded;
- Markdown `![description](url)` is appended to the body;
- the complete body including that image reference must remain within the existing action-specific UTF-8 byte ceiling; and
- `json_metadata.image` is added as a one-element array only when an image exists.

No-image operations retain their previous metadata/body shape exactly.

The existing social controller still owns preflight creation, exact operation/fingerprint review, Keychain broadcast, cancellation, accepted-state recording, and bounded Hive observation.

### Profile images

Profile-image upload uses the same browser upload primitive. A successful upload sets the existing `profileImage` field to the returned `images.hive.blog` URL. The already-accepted profile preflight/merge/revision logic remains responsible for the later `account_update2` review and broadcast.

An uploaded image therefore does not automatically update Hive profile metadata.

## Read path and feed preview

`normalizeContent()` now reads the conventional structured `json_metadata.image` field. Direct `images.hive.blog` URLs remain direct; other HTTPS metadata images from pre-existing Hive content are normalized through the already-established Hive image proxy boundary. Unsafe or malformed schemes are ignored.

Community/profile feed cards can show the first normalized structured image. Full posts, Threads, and replies continue using the existing sanitized Markdown renderer, which already supports safe image rendering.

## CSP and storage boundary

C2-D.1 adds only `https://images.hive.blog` to `connect-src`. `img-src` already admitted that host. It does not permit arbitrary network origins.

Image bytes are never uploaded through the Hive-Bar Express server and are never stored on the Privex VPS. Existing 32 KiB application JSON/urlencoded request limits remain unchanged.

## Frozen boundaries

This candidate does not change:

- verified-session author/voter/sender derivation;
- the 12-action beta manifest;
- social preflight storage/fingerprints/cancellation;
- Hive Keychain broadcast authority or bounded observation;
- Wall or Inbox memo/encryption semantics;
- wallet calculation or milestone semantics;
- payment or Distriator state;
- onboarding activation;
- controlled/delegated posting state;
- production environment or infrastructure;
- DNS/Cloudflare; or
- dormant V1 behavior.

## Qualification

Required before any integration recommendation:

1. deterministic Ubuntu + Windows quality gate;
2. ImageHoster client unit coverage with no live upload;
3. operation/metadata validation coverage;
4. CSP/static-asset coverage;
5. cumulative M18.2, M18.3, M18.4, UX-1A, UX-1B, UX-1C, UX-1D, UX-1E, and UX-1F visual qualification; and
6. human review of the UX-1B community-post, Thread, and reply composer evidence with the new attachment controls visible.

No production deployment or live Hive write is part of C2-D.1 source qualification.
