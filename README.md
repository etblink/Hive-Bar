# Hive-Bar

Hive-Bar is a focused Hive blockchain frontend for the 4th Street Bar. The accepted production deployment is M16.8 beta at `fourthstreetbar.com`; this M17.2 source candidate reconciles the current source of truth and prepares the dormant V1 release gate without changing production or enabling additional Hive writes.

## Current functional boundary

The accepted beta write manifest remains exactly `post`, `comment`, `vote`, `wall`, and `inbox`, with every user-owned write reviewed before one local Hive Keychain request and independently observed afterward. No server private key or broadcast RPC method exists, and automatic rebroadcast is prohibited.

M17.1 froze the intended patron-facing V1 functional set. V1 will add already implemented deterministic social/profile operations to the self-signing release boundary: `post`, `thread`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `profile`, `wall`, and `inbox`. Reward claiming, Pay Tab activation, Distriator, controlled operator posting, delegated staff posting, and additional wallet operations remain outside the V1 release gate.

See `docs/ROADMAP.md` for the only living milestone roadmap and `docs/README.md` for the documentation index.

## Production topology

Production is one Privex Debian 13 VPS behind Cloudflare and Caddy. Node listens only on `127.0.0.1:3000`. The pinned runtime is Node.js `24.19.0` with npm `11.17.0`. Exact-commit deployment is deliberately read-only gated before any separately authorized beta/V1 activation.

Current operations guidance lives in `docs/PRODUCTION_OPERATIONS.md`. Historical milestone documents remain preserved as evidence and should not be treated as current runbooks unless the documentation index says otherwise.

## Local development

Prerequisites:

- Node.js `24.19.0`
- npm `11.17.0`

```sh
git clone https://github.com/etblink/Hive-Bar.git
cd Hive-Bar
cp .env.example .env
npm ci
npm run build
npm start
```

Development mode rebuilds CSS and watches the Node process:

```sh
npm run dev
```

## Deterministic quality gates

```sh
npm run check
```

The complete gate runs the credential scan, release/documentation coherence checks, ESLint, production CSS build, deterministic tests, and high-severity production dependency audit.

Useful release checks include:

```sh
npm run release:check:runtime
npm run release:check:read-only
npm run release:check:privex
npm run release:check:beta
npm run release:check:v1
```

`release:check:v1` is a non-network, dormant M17.2 qualification gate. M17.2 does **not** wire `HIVE_WRITE_MODE=production` into the running server; activation remains blocked until a later, separately accepted M17 milestone.

## Primary surfaces

- `/` — venue information and official updates
- `/community` — community information and posts
- `/community/threads` — thread surface
- `/post/:author/:permlink` — post and replies
- `/profile/:username` — public profile
- `/profile/:username/wallet` — read-only wallet/HP/reward information
- `/profile/:username/followers` and `/following` — social graph
- `/profile/:username/wall-posts` — public fee-qualified wall messages
- `/profile/:username/inbox` — verified-owner encrypted inbox
- `/profile/:username/settings` — verified-owner profile/wall settings
- `/healthz` and `/readyz` — liveness and Hive-backed readiness

## Safety invariants

- user identity is server-verified from Hive authority and a local Keychain signature;
- write operations are prepared deterministically and reviewed before signing;
- the server stores no private Hive key and exposes no broadcast method;
- private Inbox plaintext is encrypted client-side before the transfer memo reaches the server;
- a Keychain-accepted operation is never automatically rebroadcast;
- post-broadcast confirmation is read-only and can be rechecked without preparing a new operation;
- first-party browser assets use runtime-byte SHA-256 versioning;
- payments, Distriator, controlled/operator lanes, and delegated staff authority are not part of V1 self-signing.

## Repository governance

The accepted development lineage currently lives on `codex/m6-read-only-release-readiness`; M17.4 is intended to reconcile that lineage to `main` by exact fast-forward after the functional V1 baseline is accepted. Do not infer that the stale public `main` branch represents current production until that milestone is complete.

## Licensing

No open-source license is granted for this repository. All rights are reserved by the copyright holder. The absence of an open-source license is intentional while Hive-Bar is developed toward future venue/brand deployments.
