# Hive-Bar

Hive-Bar is a focused Hive community experience for 4th Street Bar in Reno, Nevada. M2 is accepted. The current M3 candidate adds server-verified Hive Keychain identity and controlled social operations while retaining the complete public read-only experience.

Normal operation remains write-disabled. The server can verify signatures and prepare exact operations, but it has no private keys, signing path, or broadcast RPC method. Every controlled write requires an explicit preflight review and confirmation in the user's Hive Keychain extension.

## Fixed configuration and M3 boundary

| Item | Value |
| --- | --- |
| Community | `hive-108590` |
| Production threads container | `fourthst.threads` |
| Bar address | `1114 E. 4th Street, Reno, NV 89512` |
| Bar hours | Daily, 12:00 p.m.–2:00 a.m. |
| Default write mode | `disabled` |
| Authorized controlled mode | `controlled`, with an explicit account allowlist |
| Runtime | Node.js 24 |

Production startup requires the business facts, target identifiers, application origin, a 32-byte-or-longer session secret, write mode, and at least three credential-free HTTPS RPC nodes to be set explicitly. `HIVE_WRITE_MODE=production` is rejected in M3.

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
| `GET /healthz` | Process liveness without a Hive call |
| `GET /readyz` | Hive-backed readiness |
| `POST /auth/challenge` | Single-use, origin-bound Keychain login challenge |
| `POST /auth/verify` | Current posting-authority signature verification and secure session creation |
| `GET /auth/session` | Current server-verified session and in-memory CSRF token |
| `POST /auth/logout` | CSRF-protected session destruction |
| `POST /api/social/preflight/:action` | Controlled exact-operation preparation for the eight M3 social actions |
| `POST /api/social/preflight/:id/accepted` | Records Keychain broadcast acceptance and transaction id |
| `POST /api/social/preflight/:id/observe` | Read-only on-chain observation; no optimistic completion |

## Quality gates

```sh
npm run check
```

The deterministic gate runs the secret scan, ESLint, production CSS build, 81 Node tests, and high-severity production dependency audit. M3 coverage includes challenge replay/expiry, current and delegated posting authorities, secure sessions, CSRF/origin checks, all eight operation golden vectors, UTF-8 limits, duplicate protection, cancellation, mocked Keychain journeys, transaction-id capture, and read-only observation. Existing fixture, XSS, accessibility, and responsive gates remain intact.

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

- `src/hive/read-service.js` owns normalized Bridge, condenser, and RC reads.
- `src/hive/read-methods.js` is the transport-level read allowlist.
- `src/auth/` owns one-use challenges, signature verification, and opaque server sessions.
- `src/hive/social-operations.js` owns the pure, exact social operation builders.
- `src/social/preflight-store.js` binds controlled operations to verified sessions and blocks duplicates.
- `public/js/keychain-adapter.js` is the only browser Keychain boundary.
- `src/hive/wallet.js` contains deterministic HP and regenerated manabar calculations.
- `src/hive/milestones.js` is the single tested beer-themed HP threshold table.
- `src/content/markdown.js` is the Markdown/XSS boundary.
- `routes/` and `views/` provide complete HTML with HTMX fragment enhancement.
- `test/fixtures/hive/` records deterministic production-shaped RPC data.

See [docs/M3_VERIFIED_IDENTITY_SOCIAL_WRITES.md](docs/M3_VERIFIED_IDENTITY_SOCIAL_WRITES.md) for the implementation boundary, [docs/M3_CONTROLLED_WRITE_RUNBOOK.md](docs/M3_CONTROLLED_WRITE_RUNBOOK.md) for the mandatory live procedure, and [docs/M3_VERIFICATION_EVIDENCE.md](docs/M3_VERIFICATION_EVIDENCE.md) for the gate record. The accepted M2 remains documented in [docs/M2_READ_ONLY_SLICE.md](docs/M2_READ_ONLY_SLICE.md) and [docs/M2_ACCEPTANCE_EVIDENCE.md](docs/M2_ACCEPTANCE_EVIDENCE.md).

## Roadmap boundary

M3 covers only verified identity and the eight social actions: post, thread, comment, vote, follow, unfollow, subscribe, and unsubscribe. Profile updates, rewards, wall/inbox transfers, tab payments, and every financial operation remain disabled for later milestones. No controlled live write has been authorized merely by enabling or testing this code; each live operation still requires its own product-owner authorization and Keychain confirmation.
