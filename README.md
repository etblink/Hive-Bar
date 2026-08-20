# Hive-Bar

Hive-Bar is a focused Hive blockchain frontend for the 4th Street Bar. Canonical integrated source is `main`; because `main` advances independently of production, its exact commit/tree must be resolved from GitHub at the time of qualification or release. The deployed beta reports its own exact build label, commit, and tree through `/healthz` after R0 is deployed. M19.2 remains the historical deployment event that put accepted M19.1 source at commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4` (tree `1a4bb993ad59ca67032997d8938696a079a71e1f`) on `fourthstreetbar.com` under the accepted beta self-signing runtime; living documentation must not infer the current runtime identity from that historical event.

## Current functional boundary

Canonical source currently defines the beta write manifest in `src/beta/actions.js` as exactly `post`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `claim-rewards`, `wall`, `inbox`, and `thread`. Every user-owned write is reviewed before one local Hive Keychain request and independently observed afterward. No server private key or broadcast RPC method exists, and automatic rebroadcast is prohibited. The action set actually available to a tester is determined by the exact deployed beta build and runtime profile, so bind tester reports to the visible beta build label rather than inferring runtime behavior from this moving branch.

The dormant V1 source manifest in `src/v1/actions.js` contains `post`, `thread`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `profile`, `claim-rewards`, `wall`, and `inbox`. Pay Tab activation, Distriator, controlled operator posting, delegated staff posting, and additional wallet operations remain outside that V1 self-signing gate. The product itself remains beta until iterative testing supports an explicit V1 graduation decision.

M17 is complete. M18 is accepted through M18.4. M19.1 completed the final patron copy/onboarding-readiness pass and M19.2 deployed it exactly under beta. Later integrated source has advanced beyond that historical deployment boundary; runtime identity must therefore be established from the deployed release rather than this narrative. M19.3 in-person Hive onboarding remains disabled by default and source qualification does not authorize a live account creation or delegation.

See `docs/ROADMAP.md` for the living milestone roadmap and `docs/README.md` for the documentation index.

## Production topology

Production is one Privex Debian 13 VPS behind Cloudflare and Caddy. Node listens only on `127.0.0.1:3000`. The pinned runtime is Node.js `24.19.0` with npm `11.17.0`. Exact-commit deployment is deliberately read-only gated before restoration of any separately accepted beta runtime environment.

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

Development mode rebuilds CSS and watches the Node process with `npm run dev`. Non-release development/test application construction reports the explicit non-production build label `beta-dev`; it never fabricates a production commit or tree.

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
- `/healthz` and `/readyz` — liveness/build identity and Hive-backed readiness

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

Canonical integrated source is `main`; never equate a moving branch with production by documentation assertion. Production identity is the exact commit/tree installed in `/opt/hive-bar/current`, surfaced as `beta-<short-sha>` in the application shell and as full build/commit/tree fields in `/healthz`. Historical deployment records remain evidence of past transitions, not substitutes for runtime identity. No source milestone implicitly consumes an account-creation token, creates an account, delegates HP, collects tester cash, graduates the product from beta to V1, enables payments/Distriator, or changes infrastructure.

## Licensing

No open-source license is granted for this repository. All rights are reserved by the copyright holder.
