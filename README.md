# Hive-Bar

Hive-Bar is a focused Hive community experience for 4th Street Bar in Reno, Nevada. M1–M3 are accepted. The current M4 candidate adds safe profile settings, followers/following, reward claims, paid public wall messages, and a Keychain-encrypted owner inbox while retaining the accepted public and social features.

Normal operation remains write-disabled. The server verifies identity, reads authoritative Hive state, and prepares exact operations, but it has no private keys, signing path, decrypted inbox plaintext, or broadcast RPC method. Every controlled write requires an exact preflight review and confirmation in the user's local Hive Keychain extension.

## Fixed configuration and M4 boundary

| Item | Value |
| --- | --- |
| Community | `hive-108590` |
| Production threads container | `fourthst.threads` |
| Bar address | `1114 E. 4th Street, Reno, NV 89512` |
| Bar hours | Daily, 12:00 p.m.–2:00 a.m. |
| Default wall fee | `1.000 HBD` |
| Sender exclusions | Profile-managed list plus a server-global list that defaults to empty |
| Default write mode | `disabled` |
| Authorized controlled mode | `controlled`, with an explicit account allowlist |
| Runtime | Node.js 24 |

Production startup requires the business facts, target identifiers, wall fee, application origin, a 32-byte-or-longer session secret, write mode, and at least three credential-free HTTPS RPC nodes to be set explicitly. `HIVE_WRITE_MODE=production` remains rejected before the V1 release gate.

## Run locally

Prerequisites: Node.js 24 and npm 11 or newer.

```sh
git clone https://github.com/etblink/Hive-Bar.git
cd Hive-Bar
cp .env.example .env
npm ci --ignore-scripts
npm run build
npm start
```

Open `http://localhost:3000`. Development mode rebuilds CSS once and watches the Node process:

```sh
npm run dev
```

## Primary routes

| Route | Surface |
| --- | --- |
| `GET /` | Bar facts, community entry, and clearly marked pending owner photos |
| `GET /community` | Community information and paginated/sortable posts |
| `GET /community/threads` | Current production thread container or intentional sparse state |
| `GET /post/:author/:permlink` | Full sanitized post and flattened reply discussion |
| `GET /profile/:username` | Public profile and paginated blog posts |
| `GET /profile/:username/wallet` | Public balances, HP, regenerated RC/voting power, rewards, and beer visuals |
| `GET /profile/:username/wall-posts` | Classified, fee-qualified, marked public wall messages |
| `GET /profile/:username/followers` | Public follower list |
| `GET /profile/:username/following` | Public following list |
| `GET /profile/:username/inbox` | Verified-owner-only encrypted inbox with local Keychain decryption |
| `GET /profile/:username/settings` | Verified-owner-only stale-safe profile and wall settings |
| `GET /healthz` | Process liveness without a Hive call |
| `GET /readyz` | Hive-backed readiness |
| `POST /auth/challenge` | Single-use, origin-bound Keychain login challenge |
| `POST /auth/verify` | Current posting-authority signature verification and secure session creation |
| `GET /auth/session` | Current server-verified session and in-memory CSRF token |
| `POST /auth/logout` | CSRF-protected session destruction |
| `POST /api/social/preflight/:action` | Controlled exact-operation preparation for the eight M3 social actions |
| `POST /api/m4/preflight/:action` | Controlled preparation for profile, reward, wall, or inbox operations |
| `POST /api/*/preflight/:id/accepted` | Records Keychain broadcast acceptance and transaction id |
| `POST /api/*/preflight/:id/observe` | Observes the exact transaction through read-only Hive RPC; no optimistic completion |

## Quality gates

```sh
npm run check
```

The deterministic gate runs the secret scan, ESLint, production CSS build, 109 Node tests, and high-severity production dependency audit. M4 coverage adds exact asset parsing, non-destructive metadata merge/conflict behavior, current reward claims, fee revalidation, both sender-exclusion layers, message classification and cursors, owner authorization, local-only memo encryption/decryption, exact transaction observation, and controlled browser journeys. Existing fixture, XSS, accessibility, responsive, identity, and M3 operation gates remain intact.

| Command | Purpose |
| --- | --- |
| `npm test` | Deterministic unit, HTTP, XSS, accessibility, and responsive tests |
| `npm run test:coverage` | The same suite with Node coverage |
| `npm run smoke:live` | Explicit live read-only check of configured Hive targets |
| `npm run lint` | Server, browser, test, and script JavaScript checks |
| `npm run build` | Minified Tailwind CSS build |
| `npm run check:secrets` | Targeted repository credential scan |
| `npm run audit:prod` | High/critical production dependency gate |

Normal CI never depends on public Hive availability. A manual GitHub Actions dispatch runs `smoke:live` after the deterministic job; the same RPC allowlist blocks all broadcast and unknown methods.

## Structure

- `src/hive/read-service.js` owns normalized Bridge, condenser, RC, account-history, and transaction reads.
- `src/hive/read-methods.js` is the transport-level read allowlist.
- `src/auth/` owns one-use challenges, signature verification, and opaque server sessions.
- `src/hive/social-operations.js` owns the pure, exact M3 social operation builders.
- `src/hive/m4-operations.js` owns exact profile, reward, wall, and inbox operation builders.
- `src/hive/profile-settings.js` owns safe metadata parsing, owned-field merge, validation, and revision conflicts.
- `src/hive/messages.js` owns versioned markers, exact asset thresholds, exclusions, classification, and cursors.
- `src/social/preflight-store.js` binds controlled operations to verified sessions and blocks duplicates.
- `public/js/keychain-adapter.js` is the browser Keychain boundary; `public/js/m4-actions.js` keeps inbox plaintext local.
- `src/hive/wallet.js` contains deterministic HP and regenerated manabar calculations.
- `src/hive/milestones.js` is the single tested beer-themed HP threshold table.
- `src/content/markdown.js` is the Markdown/XSS boundary.
- `routes/` and `views/` provide complete HTML with HTMX fragment enhancement.
- `test/fixtures/hive/` records deterministic production-shaped RPC data.

See [docs/M4_PROFILES_REWARDS_WALL_INBOX.md](docs/M4_PROFILES_REWARDS_WALL_INBOX.md) for the implementation boundary, [docs/M4_CONTROLLED_WRITE_RUNBOOK.md](docs/M4_CONTROLLED_WRITE_RUNBOOK.md) for the mandatory live procedure, and [docs/M4_VERIFICATION_EVIDENCE.md](docs/M4_VERIFICATION_EVIDENCE.md) for the gate record. Accepted M3 remains documented in [docs/M3_VERIFIED_IDENTITY_SOCIAL_WRITES.md](docs/M3_VERIFIED_IDENTITY_SOCIAL_WRITES.md) and [docs/M3_VERIFICATION_EVIDENCE.md](docs/M3_VERIFICATION_EVIDENCE.md).

## Roadmap boundary

M4 adds only profile settings, reward claims, public wall transfers, and encrypted inbox transfers. Tab payments, arbitrary transfers, conversions, markets, delegation, power-up, power-down, and production write mode remain disabled for later gates. Deterministic M4 completion does not authorize a live profile update, reward claim, wall transfer, or inbox transfer; each operation still requires its own exact product-owner authorization and Keychain confirmation.
