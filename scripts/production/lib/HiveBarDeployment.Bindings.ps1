function Resolve-ConfiguredPath {
    param([Parameter(Mandatory)][string]$Path)

    if ($Path.StartsWith('~/') -or $Path.StartsWith('~\')) {
        return Join-Path $HOME $Path.Substring(2)
    }

    return [Environment]::ExpandEnvironmentVariables($Path)
}

function Require-String {
    param(
        [Parameter(Mandatory)][hashtable]$Map,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Context
    )

    if (-not $Map.ContainsKey($Name) -or
        $null -eq $Map[$Name] -or
        [string]::IsNullOrWhiteSpace([string]$Map[$Name])) {
        throw "Missing required binding: $Context.$Name"
    }

    return [string]$Map[$Name]
}

function Assert-Sha256 {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$Name)
    if ($Value -notmatch '^[0-9a-f]{64}$') {
        throw "$Name must be a lowercase 64-character SHA-256."
    }
}

function Assert-GitSha {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$Name)
    if ($Value -notmatch '^[0-9a-f]{40}$') {
        throw "$Name must be a lowercase 40-character Git SHA."
    }
}

function ConvertTo-BashSingleQuoted {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)
    return "'" + ($Value -replace "'", "'\''") + "'"
}

function Invoke-JsonGet {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [int]$Attempts = 3
    )

    $headers = @{
        'Accept' = 'application/vnd.github+json, application/json'
        'User-Agent' = 'Hive-Bar-production-deployment-harness'
        'Cache-Control' = 'no-cache'
    }

    $lastError = $null
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            return Invoke-RestMethod -Uri $Uri -Headers $headers -TimeoutSec 45
        }
        catch {
            $lastError = $_.Exception.Message
        }

        if ($attempt -lt $Attempts) {
            Start-Sleep -Seconds 2
        }
    }

    throw "Read-only HTTP GET failed after $Attempts attempts: $Uri :: $lastError"
}

function Assert-GitHubReleaseBinding {
    param([Parameter(Mandatory)][hashtable]$Bindings)

    $repo = Require-String $Bindings.GitHub 'Repository' 'GitHub'
    $release = $Bindings.Release
    $newCommit = Require-String $release 'NewCommit' 'Release'
    $newTree = Require-String $release 'NewTree' 'Release'
    $oldCommit = Require-String $release 'OldCommit' 'Release'
    $ciRunId = [long]$Bindings.GitHub.CiRunId
    $ciRunNumber = [long]$Bindings.GitHub.CiRunNumber

    $commit = Invoke-JsonGet "https://api.github.com/repos/$repo/commits/$newCommit"
    if ([string]$commit.sha -ne $newCommit) {
        throw "GitHub commit identity mismatch: expected $newCommit"
    }
    if ([string]$commit.commit.tree.sha -ne $newTree) {
        throw "GitHub tree identity mismatch: expected $newTree, got $($commit.commit.tree.sha)"
    }
    if ($commit.parents.Count -ne 1 -or [string]$commit.parents[0].sha -ne $oldCommit) {
        throw "GitHub parent identity mismatch: expected one parent $oldCommit"
    }

    if ($Bindings.GitHub.RequireMainCommit) {
        $main = Invoke-JsonGet "https://api.github.com/repos/$repo/branches/main"
        if ([string]$main.commit.sha -ne $newCommit) {
            throw "GitHub main is not the exact bound release: expected $newCommit, got $($main.commit.sha)"
        }
    }

    if ($ciRunId -le 0 -or $ciRunNumber -le 0) {
        throw 'GitHub.CiRunId and GitHub.CiRunNumber must be positive.'
    }

    $run = Invoke-JsonGet "https://api.github.com/repos/$repo/actions/runs/$ciRunId"
    if ([string]$run.head_sha -ne $newCommit -or [long]$run.run_number -ne $ciRunNumber) {
        throw "CI binding mismatch for run $ciRunId."
    }
    if ([string]$run.status -ne 'completed' -or [string]$run.conclusion -ne 'success') {
        throw "CI run $ciRunId is not completed/success."
    }

    Write-Host "GITHUB_RELEASE_BINDING=PASS commit=$newCommit tree=$newTree parent=$oldCommit"
    Write-Host "GITHUB_CI_BINDING=PASS run=$ciRunId number=$ciRunNumber"
}

