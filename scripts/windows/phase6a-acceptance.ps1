[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DesiredStatePath,
    [string]$ConfigPath,
    [string]$TunnelIngressConfigPath,
    [switch]$RunQualityGates,
    [switch]$RunPhase5CRemoteRegression
)

$ErrorActionPreference = "Stop"
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$standardPathExt = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC"
$currentPathExt = [string]$env:PATHEXT
if ($currentPathExt -notmatch "(?i)(^|;)\.EXE(;|$)" -or $currentPathExt -notmatch "(?i)(^|;)\.CMD(;|$)") {
    $env:PATHEXT = if ([string]::IsNullOrWhiteSpace($currentPathExt)) {
        $standardPathExt
    } else {
        "$standardPathExt;$currentPathExt"
    }
}
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$evidencePath = "D:\code\research\fqgate-phase6a-discovery-evidence.json"
$records = [System.Collections.Generic.List[object]]::new()

if ($repositoryRoot -ne $expectedRoot -or -not (Test-Path -LiteralPath (Join-Path $repositoryRoot ".git"))) {
    throw "P6A-W1 FAIL PERMANENT_WINDOWS_CHECKOUT_REQUIRED"
}

function Add-Record {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][ValidateSet("PASS", "FAIL", "MANUAL", "SKIP")][string]$Result,
        [hashtable]$Metadata = @{}
    )
    $record = [ordered]@{ id = $Id; result = $Result }
    foreach ($key in $Metadata.Keys) { $record[$key] = $Metadata[$key] }
    $record.timestamp = [DateTime]::UtcNow.ToString("o")
    $records.Add([pscustomobject]$record)
    Write-Host ($record | ConvertTo-Json -Compress)
}

function Resolve-CommandPath {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }
    return $null
}

function ConvertTo-ProcessArgument {
    param([string]$Value)
    if ($null -eq $Value) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-BoundedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [string[]]$Arguments = @(),
        [hashtable]$Environment = @{},
        [int]$MaximumOutputBytes = 256KB
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FileName
    $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    $startInfo.WorkingDirectory = $repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $pathExt = [string]$startInfo.EnvironmentVariables["PATHEXT"]
    if ($pathExt -notmatch "(?i)(^|;)\.EXE(;|$)" -or $pathExt -notmatch "(?i)(^|;)\.CMD(;|$)") {
        $startInfo.EnvironmentVariables["PATHEXT"] =
            if ([string]::IsNullOrWhiteSpace($pathExt)) { $standardPathExt } else { "$standardPathExt;$pathExt" }
    }
    foreach ($key in $Environment.Keys) {
        $startInfo.EnvironmentVariables[[string]$key] = [string]$Environment[$key]
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "P6A_PROCESS_START_FAILED" }
        # Start both reads before waiting for the child. Reading stdout to EOF
        # before draining stderr can deadlock when a Windows pipe buffer fills.
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($stdout.Length -gt $MaximumOutputBytes -or $stderr.Length -gt $MaximumOutputBytes) {
            throw "P6A_CHILD_OUTPUT_TOO_LARGE"
        }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
    } finally {
        foreach ($key in $Environment.Keys) {
            $startInfo.EnvironmentVariables.Remove([string]$key)
        }
        $process.Dispose()
    }
}

function ConvertFrom-SecureStringInMemory {
    param([Security.SecureString]$Value)
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

function Get-JsonValue {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 64KB) { return $null }
    try { return $Text.Trim() | ConvertFrom-Json } catch { return $null }
}

function Get-ErrorCode {
    param([string]$Text)
    $value = Get-JsonValue $Text
    if ($null -ne $value.error.code) { return [string]$value.error.code }
    return ""
}

function Invoke-BridgeCloudflare {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][hashtable]$Environment
    )
    $cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
    if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
        throw "P6A-W3 FAIL_BUILT_CLI_REQUIRED"
    }
    return Invoke-BoundedProcess -FileName $script:nodePath -Arguments @(
        $cliPath, "cloudflare", $Command, "--desired-state", $resolvedDesiredState, "--json"
    ) -Environment $Environment -MaximumOutputBytes 64KB
}

