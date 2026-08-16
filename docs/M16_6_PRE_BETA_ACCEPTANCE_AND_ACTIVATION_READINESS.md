# M16.6 Pre-Beta Acceptance and Production-Activation Readiness

## Status and scope

M16.6 is a source-only readiness milestone rooted in the accepted M16.5 integration. It does not deploy source, edit the production environment, restart the service, invoke Hive Keychain, broadcast a Hive operation, activate payments/Distriator, or modify Cloudflare, DNS, Caddy, systemd, or other host state.

The beta feature boundary is frozen to exactly five self-signed actions:

1. `post`
2. `comment`
3. `vote`
4. `wall`
5. `inbox`

`thread`, follow/unfollow, subscribe/unsubscribe, profile edits, reward claims, payment broadcasts, controlled/operator posting, delegated posting, and production write mode remain outside this beta gate.

## Readiness findings

### Production startup blocker corrected

Before M16.6, `scripts/start-privex.js` sent every non-`controlled` write mode through the read-only Privex gate. A valid `HIVE_WRITE_MODE=beta` configuration therefore failed because the read-only gate correctly requires `disabled`.

M16.6 adds `assertPrivexBetaRelease()` and routes only `beta` startup through that gate. Read-only and all historical controlled gates remain separate and unchanged.

### One canonical beta action manifest

`src/beta/actions.js` defines the exact five-action manifest. The generic UI authorization helper uses that manifest in beta mode. Historical milestone route subsets remain as defense-in-depth:

- M16.2 config subset: `post`, `comment`
- M16.3 social extension: `vote`
- M16.4 M4 extension: `wall`, `inbox`

Regression coverage proves their union is exactly the canonical manifest and nothing else.

### Desktop/mobile acceptance

The signed-in beta pages are exercised through structural HTML validation and serious/critical axe accessibility checks. The automated responsive contract also preserves:

- 320 CSS-pixel minimum support;
- safe-area padding for the mobile bottom navigation;
- 44px minimum interactive targets;
- the existing 640px content breakpoint;
- the existing 1024px desktop navigation-rail breakpoint;
- reduced-motion handling;
- no newly introduced fixed-width element contract above the narrow viewport floor.

This is an automated acceptance gate, not a claim that every physical browser/device has been manually tested.

## Exact beta release gate

`npm run release:check:beta` must pass before a beta service restart. The gate requires all of the following at once:

- `NODE_ENV=production`;
- `HIVE_BAR_HOST=fourthstreetbar.com`;
- `APP_ORIGIN=https://fourthstreetbar.com`;
- `BIND_HOST=127.0.0.1`;
- `PORT=3000`;
- `TRUST_PROXY=loopback`;
- at least three distinct HTTPS Hive RPC nodes;
- `HIVE_WRITE_MODE=beta`;
- `HIVE_SIGNER_MODE=keychain`;
- `HIVE_CONTROLLED_ACCOUNTS=` empty;
- `HIVE_CONTROLLED_ACTIONS=` empty;
- no M9/M10/M12 pilot, operator-arm, audit, merchant-author, or delegated-signer state;
- `DISTRIATOR_ENABLED=false`;
- the Pay broadcast lane disabled;
- the accepted Hive-Bar application tag;
- the payment receipt path either `:memory:` or the already reviewed non-symlink durable receipt path;
- a non-placeholder production session secret.

The gate returns a summary naming profile `privex-beta-self-signing` and the exact five beta actions.

## Deployment discipline

The installed `/usr/local/sbin/hive-bar-deploy` workflow is intentionally a **read-only deployment gate**: it runs `scripts/check-privex-release.js` and requires `/healthz` to report `writeMode=disabled`.

M16.6 deliberately does not weaken that property. Source deployment and beta activation therefore remain two separate operations.

### Phase A — deploy accepted M16.6 source while still read-only

After M16.6 is accepted and integrated, a separately authorized production deployment must occur with the existing production environment still set to:

```text
HIVE_WRITE_MODE=disabled
HIVE_SIGNER_MODE=disabled
HIVE_CONTROLLED_ACCOUNTS=
HIVE_CONTROLLED_ACTIONS=
DISTRIATOR_ENABLED=false
```

Use the existing exact-commit deployment helper. Acceptance requires the deployed commit/tree identity, `systemctl` health, `/healthz` reporting `writeMode=disabled`, `/readyz` ready, and public read-only pages working. Do not combine this deployment with beta activation.

### Phase B — separately activate beta

Only after Phase A is accepted should a separately authorized activation change the protected environment to:

```text
HIVE_WRITE_MODE=beta
HIVE_SIGNER_MODE=keychain
HIVE_CONTROLLED_ACCOUNTS=
HIVE_CONTROLLED_ACTIONS=
DISTRIATOR_ENABLED=false
```

All other reviewed production topology and identity values remain unchanged.

The safe activation order is:

1. preserve a root-owned, mode-protected copy/hash of the accepted read-only environment;
2. stage the beta environment change atomically while the currently running process remains read-only;
3. run `npm run release:check:beta` as the service account against the staged/current protected environment;
4. if the gate fails, restore the read-only environment without restarting the service;
5. if the gate passes, restart only `hive-bar.service`;
6. require `http://127.0.0.1:3000/healthz` to report `status=ok`, `environment=production`, and `writeMode=beta`;
7. require `/readyz` to report ready;
8. verify the public site over HTTPS and confirm payments/Distriator remain unavailable;
9. perform any live Keychain/Hive-write acceptance only under a new, explicit authorization naming the accounts/actions/amounts involved.

No failed or ambiguous Keychain action is automatically retried.

## Rollback

The first rollback control is the environment, not source history.

If beta must be stopped, restore:

```text
HIVE_WRITE_MODE=disabled
HIVE_SIGNER_MODE=disabled
HIVE_CONTROLLED_ACCOUNTS=
HIVE_CONTROLLED_ACTIONS=
DISTRIATOR_ENABLED=false
```

Run the read-only release check, restart `hive-bar.service`, and require `/healthz` to report `writeMode=disabled`. This removes all beta write UI/authorization without changing the deployed source.

If a source rollback is also required, **first confirm read-only mode is restored**, then use the existing `hive-bar-rollback` helper to a previously installed accepted commit. The rollback helper intentionally remains read-only-gated; it must not be used while the protected environment says `beta`.

## M16.6 source acceptance criteria

M16.6 source is acceptable only if:

- the candidate descends exactly from accepted M16.5;
- the canonical beta manifest is exactly the five actions above;
- the beta Privex release gate passes the reviewed production fixture and rejects unsafe variants;
- existing M16.2/M16.3/M16.4 behavioral regressions still pass;
- signed-in beta surfaces pass structural/accessibility checks;
- the responsive contract passes;
- both Ubuntu and Windows deterministic CI gates pass;
- no production deployment or activation occurs during candidate preparation.
