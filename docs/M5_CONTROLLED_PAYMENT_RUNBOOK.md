# M5 controlled payment runbook

Status: deterministic and preparation procedures only. No instruction in this file authorizes a Keychain request, Hive transfer, retry, or broadcast.

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Bound merchant: `@fourthstreetbar`

Controlled invoice maximum: `1.000 HBD`

Minimum current-V4V live exit-gate amount: `0.100 HBD`, confirmed by the product owner from the physical V4V HBD receive flow on 2026-08-13

Configured claim URL: `https://distriator.com/#/claim`; keep `DISTRIATOR_ENABLED=false` until current 4th Street Bar eligibility is authoritatively confirmed.

## Non-negotiable boundaries

- Begin only from an exact published candidate commit and tree that passed deterministic CI.
- Use Node `>=24.15 <25`, a fresh detached checkout, `npm ci`, and the exact lockfile plus `hive-uri` patch.
- In V4V, select the Hive HBD payment mode, not Lightning/LNURL. Use a current invoice whose decoded recipient is exactly `@fourthstreetbar`, asset is HBD, amount is at least the current `0.100 HBD` V4V floor and no more than `1.000 HBD`, and memo is present.
- Never manually edit the decoded payer, recipient, amount, asset, or memo. Hive-Bar may resolve only V4V's exact empty payer placeholder to the already verified session account before review. Obtain a new invoice and a new authorization if any other value needs to change.
- Keychain success means **broadcast accepted**, not payment confirmed.
- Only `ChainConfirmed` after exact two-node observation may be presented as **Paid**.
- Cancellation, Keychain failure, node disagreement, missing transaction ID, and timeout do not authorize retry or rebroadcast.
- The Hive-Bar receipt supplements but does not replace the merchant's V4V/POS reconciliation.
- Distriator is external. Do not promise a percentage, eligibility, timing, approval, or payout and do not claim to track completion.

## Required authorization sequence

Use separate product-owner authorizations for each boundary:

1. **Local deterministic setup:** checkout, install, full tests, and controlled server startup; no Keychain or Hive operation.
2. **Preparation-only rehearsal:** at most one Posting sign-in if needed and local QR parsing; stop and cancel at the exact-operation dialog. No Active Keychain request.
3. **Fingerprint-bound preparation:** prepare once and keep the exact-operation dialog/process open while reporting the account, Active authority, merchant, amount, memo summary, exact JSON, and fingerprint. No Active request yet.
4. **Exact live operation:** separately authorize exactly the prepared fingerprint and exactly one Active Keychain request/broadcast. Bind candidate commit/tree, payer, `@fourthstreetbar`, amount, memo, operation JSON, and fingerprint. No retry.
5. **Observation only:** observe the returned transaction ID on independently selected configured nodes, require exact equality, preserve pending/timeout/disagreement honestly, and reconcile the durable receipt with V4V/POS.

No earlier authorization carries forward to a later step.

## PowerShell controlled setup template

Run the entire `try`/`finally` construct as one pasted block. A standalone `finally` is not valid PowerShell.

```powershell
$ErrorActionPreference = "Stop"
$originalLocation = Get-Location
$serverProcess = $null
$controlledEnvNames = @(
    "NODE_ENV",
    "APP_ORIGIN",
    "SESSION_SECRET",
    "HIVE_WRITE_MODE",
    "HIVE_CONTROLLED_ACCOUNTS",
    "HIVE_PAYMENT_MERCHANT_ACCOUNTS",
    "HIVE_PAYMENT_MAX_HBD",
    "HIVE_PAYMENT_RECEIPT_DB_PATH",
    "HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS",
    "DISTRIATOR_ENABLED",
    "DISTRIATOR_CLAIM_URL"
)
$priorEnv = @{}
foreach ($envName in $controlledEnvNames) {
    $priorEnv[$envName] = [Environment]::GetEnvironmentVariable($envName, "Process")
}

try {
    # Replace these placeholders only after a candidate-specific run command is supplied.
    $env:NODE_ENV = "development"
    $env:APP_ORIGIN = "http://localhost:3000"
    $env:SESSION_SECRET = "<fresh-random-value-of-at-least-32-bytes>"
    $env:HIVE_WRITE_MODE = "controlled"
    $env:HIVE_CONTROLLED_ACCOUNTS = "<authorized-payer>"
    $env:HIVE_PAYMENT_MERCHANT_ACCOUNTS = "fourthstreetbar"
    $env:HIVE_PAYMENT_MAX_HBD = "1.000 HBD"
    $env:HIVE_PAYMENT_RECEIPT_DB_PATH = "<explicit-temporary-receipt-sqlite-path>"
    $env:HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS = "120000"
    $env:DISTRIATOR_ENABLED = "false"
    $env:DISTRIATOR_CLAIM_URL = "https://distriator.com/#/claim"

    npm ci
    npm run check
    # Start the server only after the exact candidate identity and clean tree are verified.
    # Stop at the authorization boundary specified for the particular run.
}
finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
        Wait-Process -Id $serverProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    foreach ($envName in $controlledEnvNames) {
        [Environment]::SetEnvironmentVariable($envName, $priorEnv[$envName], "Process")
    }
    Set-Location $originalLocation
    $ErrorActionPreference = "Continue"
    Write-Host "Cleanup complete." -ForegroundColor Green
}
```

The final candidate-specific command set must create its temporary checkout and receipt path under a validated temporary directory and must remove them only after the browser and server are closed. Never use an unresolved environment variable, wildcard, home directory, project root, or broad recursive target for cleanup.

## Exact preparation review

Before any Active request, report and compare:

- published candidate commit and tree;
- full deterministic test count and result;
- signed-in payer;
- confirmation that an exact empty V4V payer placeholder, if present, resolved only to that signed-in payer;
- authority exactly `Active`;
- recipient exactly `fourthstreetbar`;
- asset exactly `HBD`;
- amount with exactly three decimals and within `1.000 HBD`;
- memo exactly as supplied by the current V4V/POS invoice;
- exactly one `transfer` and no extra operation;
- 64-character operation fingerprint; and
- confirmation that the dialog still remains open and Keychain has not received an Active request.

If anything differs, cancel. Do not repair the operation in place and do not retry under the same authorization.

## Post-broadcast evidence

If and only if an exact live authorization is granted and consumed, preserve:

- Keychain transaction ID and non-sensitive outcome text;
- Hive-Bar receipt ID, fingerprint, `BroadcastAccepted` state, and absence of premature **Paid** text;
- exact two-node transaction correlation, block, transaction index, timestamp, and matching operation;
- `ChainConfirmed` receipt and **Paid** transition only after corroboration;
- merchant V4V/POS reconciliation result;
- Distriator action state and external-service disclosure; and
- cleanup confirmation.

If the transaction ID is absent, nodes disagree, the exact operation is missing, or the confirmation window expires, retain the pending receipt, use only **Recheck Hive**, and stop. Never suggest paying again until the original transaction has been reconciled.