function Get-PlanCheck {
    param([Parameter(Mandatory = $true)]$Plan, [Parameter(Mandatory = $true)][string]$Id)
    return @($Plan.checks | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
}

function Write-ManualRequiredDetails {
    param([Parameter(Mandatory = $true)]$Plan)
    foreach ($check in @($Plan.checks | Where-Object { $_.classification -eq "manual_required" })) {
        switch ([string]$check.reason) {
            "api_response_does_not_prove_administrator_mfa" {
                Write-Host "MANUAL_REQUIRED id=$($check.id) reason=$($check.reason)"
                Write-Host "Dashboard path: Cloudflare Zero Trust > Access controls > Applications > $($desiredConfig.access.applications.admin.hostname) > Policies"
                Write-Host "Field: administrator MFA / identity-provider requirement"
                Write-Host "Expected: MFA is enabled for every administrator policy; an explicit bypass or disabled MFA is unsafe_conflict."
                Write-Host "After the check, rerun: .\scripts\windows\phase6a-acceptance.ps1 -DesiredStatePath `"$DesiredStatePath`""
            }
            "dns_target_cannot_be_derived" {
                Write-Host "MANUAL_REQUIRED id=$($check.id) reason=$($check.reason)"
                Write-Host "Dashboard path: Cloudflare Zero Trust > Networks > Tunnels > the desired remotely-managed tunnel > Public hostnames"
                Write-Host "Field: tunnel hostname CNAME target"
                Write-Host "Expected: each hostname CNAME targets <tunnel-id>.cfargotunnel.com and is proxied."
                Write-Host "After recording the exact target in repo-external desired state, rerun: .\scripts\windows\phase6a-acceptance.ps1 -DesiredStatePath `"$DesiredStatePath`""
            }
            default {
                Write-Host "MANUAL_REQUIRED id=$($check.id) reason=$($check.reason)"
                Write-Host "Dashboard path: Cloudflare Zero Trust > the resource named by this check"
                Write-Host "Field/expected value: inspect the exact expected value in the bounded plan check; do not apply changes in Phase 6-A."
                Write-Host "After the check, rerun: .\scripts\windows\phase6a-acceptance.ps1 -DesiredStatePath `"$DesiredStatePath`""
            }
        }
    }
}

function Assert-LoopbackListener {
    param([Parameter(Mandatory = $true)][string]$Id, [Parameter(Mandatory = $true)][int]$Port)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $pass = $listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq "127.0.0.1"
    Add-Record $Id $(if ($pass) { "PASS" } else { "FAIL" }) @{ port = $Port; count = $listeners.Count; address = $(if ($pass) { "127.0.0.1" } else { "invalid" }) }
}

function Restore-GeneratedRouteTree {
    if ($null -eq $script:routeTreeBaseline -or
        [string]::IsNullOrWhiteSpace($script:routeTreePath) -or
        -not (Test-Path -LiteralPath $script:routeTreePath -PathType Leaf)) {
        return
    }
    [System.IO.File]::WriteAllBytes($script:routeTreePath, $script:routeTreeBaseline)
}

function Write-Evidence {
    $passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
    $failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
    $manual = @($records | Where-Object { $_.result -eq "MANUAL" }).Count
    $skipped = @($records | Where-Object { $_.result -eq "SKIP" }).Count
    $evidence = [ordered]@{
        schemaVersion = 1
        task = "phase-6-a-cloudflare-readonly-discovery-and-plan"
        generatedAt = [DateTime]::UtcNow.ToString("o")
        repository = $repositoryRoot
        commit = $script:commit
        records = @($records)
        summary = [ordered]@{ total = $records.Count; passed = $passed; failed = $failed; manual = $manual; skipped = $skipped }
        plan = [ordered]@{
            fingerprint = $script:planFingerprint
            readOnly = $script:planReadOnly
            mutationMethodCount = $script:mutationMethodCount
            observedAccountCount = $script:observedAccountCount
            observedApplicationCount = $script:observedApplicationCount
        }
    }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 64KB) { throw "P6A-EVIDENCE_TOO_LARGE" }
    Set-Content -LiteralPath $evidencePath -Value $json -Encoding UTF8
}

$script:nodePath = Resolve-CommandPath "node.exe"
$script:gitPath = Resolve-CommandPath "git.exe"
$script:corepackPath = Resolve-CommandPath "corepack.cmd"
$script:commit = ""
$script:planFingerprint = ""
$script:planReadOnly = $false
$script:mutationMethodCount = -1
$script:observedAccountCount = -1
$script:observedApplicationCount = -1
$script:routeTreePath = ""
$script:routeTreeBaseline = $null
$resolvedDesiredState = $null
$desiredConfig = $null

try {
    if ([string]::IsNullOrWhiteSpace($script:nodePath)) { throw "P6A-W2 FAIL_NODE_REQUIRED" }
    if ([string]::IsNullOrWhiteSpace($script:gitPath)) { throw "P6A-W2 FAIL_GIT_REQUIRED" }
    if ([string]::IsNullOrWhiteSpace($script:corepackPath)) { throw "P6A-W2 FAIL_COREPACK_REQUIRED" }
    $resolvedDesiredState = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    if (-not (Test-Path -LiteralPath $resolvedDesiredState -PathType Leaf)) { throw "P6A-W3 FAIL_DESIRED_STATE_REQUIRED" }
    $desiredText = Get-Content -LiteralPath $resolvedDesiredState -Raw
    if ($desiredText.Length -gt 64KB -or $desiredText -match '(?i)(api[_-]?token|client[_-]?secret|tunnel[_-]?token|jwt|cookie)') {
        throw "P6A-W3 FAIL_DESIRED_STATE_SECRET_OR_SIZE"
    }
    $desiredConfig = $desiredText | ConvertFrom-Json
    $script:commit = (& $script:gitPath -C $repositoryRoot rev-parse HEAD).Trim()
    $status = @(& $script:gitPath -C $repositoryRoot status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $branch = (& $script:gitPath -C $repositoryRoot branch --show-current).Trim()
    Add-Record "P6A-W4" $(if ($status.Count -eq 0 -and $branch -eq "main" -and $script:commit -match '^[0-9a-f]{40}$') { "PASS" } else { "FAIL" }) @{ branch = $branch; commit = $script:commit; workingTree = $(if ($status.Count -eq 0) { "clean" } else { "dirty" }) }
    if ($status.Count -eq 0) {
        $script:routeTreePath = Join-Path $repositoryRoot "src\routeTree.gen.ts"
        if (Test-Path -LiteralPath $script:routeTreePath -PathType Leaf) {
            $script:routeTreeBaseline = [System.IO.File]::ReadAllBytes($script:routeTreePath)
        }
    }
    Assert-LoopbackListener "P6A-W5" 17281
    Assert-LoopbackListener "P6A-W6" 17282

    if ($RunQualityGates) {
        foreach ($gate in @(
            @{ id = "P6A-Q1"; args = @("pnpm", "install", "--frozen-lockfile") },
            @{ id = "P6A-Q2"; args = @("pnpm", "typecheck") },
            @{ id = "P6A-Q3"; args = @("pnpm", "lint") },
            @{ id = "P6A-Q4"; args = @("pnpm", "test") },
            @{ id = "P6A-Q5"; args = @("pnpm", "build") },
            @{ id = "P6A-Q6"; args = @("pnpm", "format:check") },
            @{ id = "P6A-Q7"; args = @("pnpm", "test:e2e") }
        )) {
            try {
                $gateResult = Invoke-BoundedProcess -FileName $script:corepackPath -Arguments $gate.args -MaximumOutputBytes 256KB
            } finally {
                Restore-GeneratedRouteTree
            }
            Add-Record $gate.id $(if ($gateResult.ExitCode -eq 0) { "PASS" } else { "FAIL" }) @{ exitCode = $gateResult.ExitCode }
            if ($gateResult.ExitCode -ne 0) { throw "$($gate.id) FAIL" }
        }
    } else {
        Add-Record "P6A-Q0" "SKIP" @{ reason = "run with -RunQualityGates to execute the frozen full repository gate set" }
    }

    $secureToken = Read-Host "Cloudflare read-only API token (hidden)" -AsSecureString
    $cloudflareToken = ConvertFrom-SecureStringInMemory $secureToken
    $childEnvironment = @{ CLOUDFLARE_API_TOKEN = $cloudflareToken }
    try {
        $discoverResult = Invoke-BridgeCloudflare "discover" $childEnvironment
        $discover = Get-JsonValue $discoverResult.Stdout
        $discoverPass = $discoverResult.ExitCode -eq 0 -and $null -ne $discover -and $null -ne $discover.account
        Add-Record "P6A-CF-DISCOVER" $(if ($discoverPass) { "PASS" } else { "FAIL" }) @{ exitCode = $discoverResult.ExitCode }
        if (-not $discoverPass) {
            $errorCode = Get-ErrorCode $discoverResult.Stderr
            if ($errorCode -eq "LOGIN_REQUIRED") {
                Write-Host "MANUAL_FQGATE_LOGIN_REQUIRED: open http://127.0.0.1:17282/login, start the existing QR flow, physically scan/approve, then rerun the exact Phase 5-C command that reported LOGIN_REQUIRED before rerunning this Phase 6-A command."
            }
            throw "P6A-CF-DISCOVER FAIL"
        }
        $script:observedAccountCount = @($discover.account.candidates).Count
        $script:observedApplicationCount = @($discover.applications.PSObject.Properties).Count

        $planResult = Invoke-BridgeCloudflare "plan" $childEnvironment
        $plan = Get-JsonValue $planResult.Stdout
        $planText = if ($null -eq $plan) { "" } else { $plan | ConvertTo-Json -Depth 20 -Compress }
        $secretFree = $planText -notmatch '(?i)(authorization|client[_-]?secret|access[_-]?(assertion|jwt|token)|cookie|tunnel[_-]?token|qr.*base64)'
        $script:planFingerprint = [string]$plan.fingerprint
        $script:planReadOnly = $plan.readOnly -eq $true
        $script:mutationMethodCount = @($plan.mutationMethods).Count
        $planShapePass = $null -ne $plan -and
            $planResult.ExitCode -le 1 -and
            $script:planFingerprint -match '^[a-f0-9]{64}$' -and
            $script:planReadOnly -and
            $script:mutationMethodCount -eq 0 -and
            $secretFree
        Add-Record "P6A-CF-PLAN" $(if ($planShapePass) { "PASS" } else { "FAIL" }) @{ exitCode = $planResult.ExitCode; fingerprint = $script:planFingerprint; mutationMethodCount = $script:mutationMethodCount }
        if ($null -eq $plan -or -not $planShapePass) { throw "P6A-CF-PLAN FAIL" }
        $conflicts = @($plan.checks | Where-Object { $_.classification -in @("unsafe_conflict", "ambiguous") })
        $blocked = @($plan.checks | Where-Object { $_.classification -eq "blocked" })
        $manual = @($plan.checks | Where-Object { $_.classification -eq "manual_required" })
        Add-Record "P6A-CF-DRIFT" $(if ($conflicts.Count -eq 0 -and $blocked.Count -eq 0) { "PASS" } else { "FAIL" }) @{ conflicts = $conflicts.Count; blocked = $blocked.Count; manualRequired = $manual.Count; drifted = [int]$plan.summary.drifted }
        if ($manual.Count -gt 0) {
            Add-Record "P6A-CF-MANUAL" "MANUAL" @{ count = $manual.Count }
            Write-ManualRequiredDetails $plan
        }
        if ($conflicts.Count -gt 0) { throw "P6A-CF-DRIFT FAIL UNSAFE_OR_AMBIGUOUS" }
        if ($blocked.Count -gt 0) { throw "P6A-CF-DRIFT FAIL BLOCKED" }
        if ($manual.Count -gt 0) { throw "P6A-CF-MANUAL MANUAL_REQUIRED" }
        if ($planResult.ExitCode -ne 0) { throw "P6A-CF-PLAN FAIL BLOCKED" }
    } finally {
        $childEnvironment["CLOUDFLARE_API_TOKEN"] = ""
        $cloudflareToken = $null
        if ($null -ne $secureToken) { $secureToken.Dispose() }
    }

    if ($RunPhase5CRemoteRegression) {
        if ([string]::IsNullOrWhiteSpace($ConfigPath) -or [string]::IsNullOrWhiteSpace($TunnelIngressConfigPath)) {
            throw "P6A-P5C FAIL ConfigPath and TunnelIngressConfigPath are required for the real remote-machine regression"
        }
        $phase5cPath = Join-Path $repositoryRoot "scripts\windows\phase5c-acceptance.ps1"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phase5cPath -ConfigPath $ConfigPath -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath $TunnelIngressConfigPath
        if ($LASTEXITCODE -ne 0) { throw "P6A-P5C FAIL" }
        Add-Record "P6A-P5C" "PASS" @{ regression = "phase5-c-real-remote-machine" }
    } else {
        Add-Record "P6A-P5C" "SKIP" @{ reason = "run with -RunPhase5CRemoteRegression for the hidden existing service-token boundary" }
    }
}
finally {
    Restore-GeneratedRouteTree
    Write-Evidence
}

$failed = @($records | Where-Object { $_.result -eq "FAIL" -or $_.result -eq "MANUAL" }).Count
$skipped = @($records | Where-Object { $_.result -eq "SKIP" }).Count
$summaryResult = if ($failed -ne 0) { "FAIL" } elseif ($skipped -ne 0) { "INCOMPLETE" } else { "PASS" }
$summary = [ordered]@{ id = "P6A-SUMMARY"; result = $summaryResult; total = $records.Count; failed = $failed; skipped = $skipped; evidence = $evidencePath; fingerprint = $script:planFingerprint }
Write-Host ($summary | ConvertTo-Json -Compress)
if ($failed -ne 0 -or $skipped -ne 0) { exit 1 }