function Assert-Bindings {
    param([Parameter(Mandatory)][hashtable]$Bindings)

    foreach ($section in @('Release', 'GitHub', 'Production', 'Environment', 'Qualification')) {
        if (-not $Bindings.ContainsKey($section) -or $Bindings[$section] -isnot [hashtable]) {
            throw "Binding section '$section' is required and must be a hashtable."
        }
    }

    $release = $Bindings.Release
    foreach ($name in @('Milestone', 'OldCommit', 'OldTree', 'OldBuild', 'NewCommit', 'NewTree', 'ExpectedBuild')) {
        [void](Require-String $release $name 'Release')
    }
    Assert-GitSha $release.OldCommit 'Release.OldCommit'
    Assert-GitSha $release.OldTree 'Release.OldTree'
    Assert-GitSha $release.NewCommit 'Release.NewCommit'
    Assert-GitSha $release.NewTree 'Release.NewTree'

    $production = $Bindings.Production
    foreach ($name in @('Host', 'RemoteUser', 'SshKeyPath', 'KnownHostsPath', 'Service',
                         'HealthTimer', 'DeployHelper', 'CurrentLink', 'LastGoodLink',
                         'ReleaseRoot', 'NodePath', 'PublicOrigin')) {
        [void](Require-String $production $name 'Production')
    }

    $environment = $Bindings.Environment
    foreach ($name in @('ActivePath', 'ReadOnlyPath', 'PreservedBetaPath', 'BetaSha256',
                         'ReadOnlySha256')) {
        [void](Require-String $environment $name 'Environment')
    }
    Assert-Sha256 $environment.BetaSha256 'Environment.BetaSha256'
    Assert-Sha256 $environment.ReadOnlySha256 'Environment.ReadOnlySha256'

    $qualification = $Bindings.Qualification
    foreach ($name in @('ReadOnlyGateScript', 'BetaGateScript')) {
        [void](Require-String $qualification $name 'Qualification')
    }

    if ($qualification.ExpectedBetaActions -isnot [System.Collections.IEnumerable] -or
        @($qualification.ExpectedBetaActions).Count -lt 1) {
        throw 'Qualification.ExpectedBetaActions must contain at least one action.'
    }

    foreach ($sourceCheck in @($qualification.SourceChecks)) {
        if ($sourceCheck -isnot [hashtable]) {
            throw 'Every Qualification.SourceChecks item must be a hashtable.'
        }
        [void](Require-String $sourceCheck 'Path' 'Qualification.SourceChecks[]')
        if (@($sourceCheck['Contains']).Count -eq 0 -and @($sourceCheck['NotContains']).Count -eq 0) {
            throw 'Every source check must define Contains and/or NotContains markers.'
        }
    }

    foreach ($publicCheck in @($qualification.PublicChecks)) {
        if ($publicCheck -isnot [hashtable]) {
            throw 'Every Qualification.PublicChecks item must be a hashtable.'
        }
        [void](Require-String $publicCheck 'Name' 'Qualification.PublicChecks[]')
        [void](Require-String $publicCheck 'Kind' 'Qualification.PublicChecks[]')
        [void](Require-String $publicCheck 'Path' 'Qualification.PublicChecks[]')
        if ($publicCheck.Kind -notin @('Json', 'Html')) {
            throw "Unsupported public check kind '$($publicCheck.Kind)'."
        }
    }
}

