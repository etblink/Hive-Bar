# Hive-Bar

Hive-Bar is a focused Hive blockchain frontend for the 4th Street Bar. Canonical `main` is the accepted M18.3 source at commit `524732a18559858bf20d2976cb5b791d6eaa36c8` (tree `ea2c5742f65669f8e5842fc2b357da821e893325`). Production still runs the accepted M17.3 deployed source with the beta self-signing runtime; M18.3 has not been deployed.

## Current functional boundary

The accepted beta write manifest remains exactly `post`, `comment`, `vote`, `wall`, and `inbox`, with every user-owned write reviewed before one local Hive Keychain request and independently observed afterward. No server private key or broadcast RPC method exists, and automatic rebroadcast is prohibited.

M17.1 froze the intended patron-facing V1 functional set. V1 adds already implemented deterministic social/profile operations to the self-signing release boundary: `post`, `thread`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `profile`, `wall`, and `inbox`. Reward claiming, Pay Tab activation, Distriator, controlled operator posting, delegated staff posting, and additional wallet operations remain outside the V1 release gate.

M17 is complete. M18.3 is accepted in source. It completed the current Home, Wall, and Pay experience redesign and deterministic visual qualification without changing transaction semantics. The next source milestone is M18.4 beta-readiness closure: repair the proven Followers/Following empty-state render defect, close bounded patron-copy and living-document gaps, and add targeted patron-surface qualification before any separate controlled beta deployment.

See `docs/ROADMAP.md` for the only living milestone roadmap and `docs/README.md` for the documentation index.

## Production topology

Production is one Privex Debian 13 VPS behind Cloudflare and Caddy. Node listens only on `127.0.0.1:3000`. The pinned runtime is Node.js `24.19.0` with npm `11.17.0`. Exact-commit deployment is deliberately read-only gated before any separately authorized beta/V1 activation.

Current operations guidance lives in `docs/PRODUCTION_OPERATIONS.md`. Historical milestone documents remain preserved as evidence and should not be treated as current runbooks unless the documentation index says otherwise.

## Local development

Prerequisites: Node.js `24.19.0` and npm `11.17.0`.

```sh
git clone https://github.com/etblink/Hive-Bar.git
cd Hive-Bar
cp .env.example .env
npm ci
npm run build
npm start
```

Development mode rebuilds CSS and watches the Node process with `npm run dev`.

## Deterministic quality gates

Run `npm run check` for the credential scan, release/documentation coherence checks, M17 functional-baseline check, ESLint, production CSS build, deterministic tests, and high-severity production dependency audit. Visual acceptance remains separately qualified by the pinned-Chromium M18.2, M18.3, and M18.4 jobs.

Useful release checks include `release:check:runtime`, `release:check:read-only`, `release:check:privex`, `release:check:beta`, `release:check:v1`, and `release:check:functional-v1`. Production activation still requires separate explicit authorization.

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

Canonical `main` is the accepted M18.3 source identity above. Production remains separately pinned to accepted M17.3. M18.4 work must be a child of the accepted M18.3 source and must not implicitly deploy source, activate V1, enable payments/Distriator, change infrastructure, or perform a Hive/Keychain operation.

## Licensing

No open-source license is granted for this repository. All rights are reserved by the copyright holder.
