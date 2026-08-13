# M6 Privex public read-only runbook

Status: **prepared and unexecuted.** Nothing in this runbook authorizes a Privex purchase, cryptocurrency payment, server creation, DNS/TLS change, secret creation, Git fetch, deployment, live Hive read, or release. Each external boundary requires separate product-owner authorization.

Target contract: `ops/privex/manifest.json` — one Privex `V1-US-NVME` US West VPS, Debian 12, Caddy, and one loopback-only Hive-Bar process. Recheck the package, price, terms, and availability immediately before any purchase. Privex procurement currency is independent of Hive-Bar's write-disabled application profile.

## Safety invariants

- Public ports are SSH, HTTP, and HTTPS only; `127.0.0.1:3000` is never exposed by the firewall or provider rules.
- Caddy receives only `/etc/hive-bar/caddy.env`; it never receives the application session secret.
- `/etc/hive-bar/hive-bar.env` is `root:hivebar` mode `0640`, and its placeholder secret deliberately fails the release gate.
- The service runs as `hivebar`, never root, and the release tree is read-only to that account after installation.
- The server has no private Hive key or broadcast RPC method. `HIVE_WRITE_MODE=disabled`, controlled accounts are empty, the payment receipt database is inert, and Distriator is disabled.
- Deployment never fetches or chooses a branch. An operator separately fetches and reviews one commit, then invokes the deploy script with its full 40-character SHA.
- A failed health check restores the prior release symlink when one exists. No failed or ambiguous action is retried automatically.

## Prepared assets

| Repository asset | Intended installed path |
| --- | --- |
| `hive-bar.env.example` | `/etc/hive-bar/hive-bar.env` |
| `caddy.env.example` | `/etc/hive-bar/caddy.env` |
| `Caddyfile` | `/etc/caddy/Caddyfile` on a new dedicated host |
| `caddy-hive-bar.conf` | `/etc/systemd/system/caddy.service.d/hive-bar.conf` |
| `hive-bar.service` | `/etc/systemd/system/hive-bar.service` |
| health service/timer/alert | `/etc/systemd/system/` |
| `journald-hive-bar.conf` | `/etc/systemd/journald.conf.d/hive-bar.conf` |
| `apt-20auto-upgrades` | `/etc/apt/apt.conf.d/20auto-upgrades` after reviewing any existing policy |
| `bin/hive-bar-install-node` | `/usr/local/sbin/hive-bar-install-node` |
| `bin/hive-bar-deploy` | `/usr/local/sbin/hive-bar-deploy` |
| `bin/hive-bar-rollback` | `/usr/local/sbin/hive-bar-rollback` |
| `bin/hive-bar-healthcheck` | `/usr/local/libexec/hive-bar-healthcheck` |

Do not overwrite an existing Caddy, journald, unattended-upgrades, or firewall configuration. This contract assumes a new dedicated VPS; inspect and merge if the host is not pristine.

## Provisioning checklist — only after separate authorization

1. Provision the exact reviewed plan with Debian 12. Record the provider instance identifier, image, addresses, invoice, and current terms without placing credentials in the repository.
2. Establish key-only SSH, a named administrator with `sudo`, provider-console recovery, time synchronization, and a firewall. Confirm a second SSH session works before enabling a default-deny policy. Allow 80/443 publicly and keep 3000 closed.
3. Install only reviewed Debian packages: CA certificates, `curl`, `git`, `xz-utils`, Caddy, `unattended-upgrades`, and the tools already used by the scripts. Use the [official Caddy Debian instructions](https://caddyserver.com/docs/install#debian-ubuntu-raspbian); do not pipe a downloaded script into a shell.
4. Create the static `hivebar` system user and the exact directories in the asset table. Keep `/etc/hive-bar` `root:hivebar` mode `0750`, releases root-owned, and the bare repository root-owned.
5. Install `hive-bar-install-node`, inspect its constants, then invoke it with no arguments. It downloads the [official Node v24.19.0 Linux x64 archive](https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz), verifies SHA-256 `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`, and refuses to replace unmanaged `/usr/local/bin` files.
6. Copy the two environment examples with the ownership/modes stated above. Set one canonical lowercase hostname in both. Set `APP_ORIGIN` to exactly `https://<host>`. Generate a unique session secret of at least 32 random bytes directly into a protected editor/password-manager workflow; never place it in a command argument, chat, source file, or shell history.
7. Install and review the systemd, Caddy, health-check, log-retention, and unattended-upgrade assets. Validate Caddy's configuration before restart. Confirm Node is listening only on loopback after startup.
8. Populate `/opt/hive-bar/repository.git` through a separately authorized Git operation. Fetch one exact candidate, verify its commit and tree against the approved identities, and inspect that it is a fast-forward descendant of the accepted baseline. The deploy script intentionally performs no network fetch.
9. Run `/usr/local/sbin/hive-bar-deploy <full-commit-sha>` once. The script installs locked dependencies with lifecycle scripts disabled, explicitly applies the pinned compatibility patch, builds/prunes the release, runs `release:check:privex`, records the exact commit/tree, atomically switches `current`, and requires local write-disabled liveness.
10. Enable the health timer only after its one-shot service succeeds. Record `systemctl` status, effective hardening, journal retention, the exact current symlink, and the deployed identity files.

## Verification boundary

The deploy script checks only `/healthz`, which makes no Hive call. `/readyz`, rendered public pages, and `npm run smoke:live` contact public Hive RPC nodes and require a separately authorized read-only validation. A release record must demonstrate:

- `release:check:privex` passes with a redacted summary;
- port 3000 is loopback-only and unreachable externally;
- HTTP redirects to HTTPS and the canonical host has a valid certificate;
- controlled actions, Pay Tab preparation, and Distriator remain unavailable;
- graceful stop/restart succeeds without data mutation;
- the health timer emits a local critical journal event under a rehearsed failure; and
- rollback to one installed exact commit succeeds, followed by an explicit forward deploy—never an automatic retry.

## Operations and recovery

- Review unattended-upgrade and Hive-Bar journals regularly; the prepared journal bound is seven days and 256 MiB.
- Privex infrastructure does not replace application-owner backups. The read-only profile has no durable receipt database, but the protected environment, DNS records, instance setup record, and reviewed release identities still need an encrypted recovery record outside the VPS.
- Retain at least the current and last known-good release. The scripts deliberately do not delete releases.
- Roll back only to a full installed SHA with `/usr/local/sbin/hive-bar-rollback <full-commit-sha>`. It reruns the target gate before switching and restores the prior symlink if the target is unhealthy.
- For uncertain external state, stop, preserve logs, and observe read-only state. Do not introduce a write mode, payment, DNS change, package upgrade, or deployment retry without new authorization.

## Secret rotation

Prepare a new random secret in the protected environment file, verify owner/mode, and schedule the service restart. Rotation invalidates existing in-memory sessions by design. Never print or diff the value. Caddy does not need a restart because it cannot read the application environment file.

## Decommission boundary

Decommissioning is destructive and separately authorized. Before deletion, preserve the non-secret release/evidence record and any required encrypted configuration backup, revoke provider access, remove DNS deliberately, and verify that the exact intended instance—not a broad account scope—is selected. Provider deletion, wallet credit movement, or crypto refund activity is never implied by this runbook.
