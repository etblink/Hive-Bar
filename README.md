# Hive-Bar

Hive-Bar is a focused Hive community experience for 4th Street Bar in Reno, Nevada. The M2 read-only vertical slice now includes the truthful bar landing page, production-shaped community and thread states, paginated posts, full discussions, public profiles, and public wallet summaries with beer-themed presentation.

M2 does not log users in, request signatures, or write to Hive. The RPC transport rejects every method outside an explicit read allowlist before a network request is made.

## Fixed M2 configuration

| Item | Value |
| --- | --- |
| Community | `hive-108590` |
| Production threads container | `fourthst.threads` |
| Bar address | `1114 E. 4th Street, Reno, NV 89512` |
| Bar hours | Daily, 12:00 p.m.–2:00 a.m. |
| Write mode | `disabled` |
| Runtime | Node.js 24 |

Production startup requires the business facts, target identifiers, write mode, and at least three credential-free HTTPS RPC nodes to be set explicitly.

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

## Read-only routes

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

## Quality gates

```sh
npm run check
```

The deterministic gate runs the secret scan, ESLint, production CSS build, 47 Node tests, and high-severity production dependency audit. Tests include recorded Hive fixtures, the one-post `hive-108590` shape, empty `fourthst.threads`, stored XSS, RPC write rejection, wallet reference math, HTML validation, axe serious/critical checks, contrast tokens, and a 360 CSS-pixel responsive contract.

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
- `src/hive/wallet.js` contains deterministic HP and regenerated manabar calculations.
- `src/hive/milestones.js` is the single tested beer-themed HP threshold table.
- `src/content/markdown.js` is the Markdown/XSS boundary.
- `routes/` and `views/` provide complete HTML with HTMX fragment enhancement.
- `test/fixtures/hive/` records deterministic production-shaped RPC data.

See [docs/M2_READ_ONLY_SLICE.md](docs/M2_READ_ONLY_SLICE.md) for the implementation boundary and [docs/M2_ACCEPTANCE_EVIDENCE.md](docs/M2_ACCEPTANCE_EVIDENCE.md) for the current gate record. M1 remains documented in [docs/M1_FOUNDATION.md](docs/M1_FOUNDATION.md).

## Roadmap boundary

Verified Keychain identity and controlled social writes begin in M3 only after product-owner authorization. No current route signs, broadcasts, claims rewards, transfers assets, changes profiles, follows accounts, or subscribes to a community.
