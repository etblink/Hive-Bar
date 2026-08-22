function ConvertTo-LfBashPayload {
    param([Parameter(Mandatory)][string]$RemoteScript)

    # Native PowerShell pipelines append platform record terminators when feeding stdin.
    # Normalize source CRLF to LF, then write the exact resulting string without WriteLine.
    return $RemoteScript.Replace("`r`n", "`n")
}

function Split-NativeTextLines {
    param([AllowEmptyString()][string]$Text)

    if ([string]::IsNullOrEmpty($Text)) {
        return @()
    }

    $lines = [regex]::Split($Text, "\r?\n")
    if ($lines.Count -gt 0 -and $lines[-1] -eq '') {
        $lines = @($lines[0..($lines.Count - 2)])
    }
    return @($lines)
}

function Invoke-SshBashPayload {
    param(
        [Parameter(Mandatory)][string]$RemoteScript,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string[]]$SshArguments
    )

    $payload = ConvertTo-LfBashPayload -RemoteScript $RemoteScript
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'ssh'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardInputEncoding = $utf8NoBom
    $startInfo.StandardOutputEncoding = $utf8NoBom
    $startInfo.StandardErrorEncoding = $utf8NoBom

    foreach ($argument in @($SshArguments) + @($Target, 'sudo -n bash -s')) {
        [void]$startInfo.ArgumentList.Add([string]$argument)
    }

    $process = [System.Diagnostics.Process]::new()
    try {
        $process.StartInfo = $startInfo
        if (-not $process.Start()) {
            throw 'Failed to start ssh.'
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()

        # Write sends exactly these characters. It does not append the Windows CRLF record
        # terminator that PowerShell's native-command pipeline adds.
        $process.StandardInput.Write($payload)
        $process.StandardInput.Close()

        $process.WaitForExit()
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    $output = @(Split-NativeTextLines -Text $stdout)
    $errorOutput = @(Split-NativeTextLines -Text $stderr)
    foreach ($line in $errorOutput) {
        [Console]::Error.WriteLine($line)
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Invoke-RemotePayload {
    param(
        [Parameter(Mandatory)][string]$RemoteScript,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string[]]$SshArguments,
        [Parameter(Mandatory)][ValidateSet('Observe', 'Deploy', 'Resume')][string]$Operation
    )

    # Pipe the payload over stdin so even Observe does not create a remote temporary file.
    # Redirected StandardInput preserves exact LF framing across Windows and Unix PowerShell hosts.
    $sshResult = Invoke-SshBashPayload -RemoteScript $RemoteScript -Target $Target -SshArguments $SshArguments
    $output = @($sshResult.Output)
    $exitCode = $sshResult.ExitCode
    foreach ($line in $output) {
        Write-Host $line
    }

    if ($exitCode -ne 0) {
        throw "Remote $Operation operation stopped with exit code $exitCode. Do not automatically retry."
    }

    return $output
}

function Invoke-PublicJsonCheck {
    param(
        [Parameter(Mandatory)][hashtable]$Check,
        [Parameter(Mandatory)][string]$Origin,
        [Parameter(Mandatory)][long]$Nonce
    )

    $uri = "$Origin$($Check.Path)"
    $separator = if ($uri.Contains('?')) { '&' } else { '?' }
    $uri = "$uri${separator}deploy_verify=$Nonce"

    $value = Invoke-JsonGet $uri
    foreach ($name in $Check['Expected'].Keys) {
        $actual = $value.$name
        $expected = $Check['Expected'][$name]
        if ([string]$actual -ne [string]$expected) {
            throw "Public check '$($Check.Name)' property '$name' mismatch: expected '$expected', got '$actual'."
        }
    }

    Write-Host "PUBLIC_CHECK_$($Check.Name)=PASS"
}

function Invoke-PublicHtmlCheck {
    param(
        [Parameter(Mandatory)][hashtable]$Check,
        [Parameter(Mandatory)][string]$Origin,
        [Parameter(Mandatory)][long]$Nonce
    )

    $uri = "$Origin$($Check.Path)"
    $separator = if ($uri.Contains('?')) { '&' } else { '?' }
    $uri = "$uri${separator}deploy_verify=$Nonce"

    $response = $null
    $lastError = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            $candidate = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers @{
                'Cache-Control' = 'no-cache'
                'Pragma' = 'no-cache'
            } -TimeoutSec 45

            if ($candidate.StatusCode -eq 200) {
                $response = $candidate
                break
            }
            $lastError = "HTTP $($candidate.StatusCode)"
        }
        catch {
            $lastError = $_.Exception.Message
        }

        if ($attempt -lt 3) {
            Start-Sleep -Seconds 2
        }
    }

    if ($null -eq $response) {
        throw "Public check '$($Check.Name)' could not obtain HTTP 200 after 3 attempts: $lastError"
    }

    foreach ($marker in @($Check['Contains'])) {
        if (-not $response.Content.Contains([string]$marker)) {
            throw "Public check '$($Check.Name)' missing marker: $marker"
        }
    }

    if (@($Check['AnyContains']).Count -gt 0) {
        $matched = $false
        foreach ($marker in @($Check['AnyContains'])) {
            if ($response.Content.Contains([string]$marker)) {
                $matched = $true
                break
            }
        }
        if (-not $matched) {
            throw "Public check '$($Check.Name)' did not match any accepted marker."
        }
    }

    foreach ($marker in @($Check['NotContains'])) {
        if ($response.Content.Contains([string]$marker)) {
            throw "Public check '$($Check.Name)' contains forbidden marker: $marker"
        }
    }

    if ($Check['ContainsHeader']) {
        foreach ($headerName in $Check['ContainsHeader'].Keys) {
            $headerValue = [string]$response.Headers[$headerName]
            $requiredFragment = [string]$Check['ContainsHeader'][$headerName]
            if (-not $headerValue.Contains($requiredFragment)) {
                throw "Public check '$($Check.Name)' header '$headerName' missing fragment: $requiredFragment"
            }
        }
    }

    Write-Host "PUBLIC_CHECK_$($Check.Name)=PASS"
}