function New-RemoteScript {
    param(
        [Parameter(Mandatory)][hashtable]$Bindings,
        [Parameter(Mandatory)][string]$Operation
    )

    $release = $Bindings.Release
    $production = $Bindings.Production
    $environment = $Bindings.Environment
    $qualification = $Bindings.Qualification

    $expectedActionsCsv = (@($qualification.ExpectedBetaActions) -join ',')

    $sourceCheckLines = [System.Collections.Generic.List[string]]::new()
    foreach ($check in @($qualification.SourceChecks)) {
        $relativePath = [string]$check.Path
        if ($relativePath.StartsWith('/') -or $relativePath.Contains('..')) {
            throw "Unsafe source-check path: $relativePath"
        }

        foreach ($marker in @($check['Contains'])) {
            $sourceCheckLines.Add(
                "assert_contains `"`$release_path/$relativePath`" " +
                (ConvertTo-BashSingleQuoted ([string]$marker))
            )
        }
        foreach ($marker in @($check['NotContains'])) {
            $sourceCheckLines.Add(
                "assert_not_contains `"`$release_path/$relativePath`" " +
                (ConvertTo-BashSingleQuoted ([string]$marker))
            )
        }
    }
    $sourceChecks = $sourceCheckLines -join "`n"
    $productionRoot = Split-Path -Parent $PSScriptRoot
    $templatePath = Join-Path $productionRoot 'remote/production-deploy.sh.tmpl'
    $template = Get-Content -LiteralPath $templatePath -Raw

    $tokens = @{
        '__OPERATION__' = (ConvertTo-BashSingleQuoted $Operation)
        '__SERVICE__' = (ConvertTo-BashSingleQuoted ([string]$production.Service))
        '__HEALTH_TIMER__' = (ConvertTo-BashSingleQuoted ([string]$production.HealthTimer))
        '__DEPLOY_HELPER__' = (ConvertTo-BashSingleQuoted ([string]$production.DeployHelper))
        '__CURRENT_LINK__' = (ConvertTo-BashSingleQuoted ([string]$production.CurrentLink))
        '__LAST_GOOD_LINK__' = (ConvertTo-BashSingleQuoted ([string]$production.LastGoodLink))
        '__RELEASE_ROOT__' = (ConvertTo-BashSingleQuoted ([string]$production.ReleaseRoot))
        '__NODE_PATH__' = (ConvertTo-BashSingleQuoted ([string]$production.NodePath))
        '__ACTIVE_ENV__' = (ConvertTo-BashSingleQuoted ([string]$environment.ActivePath))
        '__READONLY_ENV__' = (ConvertTo-BashSingleQuoted ([string]$environment.ReadOnlyPath))
        '__PRESERVED_BETA_ENV__' = (ConvertTo-BashSingleQuoted ([string]$environment.PreservedBetaPath))
        '__BETA_ENV_SHA__' = (ConvertTo-BashSingleQuoted ([string]$environment.BetaSha256))
        '__READONLY_ENV_SHA__' = (ConvertTo-BashSingleQuoted ([string]$environment.ReadOnlySha256))
        '__OLD_COMMIT__' = (ConvertTo-BashSingleQuoted ([string]$release.OldCommit))
        '__OLD_TREE__' = (ConvertTo-BashSingleQuoted ([string]$release.OldTree))
        '__OLD_BUILD__' = (ConvertTo-BashSingleQuoted ([string]$release.OldBuild))
        '__NEW_COMMIT__' = (ConvertTo-BashSingleQuoted ([string]$release.NewCommit))
        '__NEW_TREE__' = (ConvertTo-BashSingleQuoted ([string]$release.NewTree))
        '__EXPECTED_BUILD__' = (ConvertTo-BashSingleQuoted ([string]$release.ExpectedBuild))
        '__READONLY_GATE__' = (ConvertTo-BashSingleQuoted ([string]$qualification.ReadOnlyGateScript))
        '__BETA_GATE__' = (ConvertTo-BashSingleQuoted ([string]$qualification.BetaGateScript))
        '__EXPECTED_ACTIONS_CSV__' = (ConvertTo-BashSingleQuoted $expectedActionsCsv)
        '__SOURCE_CHECKS__' = $sourceChecks
    }

    foreach ($entry in $tokens.GetEnumerator()) {
        $template = $template.Replace([string]$entry.Key, [string]$entry.Value)
    }

    return ($template -replace "`r`n", "`n")
}
