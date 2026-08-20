# Hive-Bar Production Operations

This is the living production operations document. Historical M6/M14/M16/M17/M19 runbooks remain evidence for their milestones but do not supersede this current model.

## Current production state

- canonical host: `https://fourthstreetbar.com`
- provider/topology: one Privex Debian 13 VPS behind Cloudflare and Caddy
- Node listener: `127.0.0.1:3000`
- runtime: Node `24.19.0`, npm `11.17.0`
- service: `hive-bar.service`
- health: `/healthz`
- readiness: `/readyz`
- canonical repository source: moving branch `main`; resolve its exact commit/tree from GitHub at qualification time
- canonical-source beta manifest: `post`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `claim-rewards`, `wall`, `inbox`, `thread`
- last recorded accepted production transition: M19.2 deployed M19.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`, tree `1a4bb993ad59ca67032997d8938696a079a71e1f`
- Runtime source identity: `/healthz` publishes the exact deployed beta build label, commit, and tree after R0 deployment; the installed release files remain the operator-side source of truth
- current accepted write mode: beta self-signing through local Hive Keychain
- historical M19.2 deployed beta action set: post, comment, vote, wall, inbox
- accepted beta environment SHA-256 after M19.2: `831dfeac7523fc7484bb0c1d19c9c6060c8ff20ac4e20ce487a904c2f02bd4c2`
- V1 gate: accepted in a temporary non-persistent M17.3 rehearsal; V1 service activation was not performed
- payments and Distriator: disabled
- controlled/operator/delegated state: inert
- in-person onboarding: not production-activated; M19.3 is source-only
- `/opt/hive-bar/current`: exact installed release selected by symlink; verify its `.hive-bar-commit` and `.hive-bar-tree`
- `/opt/hive-bar/last-good`: last recorded M19.2 boundary was exact prior accepted M17.3 release `9409c8698e04c3b62f7361f29fc91f785ae7739b`; verify the live symlink before any operation

Do not infer current production source or the live action manifest from a historical milestone statement. After R0 is deployed, the shell's `beta-<short-sha>` label is the tester-facing build identifier and `/healthz` is the public full identity. Before R0 deployment, use a read-only operator check of the installed release identity files.

## Deployment invariant

Source deployment remains read-only gated even when beta or a future release profile is the accepted runtime profile.

1. Preserve the accepted active environment.
2. Temporarily activate the accepted read-only environment.
3. Deploy one exact reviewed commit with `/usr/local/sbin/hive-bar-deploy <full-sha>`.
4. Verify exact commit/tree/build identity, local health/readiness, and versioned first-party assets while writes are disabled.
5. Restore only the separately accepted runtime environment byte-for-byte.
6. Verify the corresponding release gate and public edge behavior.

Never automatically retry an ambiguous deployment or external mutation.

M19.2 followed this invariant to deploy exact M19.1. The accepted beta environment was restored byte-for-byte after the read-only source switch, and the prior M17.3 release remained the validated rollback target at that event. That is historical deployment evidence, not a claim about the currently installed release after later transitions.

## Release profiles

### `privex-public-read-only`

Safe deployment and rollback baseline. Hive writes and signing are disabled.

### `privex-beta-self-signing`

Current accepted production profile. Users sign only their own accepted beta operations locally through Keychain. The exact permitted actions come from the deployed source's beta manifest; bind that source first.

### `privex-v1-self-signing`

M17.3 wired this profile into the reviewed Privex startup path and operationally qualified the real gate without persistent activation. The exact dormant V1 action manifest remains defined in `src/v1/actions.js`. Direct/unqualified production-mode loading remains refused; only an explicitly V1-enabled loader may parse `HIVE_WRITE_MODE=production`, and `scripts/start-privex.js` must pass `assertPrivexV1Release()` before starting the server.

Runtime wiring and a successful temporary gate rehearsal do not authorize production activation. Production remains beta until a separately authorized transition changes the persistent environment after beta testing supports graduation.

Controlled operator posting and controlled payment profiles remain separate procedures and are not implicit V1 capabilities.

## M19.3 onboarding boundary

M19.3 introduces a separate staff-assisted onboarding capability; it is not implicitly added to the accepted beta self-signing manifest by source deployment. Source defaults remain:

```text
HIVE_ONBOARDING_ENABLED=false
HIVE_ONBOARDING_CREATOR_ACCOUNT=
HIVE_ONBOARDING_STARTER_HP=5.000
HIVE_ONBOARDING_REQUEST_TTL_MS=900000
```

Even when configured, onboarding is active only while the persistent application runtime is the accepted `beta` + `keychain` profile. The ordinary read-only deployment phase therefore keeps onboarding inert.

A future onboarding activation is a separately authorized protected-environment change. Before that activation, require exact source acceptance/integration, a named creator account, a deliberate starter-HP policy, a bounded token/account/delegation maximum, and the M19.3 release/operational checks. Source deployment alone must not collect cash, consume an account-creation token, open an Active Keychain request, create an account, or delegate HP.

For long-term public use, prefer a dedicated onboarding creator/delegator account with owner authority kept offline. Use of `@etblink` for one controlled acceptance remains a separate, explicit authorization rather than a source default.

## Liveness, build identity, and readiness

`/healthz` is process liveness plus deployment identity. For an installed production release it reports:

- `status`;
- `service`;
- `environment`;
- `writeMode`;
- deterministic beta `build` label;
- full deployed `commit`;
- full deployed `tree`.

A real production startup is fail-closed when `.hive-bar-commit` or `.hive-bar-tree` is absent, incomplete, or malformed. Ordinary development/test application construction that is not an installed release uses `beta-dev` rather than fabricating production identity; full commit/tree fields are published only for an exact installed release.

Authorization correctness remains fail-closed at service startup through the exact release gate selected by `scripts/start-privex.js`. `/readyz` separately verifies a bounded Hive read call. The monitoring timer must never issue Hive writes or mutate external infrastructure.

## Exact release and rollback bookkeeping

Every installed release lives under `/opt/hive-bar/releases/<full-commit-sha>` and carries `.hive-bar-commit` and `.hive-bar-tree` identity records. The runtime derives `beta-<first-seven-commit-characters>` from that exact commit.

The deployment and rollback helpers verify the release identity against the reviewed bare repository, require `/healthz` to report the expected build/commit/tree after the service switch, and log the exact build, commit, tree, UTC event time, and commit subject. Exact rollback remains an explicit operator action requiring one full installed commit SHA while the read-only deployment environment is active; no implicit rollback target is selected from user-controlled input.

The deployment helper preserves the prior validated current release as `/opt/hive-bar/last-good` immediately before a distinct source switch. Explicit rollback remains full-SHA and read-only gated rather than implicitly selecting `last-good`.

## Secrets and keys

The VPS stores the application session secret but no Hive private key. Normal patron Hive signing remains in the user's local Keychain extension.

M19.3 preserves the same rule for onboarding: customer private credentials are generated locally in the customer's browser and only public keys may reach Hive-Bar; creator Active authority remains in the bartender's Keychain environment. Never print, commit, transmit, or log a customer recovery record, customer private key, creator private key, or the application session secret.

## Exact release evidence

For every accepted production transition retain:

- exact source commit and tree;
- deterministic beta build label;
- UTC deployment/rollback event time and commit subject;
- relevant CI run identity;
- environment SHA-256 values without secret contents;
- release-gate summary;
- health/readiness result;
- versioned asset identity;
- public edge result;
- rollback identity or preserved prior environment as applicable.

M19.2 historically retained:

- deployed commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`;
- deployed tree `1a4bb993ad59ca67032997d8938696a079a71e1f`;
- accepted beta environment SHA-256 `831dfeac7523fc7484bb0c1d19c9c6060c8ff20ac4e20ce487a904c2f02bd4c2`;
- `current` at the exact M19.1 release at that event;
- `last-good` at exact M17.3 at that event;
- local and public `writeMode=beta` health;
- local Hive-backed readiness;
- public first-party asset revisions matching the deployed release.

No V1 activation, Pay/Distriator activation, Keychain request, or Hive write was part of M19.2.

## Minimal beta tester provenance

Use a tester-visible build label such as `beta-af25ac8`, never a V1 label.

A tester report should need only:

- visible beta build label;
- report time;
- route/surface;
- device/browser;
- observation.

The build label binds the report to the full commit/tree available from `/healthz` and the deployment event evidence. This is sufficient to distinguish beta build B from later B+1 without adding unnecessary tester bureaucracy.

## Monitoring and recovery

The local health timer is observational and must never issue Hive writes or restart external infrastructure. Exact deployment rollback is explicit and operator-authorized. Retain at least the current and one independently identified prior release. For ambiguous state, observe first and obtain fresh authorization before any new mutation.

M17 and M18 historical release evidence remains preserved. M19.1 and M19.2 remain accepted historical source/deployment events; M19.3 onboarding remains not production-activated. No source milestone implicitly activates onboarding, graduates beta to V1, changes payments, or authorizes a Hive/Keychain write.
