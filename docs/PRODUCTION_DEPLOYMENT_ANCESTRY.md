# Production deployment source/deployment ancestry

## Purpose

The canonical production deployment harness distinguishes two identities that are usually the same but are not required to be:

- `Release.OldCommit` is the exact application release currently installed in production before a deployment. Its tree/build continue to govern production entry, `last-good`, read-only qualification, rollback/fail-closed behavior, and Resume semantics.
- `Release.SourceParentCommit` is the exact immediate Git parent of `Release.NewCommit` when accepted source-only commits exist between the deployed application and the next deploy target.

`SourceParentCommit` is optional. When it is omitted, the harness resolves it to `OldCommit`, preserving the original direct-child binding behavior exactly.

## GitHub preflight

Before any remote mutation, the harness requires:

1. the exact bound new commit and tree;
2. exactly one immediate Git parent, equal to resolved `SourceParentCommit`;
3. a GitHub compare result from `OldCommit` to `NewCommit` whose base is `OldCommit`;
4. a merge base equal to `OldCommit`;
5. comparison status `ahead`, `ahead_by >= 1`, and `behind_by = 0`.

Together those checks prove that the actually deployed old release is a strict Git ancestor of the target while separately proving the target's immediate source parent. A wrong immediate parent is rejected. A divergent or merely related history is rejected.

The harness does not accept an arbitrary skipped commit, a sibling branch, or a merge-base approximation as production ancestry.

## Production semantics are unchanged

This remediation does not change the remote deployment sequence. `OldCommit`, `OldTree`, and `OldBuild` remain the production identities used by the remote payload.

In particular:

- Deploy still requires the exact old commit/tree to be installed at entry;
- the accepted beta environment is still preserved byte-for-byte;
- the old release is still qualified under the accepted read-only environment before deployment;
- the deployment helper is still invoked at most once, only by `Deploy`;
- `last-good` must still point to the exact deployed old release;
- Resume still requires the exact new release already installed and the exact deployed old release at `last-good`;
- fail-closed behavior and the accepted read-only environment remain unchanged;
- an ambiguous deployment failure still means **do not automatically retry**.

No application feature, Hive operation, signing authority, moderation rule, environment value, storage path, systemd state, payment/onboarding/controlled-delegated lane, DNS/Cloudflare setting, or dormant V1 behavior is changed by this ancestry model.

## Binding guidance

For an ordinary direct-child deployment, omit `SourceParentCommit`:

```powershell
Release = @{
    OldCommit = '<deployed-old-commit>'
    OldTree = '<deployed-old-tree>'
    OldBuild = 'beta-<old>'
    NewCommit = '<direct-child>'
    NewTree = '<new-tree>'
    ExpectedBuild = 'beta-<new>'
}
```

For an accepted ancestry gap caused only by integrated source that was intentionally not deployed, bind the immediate source parent explicitly while leaving `OldCommit` bound to the real installed release:

```powershell
Release = @{
    OldCommit = '<actually-deployed-old-commit>'
    OldTree = '<actually-deployed-old-tree>'
    OldBuild = 'beta-<old>'
    SourceParentCommit = '<immediate-parent-of-new-commit>'
    NewCommit = '<deploy-target>'
    NewTree = '<new-tree>'
    ExpectedBuild = 'beta-<new>'
}
```

The explicit source parent does not authorize skipping arbitrary application releases. The GitHub ancestry proof only establishes source lineage; the release-specific operator still has to decide that the bound production transition is authorized and appropriate.