function Invoke-PublicQualification {
    param([Parameter(Mandatory)][hashtable]$Bindings)

    $origin = [string]$Bindings.Production.PublicOrigin
    if ([string]::IsNullOrWhiteSpace($origin) -or -not $origin.StartsWith('https://')) {
        throw 'Production.PublicOrigin must be an https:// origin.'
    }

    $nonce = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    foreach ($check in @($Bindings.Qualification.PublicChecks)) {
        if ($check.Kind -eq 'Json') {
            Invoke-PublicJsonCheck -Check $check -Origin $origin -Nonce $nonce
        }
        else {
            Invoke-PublicHtmlCheck -Check $check -Origin $origin -Nonce $nonce
        }
    }

    Write-Host 'PUBLIC_QUALIFICATION=PASS'
}

function Invoke-FailClosedReadOnly {
    param(
        [Parameter(Mandatory)][hashtable]$Bindings,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string[]]$SshArguments
    )

    $release = $Bindings.Release
    $production = $Bindings.Production
    $environment = $Bindings.Environment

    $script = @'
set -Eeuo pipefail
readonly_env=__READONLY_ENV__
active_env=__ACTIVE_ENV__
readonly_sha=__READONLY_SHA__
service=__SERVICE__
node_path=__NODE_PATH__
expected_build=__EXPECTED_BUILD__
expected_commit=__EXPECTED_COMMIT__
expected_tree=__EXPECTED_TREE__
health_url=http://127.0.0.1:3000/healthz
ready_url=http://127.0.0.1:3000/readyz
actual="$(sha256sum "$readonly_env" | awk '{print $1}')"
[[ "$actual" == "$readonly_sha" ]]
[[ "$(stat -c '%U:%G:%a' "$readonly_env")" == 'root:hivebar:640' ]]
install -o root -g hivebar -m 0640 "$readonly_env" "$active_env"
systemctl restart "$service"

health_ok=0
for attempt in {1..30}; do
  body="$(curl --fail --silent --show-error --max-time 5 "$health_url" 2>/dev/null || true)"
  if printf '%s' "$body" | "$node_path" -e '
let t="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => t += c);
process.stdin.on("end", () => {
  try {
    const v=JSON.parse(t); const [build,commit,tree]=process.argv.slice(1);
    process.exit(v.status==="ok" && v.environment==="production" && v.writeMode==="disabled" && v.build===build && v.commit===commit && v.tree===tree ? 0 : 1);
  } catch { process.exit(1); }
});' "$expected_build" "$expected_commit" "$expected_tree"; then
    health_ok=1
    break
  fi
  sleep 1
done
[[ "$health_ok" -eq 1 ]]

ready_ok=0
for attempt in {1..20}; do
  body="$(curl --fail --silent --show-error --max-time 5 "$ready_url" 2>/dev/null || true)"
  if printf '%s' "$body" | "$node_path" -e '
let t="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => t += c);
process.stdin.on("end", () => {
  try { process.exit(JSON.parse(t).status==="ready" ? 0 : 1); }
  catch { process.exit(1); }
});'; then
    ready_ok=1
    break
  fi
  sleep 1
done
[[ "$ready_ok" -eq 1 ]]
printf 'PUBLIC_FAILURE_FAIL_CLOSED_READ_ONLY=PASS\n'
'@
    $script = $script.Replace('__READONLY_ENV__', (ConvertTo-BashSingleQuoted ([string]$environment.ReadOnlyPath)))
    $script = $script.Replace('__ACTIVE_ENV__', (ConvertTo-BashSingleQuoted ([string]$environment.ActivePath)))
    $script = $script.Replace('__READONLY_SHA__', (ConvertTo-BashSingleQuoted ([string]$environment.ReadOnlySha256)))
    $script = $script.Replace('__SERVICE__', (ConvertTo-BashSingleQuoted ([string]$production.Service)))
    $script = $script.Replace('__NODE_PATH__', (ConvertTo-BashSingleQuoted ([string]$production.NodePath)))
    $script = $script.Replace('__EXPECTED_BUILD__', (ConvertTo-BashSingleQuoted ([string]$release.ExpectedBuild)))
    $script = $script.Replace('__EXPECTED_COMMIT__', (ConvertTo-BashSingleQuoted ([string]$release.NewCommit)))
    $script = $script.Replace('__EXPECTED_TREE__', (ConvertTo-BashSingleQuoted ([string]$release.NewTree)))

    $sshResult = Invoke-SshBashPayload -RemoteScript $script -Target $Target -SshArguments $SshArguments
    $output = @($sshResult.Output)
    foreach ($line in $output) {
        Write-Host $line
    }
    if ($sshResult.ExitCode -ne 0) {
        Write-Warning 'Public qualification failed and fail-closed command did not complete cleanly.'
    }
}
