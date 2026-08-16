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

M17.2 defines this profile as a dormant source gate only. Runtime activation is not authorized until later M17 acceptance. The V1 manifest is defined in `src/v1/actions.js`.

Controlled operator posting and controlled payment profiles remain separate procedures and are not implicit V1 capabilities.

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

M17.3 will reconcile the historical read-only wording/assumptions in the installed health-check assets with the accepted multi-profile operating model before V1 runtime activation.
