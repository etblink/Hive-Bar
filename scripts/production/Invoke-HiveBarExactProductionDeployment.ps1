<#
.SYNOPSIS
  Fourth Street Bar exact-production deployment harness.

.DESCRIPTION
  Preserves the production deployment invariant as code. Release-specific values live in a
  PowerShell data file. The harness has three explicit operations:

    Observe - read-only observation of an already-installed candidate. Never mutates the host.
    Deploy  - one exact deployment from the bound old release to the bound new release.
    Resume  - resumes qualification of an already-installed new release without invoking the
              deployment helper.

  Deploy and Resume require -AuthorizeProductionMutation. That switch is only an accidental-run
  guard; it is not a substitute for explicit human authorization.

  Critical invariants:
    * the beta gate is never called while the read-only environment is active;
    * the deployment helper can be invoked only by Operation=Deploy and at most once;
    * Resume never invokes the deployment helper;
    * an ambiguous deployment failure is never automatically retried;
    * after a mutation-phase qualification failure, the accepted read-only environment is
      reinstalled and the service is restarted once to fail closed;
    * the preserved beta-environment copy is retained after successful qualification and is
      removed only by a separately authorized cleanup action;
    * public qualification is data-driven from release bindings so anonymous and authenticated
      surfaces are not conflated.

  This harness does not perform Hive broadcasts, Hive Keychain requests, ImageHoster uploads,
  payment actions, onboarding activation, controlled/delegated posting, DNS/Cloudflare changes,
  or dormant V1 activation.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BindingsPath,

    [ValidateSet('Observe', 'Deploy', 'Resume')]
    [string]$Operation = 'Observe',

    [switch]$AuthorizeProductionMutation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib/HiveBarDeployment.Bindings.ps1')
. (Join-Path $PSScriptRoot 'lib/HiveBarDeployment.Execution.ps1')

$resolvedBindings = (Resolve-Path -LiteralPath $BindingsPath).Path
$Bindings = Import-PowerShellDataFile -LiteralPath $resolvedBindings
Assert-Bindings $Bindings

if ($Operation -in @('Deploy', 'Resume') -and -not $AuthorizeProductionMutation) {
    throw "$Operation requires -AuthorizeProductionMutation. This switch does not replace explicit human authorization."
}

if ($Operation -eq 'Observe' -and $AuthorizeProductionMutation) {
    Write-Warning '-AuthorizeProductionMutation is ignored for Observe; Observe contains no host mutation.'
}

Assert-GitHubReleaseBinding $Bindings

$keyPath = Resolve-ConfiguredPath ([string]$Bindings.Production.SshKeyPath)
$knownHostsPath = Resolve-ConfiguredPath ([string]$Bindings.Production.KnownHostsPath)
if (-not (Test-Path -LiteralPath $keyPath)) {
    throw "SSH key not found: $keyPath"
}
if (-not (Test-Path -LiteralPath $knownHostsPath)) {
    throw "SSH known_hosts file not found: $knownHostsPath"
}

$target = "$($Bindings.Production.RemoteUser)@$($Bindings.Production.Host)"
$sshArguments = @(
    '-i', $keyPath,
    '-o', 'IdentitiesOnly=yes',
    '-o', "UserKnownHostsFile=$knownHostsPath",
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'BatchMode=yes'
)

Write-Host '=== FOURTH STREET BAR EXACT PRODUCTION HARNESS ==='
Write-Host "MILESTONE=$($Bindings.Release.Milestone)"
Write-Host "OPERATION=$Operation"
Write-Host "EXPECTED_NEW_COMMIT=$($Bindings.Release.NewCommit)"
Write-Host "EXPECTED_NEW_TREE=$($Bindings.Release.NewTree)"
Write-Host "EXPECTED_BUILD=$($Bindings.Release.ExpectedBuild)"
Write-Host 'DEPLOY_HELPER_AUTO_RETRY=DISABLED'
Write-Host 'PRESERVED_BETA_CLEANUP=SEPARATE_AUTHORIZATION'

$remoteScript = New-RemoteScript -Bindings $Bindings -Operation $Operation
$remoteOutput = Invoke-RemotePayload -RemoteScript $remoteScript -Target $target -SshArguments $sshArguments -Operation $Operation

$activeModeLine = $remoteOutput | Where-Object { $_ -like 'ACTIVE_ENV_MODE=*' } | Select-Object -Last 1
$activeMode = if ($activeModeLine) { $activeModeLine.Substring('ACTIVE_ENV_MODE='.Length) } else { $null }
$mutationLine = $remoteOutput | Where-Object { $_ -like 'MUTATION_PERFORMED=*' } | Select-Object -Last 1
$mutationPerformed = if ($mutationLine) { $mutationLine.Substring('MUTATION_PERFORMED='.Length) } else { 'UNKNOWN' }

if ($Operation -eq 'Observe' -and $activeMode -eq 'read-only') {
    Write-Host 'PUBLIC_QUALIFICATION=SKIPPED_ACTIVE_READ_ONLY'
    Write-Host 'OBSERVE_COMPLETE=PASS'
    exit 0
}

try {
    Invoke-PublicQualification $Bindings
}
catch {
    if ($Operation -in @('Deploy', 'Resume') -and $mutationPerformed -eq 'YES') {
        Write-Host 'PUBLIC_QUALIFICATION_FAILED=YES'
        Write-Host 'FAIL_CLOSED_READ_ONLY=BEGIN'
        Invoke-FailClosedReadOnly -Bindings $Bindings -Target $target -SshArguments $sshArguments
        Write-Host 'PRESERVED_BETA_ENV_RETAINED=YES'
        Write-Host 'DO_NOT_AUTOMATICALLY_RETRY=YES'
    }
    elseif ($Operation -in @('Deploy', 'Resume')) {
        Write-Host 'PUBLIC_QUALIFICATION_FAILED=YES'
        Write-Host "FAIL_CLOSED_READ_ONLY=SKIPPED_NO_MUTATION_IN_THIS_INVOCATION mode=$mutationPerformed"
        Write-Host 'DO_NOT_AUTOMATICALLY_RETRY=YES'
    }
    throw
}

Write-Host ''
Write-Host 'PRODUCTION_HARNESS_QUALIFICATION=PASS'
Write-Host "MILESTONE=$($Bindings.Release.Milestone)"
Write-Host "BUILD=$($Bindings.Release.ExpectedBuild)"
Write-Host "COMMIT=$($Bindings.Release.NewCommit)"
Write-Host "TREE=$($Bindings.Release.NewTree)"
Write-Host 'HIVE_WRITE=NONE'
Write-Host 'KEYCHAIN_REQUEST=NONE'
Write-Host 'IMAGEHOSTER_UPLOAD=NONE'
Write-Host 'PAYMENT_MUTATION=NONE'
Write-Host 'ONBOARDING_ACTIVATION=NONE'
Write-Host 'CONTROLLED_DELEGATED_MUTATION=NONE'
Write-Host 'DNS_CLOUDFLARE_MUTATION=NONE'
Write-Host 'V1_ACTIVATION=NONE'
Write-Host 'PRESERVED_BETA_ENV_RETAINED=YES'
