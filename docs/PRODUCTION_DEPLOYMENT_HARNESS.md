# Fourth Street Bar exact-production deployment harness

The canonical production deployment procedure is:

- `scripts/production/Invoke-HiveBarExactProductionDeployment.ps1`
- release bindings under `scripts/production/bindings/`
- `scripts/production/deployment-bindings.example.psd1` as the schema example.

The harness exists so a future milestone does not reconstruct production deployment logic from chat
history or an old milestone-specific script.

## Operating model

Release-specific facts belong in a binding file. The engine owns the invariant.

The engine supports exactly three operations:

| Operation | Production mutation | Deployment helper |
| --- | --- | --- |
| `Observe` | none | never |
| `Deploy` | yes, only inside the accepted deployment invariant | exactly once |
| `Resume` | only if the installed candidate is still in accepted read-only mode; otherwise none | never |

`Deploy` and `Resume` require `-AuthorizeProductionMutation`. The switch is only a mechanical
accidental-run guard. It does **not** replace explicit human authorization.

Example read-only observation:

```powershell
pwsh ./scripts/production/Invoke-HiveBarExactProductionDeployment.ps1 `
  -BindingsPath ./scripts/production/bindings/c2-d1-accepted.psd1 `
  -Operation Observe
```

Example full deployment after explicit authorization:

```powershell
pwsh ./scripts/production/Invoke-HiveBarExactProductionDeployment.ps1 `
  -BindingsPath ./scripts/production/bindings/<milestone>.psd1 `
  -Operation Deploy `
  -AuthorizeProductionMutation
```

Example recovery after an interrupted deployment where the exact candidate is already installed:

```powershell
pwsh ./scripts/production/Invoke-HiveBarExactProductionDeployment.ps1 `
  -BindingsPath ./scripts/production/bindings/<milestone>.psd1 `
  -Operation Resume `
  -AuthorizeProductionMutation
```

Never use `Deploy` to finish qualification of a release that is already installed. Use `Resume`.

## Frozen deployment invariant

Before a deployment mutation, the harness independently verifies the bound GitHub commit, tree,
single parent, `main` identity when required, and successful CI run. On the host it then requires
the exact old release and exact accepted beta environment.

`Deploy` performs this sequence:

1. Verify the exact old release and beta environment.
2. Preserve the beta environment byte-for-byte.
3. Install the accepted read-only environment and restart the service.
4. Qualify the old release under the read-only gate.
5. Invoke `/usr/local/sbin/hive-bar-deploy <exact-sha>` **once**.
6. Qualify the exact new commit/tree/build under read-only mode, including release-specific source
   assertions and loopback-only binding.
7. Require `last-good` to point to the exact old release.
8. Restore the preserved accepted beta environment and restart the service.
9. Only now run the beta release gate and require the exact 12-action beta manifest, Keychain
   signer mode, disabled payments/Distriator, and inert controlled/delegated state.
10. Run release-specific public-edge checks.
11. Retain the preserved beta-environment copy until separately authorized post-acceptance cleanup.

If a mutation-phase check fails, the harness attempts to reinstall the accepted read-only
environment and stops. It prints `DO_NOT_AUTOMATICALLY_RETRY=YES`. The deployment helper is never
automatically called again.

If public qualification fails after beta restoration **and this invocation performed a production
mutation**, the harness returns the service to accepted read-only mode and stops. If `Resume`
started with the exact beta environment already active and performed no mutation, a public-check
failure does not mutate production; it stops for operator review instead. Public checks must therefore be source-bound and must not assume that
anonymous requests contain authenticated controls.

## Resume semantics

`Resume` exists specifically for the C2-D.1 lesson: qualification failures must not cause a
deployment replay.

It requires:

- the exact bound new commit and tree already installed;
- `last-good` still pointing to the bound old commit;
- the exact preserved beta-environment copy;
- active environment bytes equal to either accepted read-only or accepted beta bytes.

If the host is read-only, `Resume` completes the read-only checks, restores beta once, restarts once,
then runs beta/public qualification. If the host is already in exact beta mode, it skips the restart
and performs qualification only. It never invokes the deployment helper.

## Public checks

Public checks are defined in each release binding. This is deliberate. The application has
session-dependent controls, so the canonical harness does not hard-code generic expectations such as
"Create post must appear on anonymous `/community`."

Use:

- `Json` checks for `/healthz`, `/readyz`, and other structured endpoints;
- `Html` `Contains` for unconditional public markers;
- `Html` `AnyContains` when a route has accepted populated/empty states;
- `Html` `NotContains` for boundaries that must remain inert;
- `ContainsHeader` for bounded response-header contracts such as CSP.

The C2-D.1 accepted binding is retained as a regression fixture and production evidence.

## Excluded authority

The harness does not authorize or automate:

- Hive broadcasts;
- Hive Keychain signing;
- ImageHoster uploads;
- payments or Distriator;
- onboarding activation;
- controlled/delegated posting activation;
- DNS or Cloudflare changes;
- infrastructure changes outside the deployment invariant;
- dormant V1 activation;
- deletion of the preserved beta environment.

Those remain separately governed.

## C2-D.1 incident incorporated into the canonical engine

C2-D.1 exposed two harness defects in milestone-specific scripts:

1. a beta-only gate was called while the host was intentionally read-only;
2. a PowerShell variable named `$Home` collided case-insensitively with the built-in read-only
   `$HOME`.

The canonical engine prevents the first structurally: the beta gate occurs only after beta
restoration (or in `Resume`/`Observe` when the active environment hash is already the accepted beta
hash). It avoids the second by never assigning `$Home`.

A later C2-D.1 public verifier also incorrectly required an authenticated composer marker from an
anonymous Community request. The canonical engine therefore makes public expectations
release-specific data rather than global assumptions.

## Accepted C2-D.1 regression binding

`scripts/production/bindings/c2-d1-accepted.psd1` freezes:

- old commit `ba13470f0e79f5704f229774a6c8aacc23e358f4`;
- old tree `c953995ccf1eb2cf01d63eb5d0ffedba7f904ef9`;
- old build `beta-ba13470`;
- accepted commit `5f3fbaea0395f583435d901ccc7faa0801240e7a`;
- accepted tree `08fa1ca6e871f32430550f2a24f7f8788f68a62e`;
- build `beta-5f3fbae`;
- accepted beta/read-only environment hashes;
- CI run 250 / run id `32539607927`;
- the exact 12 beta actions;
- C2-D.1 media/CSP source and public qualification markers;
- C2-C.1 Wallet regression and onboarding-inert public boundaries.

The binding contains no credentials or private key material. It stores only the expected local key
path, never key contents.
