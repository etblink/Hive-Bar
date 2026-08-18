# Hive-Bar

Hive-Bar is a focused Hive blockchain frontend for the 4th Street Bar. Canonical `main` and production are aligned on the accepted M19.1 source at commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4` (tree `1a4bb993ad59ca67032997d8938696a079a71e1f`). M19.2 deployed that exact source to `fourthstreetbar.com` under the already accepted beta self-signing runtime.

## Current functional boundary

The accepted beta write manifest remains exactly `post`, `comment`, `vote`, `wall`, and `inbox`, with every user-owned write reviewed before one local Hive Keychain request and independently observed afterward. No server private key or broadcast RPC method exists, and automatic rebroadcast is prohibited.

M17.1 froze the intended patron-facing V1 functional set. V1 adds already implemented deterministic social/profile operations to the self-signing release boundary: `post`, `thread`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `profile`, `wall`, and `inbox`. Reward claiming, Pay Tab activation, Distriator, controlled operator posting, delegated staff posting, and additional wallet operations remain outside the V1 release gate.

M17 is complete. M18 is accepted through M18.4. M19.1 completed the final patron copy/onboarding-readiness pass and M19.2 deployed it exactly under beta. The current source milestone is M19.3 in-person Hive onboarding: customer-side credential generation/recovery, opaque one-time bartender QR requests, cash-first staff review, claimed-account creation plus fixed starter-HP delegation through staff Keychain, and read-only post-broadcast observation. M19.3 is disabled by default and source qualification does not authorize a live account creation or delegation.

See `docs/ROADMAP.md` for the only living milestone roadmap and `docs/README.md` for the documentation index.

## Production topology

Production is one Privex Debian 13 VPS behind Cloudflare and Caddy. Node listens only on `127.0.0.1:3000`. The pinned runtime is Node.js `24.19.0` with npm `11.17.0`. Exact-commit deployment is deliberately read-only gated before restoration of any separately accepted beta/V1 runtime environment.

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
- `/create-account` — in-person Hive account onboarding entry point (inactive until separately enabled)
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
- M19.3 customer account credentials are generated in-browser and only public keys may be submitted to Hive-Bar;
- the M19.3 bartender transaction is separately gated, Active-authority Keychain-signed, and locked to one attempt before Keychain opens;
- a Keychain-accepted or ambiguous operation is never automatically rebroadcast;
- post-broadcast confirmation is read-only and can be rechecked without preparing a new operation;
- first-party browser assets use runtime-byte SHA-256 versioning;
- payments, Distriator, controlled/operator lanes, and delegated staff authority are not part of V1 self-signing.

## Repository governance

Canonical `main` and production are pinned to the accepted M19.1 source identity above. M19.2 is accepted. M19.3 is a source-only onboarding milestone until separately accepted, integrated, deployed, and activated. It does not implicitly consume an account-creation token, create an account, delegate HP, collect tester cash, activate V1, enable payments/Distriator, or change infrastructure.

## Licensing

No open-source license is granted for this repository. All rights are reserved by the copyright holder.
