# Hive-Bar Production Operations

This is the living production operations document. Historical M6/M14/M16 runbooks remain evidence for their milestones but do not supersede this current model.

## Current production state

- canonical host: `https://fourthstreetbar.com`
- provider/topology: one Privex Debian 13 VPS behind Cloudflare and Caddy
- Node listener: `127.0.0.1:3000`
- runtime: Node `24.19.0`, npm `11.17.0`
- service: `hive-bar.service`
- health: `/healthz`
- readiness: `/readyz`
- exact source currently accepted in production before M17 work: M16.8
- current accepted write mode: beta self-signing through local Hive Keychain
- accepted beta action set: post, comment, vote, wall, inbox
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

M17.3 wires this profile into the reviewed Privex startup path. The exact V1 action manifest remains defined in `src/v1/actions.js`. Direct/unqualified production-mode loading remains refused; only an explicitly V1-enabled loader may parse `HIVE_WRITE_MODE=production`, and `scripts/start-privex.js` must pass `assertPrivexV1Release()` before starting the server.

Runtime wiring does not itself authorize production activation. Production remains beta until a separately authorized transition changes the active environment.

Controlled operator posting and controlled payment profiles remain separate procedures and are not implicit V1 capabilities.

## Liveness and readiness

`/healthz` is process identity/liveness. The local health timer verifies `status=ok`, `service=hive-bar`, `environment=production`, and one recognized runtime write mode (`disabled`, `beta`, `production`, or `controlled`). It does not decide whether that profile is authorized.

Authorization correctness is fail-closed at service startup through the exact release gate selected by `scripts/start-privex.js`. `/readyz` separately verifies a bounded Hive read call. The monitoring timer must never issue Hive writes or mutate external infrastructure.

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

## Monitoring and recovery

The local health timer is observational and must never issue Hive writes or restart external infrastructure. Exact deployment rollback is explicit and operator-authorized. Retain at least the current and last known-good release. For ambiguous state, observe first and obtain fresh authorization before any new mutation.

M17.3 operational acceptance should rehearse the real V1 release gate without changing the persistent production environment, invoking Keychain, or broadcasting to Hive. Only a later separately authorized activation may place the service in V1 production mode.
