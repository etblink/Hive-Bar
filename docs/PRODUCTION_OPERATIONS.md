# Hive-Bar Production Operations

This is the living production operations document. Historical M6/M14/M16/M17 runbooks remain evidence for their milestones but do not supersede this current model.

## Current production state

- canonical host: `https://fourthstreetbar.com`
- provider/topology: one Privex Debian 13 VPS behind Cloudflare and Caddy
- Node listener: `127.0.0.1:3000`
- runtime: Node `24.19.0`, npm `11.17.0`
- service: `hive-bar.service`
- health: `/healthz`
- readiness: `/readyz`
- deployed source and operational wiring: accepted M17.3
- current accepted write mode: beta self-signing through local Hive Keychain
- accepted beta action set: post, comment, vote, wall, inbox
- V1 gate: accepted in a temporary non-persistent M17.3 rehearsal; V1 service activation was not performed
- payments and Distriator: disabled
- controlled/operator/delegated state: inert

## Deployment invariant

Source deployment remains read-only gated even when beta or V1 is the accepted runtime profile.

1. Preserve the accepted active environment.
2. Temporarily activate the accepted read-only environment.
3. Deploy one exact reviewed commit with `/usr/local/sbin/hive-bar-deploy <full-sha>`.
4. Verify exact commit/tree, local health/readiness, and versioned first-party assets while writes are disabled.
5. Restore only the separately accepted runtime environment byte-for-byte.
6. Verify the corresponding release gate and public read-only edge behavior.

Never automatically retry an ambiguous deployment or external mutation.

## Release profiles

### `privex-public-read-only`

Safe deployment and rollback baseline. Hive writes and signing are disabled.

### `privex-beta-self-signing`

Current accepted production profile. Users sign only their own accepted beta operations locally through Keychain.

### `privex-v1-self-signing`

M17.3 wired this profile into the reviewed Privex startup path and operationally qualified the real gate without persistent activation. The exact V1 action manifest remains defined in `src/v1/actions.js`. Direct/unqualified production-mode loading remains refused; only an explicitly V1-enabled loader may parse `HIVE_WRITE_MODE=production`, and `scripts/start-privex.js` must pass `assertPrivexV1Release()` before starting the server.

Runtime wiring and a successful temporary gate rehearsal do not authorize production activation. Production remains beta until a separately authorized transition changes the persistent environment.

Controlled operator posting and controlled payment profiles remain separate procedures and are not implicit V1 capabilities.

## Liveness and readiness

`/healthz` is process identity/liveness. The local health timer verifies `status=ok`, `service=hive-bar`, `environment=production`, and one recognized runtime write mode (`disabled`, `beta`, `production`, or `controlled`). It does not decide whether that profile is authorized.

Authorization correctness is fail-closed at service startup through the exact release gate selected by `scripts/start-privex.js`. `/readyz` separately verifies a bounded Hive read call. The monitoring timer must never issue Hive writes or mutate external infrastructure.

## Exact release and rollback bookkeeping

Every installed release lives under `/opt/hive-bar/releases/<full-commit-sha>` and carries `.hive-bar-commit` and `.hive-bar-tree` identity records. Exact rollback remains an explicit operator action requiring a full installed commit SHA while the read-only deployment environment is active; no implicit rollback target is selected from user-controlled input.

The M17.3 post-rehearsal host audit found `/opt/hive-bar/last-good` unresolved, so current operations must not rely on that pointer. This does not block explicit exact-SHA rollback. The M17.4 candidate changes the reviewed deployment helper so a future exact deployment atomically repairs `/opt/hive-bar/last-good` to the validated release that was current immediately before a distinct source switch. That source change is not a production mutation by itself and does not retroactively repair the host; any host-side reconciliation remains separately authorized.

## Secrets and keys

The VPS stores the application session secret but no Hive private key. Hive signing remains in the user's local Keychain extension. Never print, commit, or transmit the session secret through routine diagnostics.

## Exact release evidence

For every accepted production transition retain:

- exact source commit and tree;
- relevant CI run identity;
- environment SHA-256 values without secret contents;
- release-gate summary;
- health/readiness result;
- versioned asset identity;
- public edge result;
- rollback identity or preserved prior environment as applicable.

M17.3 operational acceptance established the V1 gate only in a temporary process environment, restored the accepted beta environment byte-for-byte, retained Pay/Distriator disabled, and made no Hive or Keychain write during the rehearsal.

## Monitoring and recovery

The local health timer is observational and must never issue Hive writes or restart external infrastructure. Exact deployment rollback is explicit and operator-authorized. Retain at least the current and one independently identified prior release. For ambiguous state, observe first and obtain fresh authorization before any new mutation.

M17.4 is a pre-final source qualification milestone. It may freeze the functional baseline and improve future release bookkeeping, but it does not authorize V1 production activation, a package/version promotion to `1.0.0`, a `main` fast-forward, or deletion/retirement of unrelated repository state without a separate authorization.
