[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DesiredStatePath,
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$TunnelIngressConfigPath
)

$ErrorActionPreference = "Stop"
$standardPathExt = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC"
$currentPathExt = [string]$env:PATHEXT
if ($currentPathExt -notmatch "(?i)(^|;)\.EXE(;|$)" -or $currentPathExt -notmatch "(?i)(^|;)\.CMD(;|$)") {
    $env:PATHEXT = if ([string]::IsNullOrWhiteSpace($currentPathExt)) { $standardPathExt } else { "$standardPathExt;$currentPathExt" }
}
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$evidencePath = "D:\code\research\fqgate-phase6b1-acceptance-evidence.json"
$p6aEvidencePath = "D:\code\research\fqgate-phase6a-discovery-evidence.json"
$p5cEvidencePath = "D:\code\research\fqgate-phase5c-remote-evidence.json"
$records = [System.Collections.Generic.List[object]]::new()
$script:failureCode = $null
$script:readToken = $null
$script:writeToken = $null
$script:writeTokenSecure = $null
$script:readEnvironment = @{}
$script:writeEnvironment = @{}

if ($repositoryRoot -ne $expectedRoot -or -not (Test-Path -LiteralPath (Join-Path $repositoryRoot ".git"))) {
    throw "P6B1-W0 PERMANENT_WINDOWS_CHECKOUT_REQUIRED"
}

function Add-Record {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][ValidateSet("PASS", "FAIL", "INFO")][string]$Result,
        [hashtable]$Metadata = @{}
    )
    $record = [ordered]@{ id = $Id; result = $Result }
    foreach ($key in $Metadata.Keys) { $record[$key] = $Metadata[$key] }
    $record.timestamp = [DateTime]::UtcNow.ToString("o")
    $records.Add([pscustomobject]$record)
    Write-Host ($record | ConvertTo-Json -Compress)
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }
    return $null
}

function ConvertTo-ProcessArgument([string]$Value) {
    if ($null -eq $Value) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-BoundedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [string[]]$Arguments = @(),
        [hashtable]$Environment = @{},
        [int]$TimeoutMs = 900000,
        [int]$MaximumOutputCharacters = 512KB
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FileName
    $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    $startInfo.WorkingDirectory = $repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($name in @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_DNS_WRITE_TOKEN", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET")) {
        $startInfo.EnvironmentVariables.Remove($name)
    }
    foreach ($key in $Environment.Keys) {
        $startInfo.EnvironmentVariables[[string]$key] = [string]$Environment[$key]
    }
    $pathExt = [string]$startInfo.EnvironmentVariables["PATHEXT"]
    if ($pathExt -notmatch "(?i)(^|;)\.EXE(;|$)" -or $pathExt -notmatch "(?i)(^|;)\.CMD(;|$)") {
        $startInfo.EnvironmentVariables["PATHEXT"] = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;$pathExt"
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "P6B1_PROCESS_START_FAILED" }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill() } catch { }
            throw "P6B1_CHILD_TIMEOUT"
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($stdout.Length -gt $MaximumOutputCharacters -or $stderr.Length -gt $MaximumOutputCharacters) {
            throw "P6B1_CHILD_OUTPUT_TOO_LARGE"
        }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
    } finally {
        foreach ($key in $Environment.Keys) { $startInfo.EnvironmentVariables.Remove([string]$key) }
        $process.Dispose()
    }
}

function Get-JsonValue([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 512KB) { return $null }
    try { return $Text.Trim() | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
}

function Get-ErrorCode([string]$Text) {
    $value = Get-JsonValue $Text
    if ($null -ne $value -and $null -ne $value.error.code) { return [string]$value.error.code }
    return ""
}

function ConvertFrom-SecureStringInMemory([Security.SecureString]$Value) {
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
}

function Get-RequiredPlan([string]$ExpectedFingerprint = "") {
    $cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
    if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) { throw "P6B1_BUILT_CLI_REQUIRED" }
    $result = Invoke-BoundedProcess -FileName $script:nodePath -Arguments @(
        $cliPath, "cloudflare", "plan", "--desired-state", $resolvedDesiredState, "--json"
    ) -Environment $script:readEnvironment -TimeoutMs 120000 -MaximumOutputCharacters 128KB
    $plan = Get-JsonValue $result.Stdout
    if ($result.ExitCode -ne 0 -or $null -eq $plan -or $plan.readOnly -ne $true -or
        $plan.mutationMethods.Count -ne 0 -or $plan.fingerprint -notmatch '^[a-f0-9]{64}$') {
        $code = Get-ErrorCode $result.Stderr
        throw "P6B1_LIVE_PLAN_INVALID_$code"
    }
    if ($ExpectedFingerprint -and $plan.fingerprint -ne $ExpectedFingerprint) {
        throw "P6B1_LIVE_PLAN_CHANGED_SINCE_PHASE6A"
    }
    $forbidden = @($plan.checks | Where-Object { $_.classification -in @("unsafe_conflict", "ambiguous", "blocked", "manual_required") })
    if ($forbidden.Count -gt 0) { throw "P6B1_LIVE_PLAN_UNSAFE" }
    return $plan
}

function Invoke-CloudflareApply {
    param([Parameter(Mandatory = $true)]$Plan, [Parameter(Mandatory = $true)][string]$CheckId, [bool]$WithWriteToken)
    $cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
    $environment = @{} + $script:readEnvironment
    if ($WithWriteToken) { $environment["CLOUDFLARE_DNS_WRITE_TOKEN"] = $script:writeToken }
    return Invoke-BoundedProcess -FileName $script:nodePath -Arguments @(
        $cliPath, "cloudflare", "apply", "--desired-state", $resolvedDesiredState,
        "--expected-fingerprint", [string]$Plan.fingerprint, "--check-id", $CheckId, "--json"
    ) -Environment $environment -TimeoutMs 420000 -MaximumOutputCharacters 256KB
}

function Read-Phase6AEvidence([string]$Stage) {
    if (-not (Test-Path -LiteralPath $p6aEvidencePath -PathType Leaf)) { throw "P6B1_$Stage-PHASE6A_EVIDENCE_MISSING" }
    $evidence = Get-Content -LiteralPath $p6aEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($evidence.commit -ne $script:commit -or $evidence.summary.total -ne 14 -or
        $evidence.summary.passed -ne 14 -or $evidence.summary.failed -ne 0 -or
        $evidence.summary.manual -ne 0 -or $evidence.summary.skipped -ne 0) {
        throw "P6B1_$Stage-PHASE6A_NOT_14_OF_14"
    }
    foreach ($id in @("P6A-Q1", "P6A-Q2", "P6A-Q3", "P6A-Q4", "P6A-Q5", "P6A-Q6", "P6A-Q7", "P6A-W5", "P6A-W6", "P6A-CF-DISCOVER", "P6A-CF-PLAN", "P6A-CF-DRIFT", "P6A-P5C")) {
        $match = @($evidence.records | Where-Object { $_.id -eq $id -and $_.result -eq "PASS" })
        if ($match.Count -ne 1) { throw "P6B1_$Stage-PHASE6A_REQUIRED_CHECK_FAILED_$id" }
    }
    if ($evidence.plan.readOnly -ne $true -or $evidence.plan.mutationMethodCount -ne 0) {
        throw "P6B1_$Stage-PHASE6A_READ_ONLY_INVARIANT_FAILED"
    }
    return $evidence
}

function Assert-Phase5CRemoteEvidence([string]$Stage) {
    if (-not (Test-Path -LiteralPath $p5cEvidencePath -PathType Leaf)) { throw "P6B1_$Stage-PHASE5C_EVIDENCE_MISSING" }
    $evidence = Get-Content -LiteralPath $p5cEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($evidence.failed -ne 0 -or $evidence.pending -ne 0 -or $evidence.matrixExitCode -ne 0) {
        throw "P6B1_$Stage-PHASE5C_REMOTE_FAILED"
    }
    $lines = ([string]$evidence.records).Trim() -split "`r?`n"
    $results = @($lines | ForEach-Object { Get-JsonValue $_ } | Where-Object { $null -ne $_ -and $_.result -in @("PASS", "FAIL") })
    $passed = @($results | Where-Object { $_.result -eq "PASS" }).Count
    if ($results.Count -ne 21 -or $passed -ne 21) { throw "P6B1_$Stage-PHASE5C_NOT_21_OF_21" }
    return $results.Count
}

function Invoke-Phase6AAcceptance([string]$Stage) {
    $scriptPath = Join-Path $repositoryRoot "scripts\windows\phase6a-acceptance.ps1"
    $result = Invoke-BoundedProcess -FileName $script:powerShellPath -Arguments @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath,
        "-DesiredStatePath", $resolvedDesiredState, "-ConfigPath", $resolvedConfig,
        "-TunnelIngressConfigPath", $resolvedIngress, "-RunQualityGates",
        "-RunPhase5CRemoteRegression", "-CredentialSource", "Vault"
    ) -TimeoutMs 2400000 -MaximumOutputCharacters 2MB
    if ($result.ExitCode -ne 0) {
        if ((($result.Stdout + "`n" + $result.Stderr) -match '\bLOGIN_REQUIRED\b')) {
            Write-LoginRequiredResume
            throw "P6B1_$Stage-LOGIN_REQUIRED"
        }
        if (Test-Path -LiteralPath $p6aEvidencePath -PathType Leaf) {
            $partial = Get-Content -LiteralPath $p6aEvidencePath -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
            $failedIds = @($partial.records | Where-Object { $_.result -in @("FAIL", "MANUAL") } | ForEach-Object { $_.id })
            if ($failedIds.Count -gt 0) { throw "P6B1_$Stage-PHASE6A_FAILED_$($failedIds -join ',')" }
        }
        throw "P6B1_$Stage-PHASE6A_PROCESS_FAILED"
    }
    $evidence = Read-Phase6AEvidence $Stage
    $remoteCount = Assert-Phase5CRemoteEvidence $Stage
    return [pscustomobject]@{ Phase6A = $evidence; Phase5CCount = $remoteCount }
}

function Write-LoginRequiredResume {
    Write-Host "MANUAL_FQGATE_LOGIN_REQUIRED: open http://127.0.0.1:17282/login, start the existing QR flow, physically scan and approve. Then resume with: .\scripts\windows\phase6b1-acceptance.ps1 -DesiredStatePath `"$DesiredStatePath`" -ConfigPath `"$ConfigPath`" -TunnelIngressConfigPath `"$TunnelIngressConfigPath`""
}

function Ensure-WriteToken {
    if (-not [string]::IsNullOrWhiteSpace($script:writeToken)) { return }
    $script:writeTokenSecure = Read-Host "Short-lived DNS-write token scoped to the exact desired zone (hidden)" -AsSecureString
    if ($null -eq $script:writeTokenSecure -or $script:writeTokenSecure.Length -lt 8) { throw "P6B1_WRITE_TOKEN_INVALID" }
    $script:writeToken = ConvertFrom-SecureStringInMemory $script:writeTokenSecure
    $script:writeEnvironment["CLOUDFLARE_API_TOKEN"] = $script:readToken
    $script:writeEnvironment["CLOUDFLARE_DNS_WRITE_TOKEN"] = $script:writeToken
}

function Run-Canary {
    $scriptPath = Join-Path $repositoryRoot "scripts\windows\phase6b1-canary.mjs"
    $result = Invoke-BoundedProcess -FileName $script:nodePath -Arguments @(
        $scriptPath, $resolvedDesiredState, $script:commit
    ) -Environment $script:writeEnvironment -TimeoutMs 120000 -MaximumOutputCharacters 64KB
    $canary = Get-JsonValue $result.Stdout
    if ($result.ExitCode -ne 0 -or $null -eq $canary -or $canary.status -ne "created_and_cleaned" -or
        $canary.type -ne "TXT" -or $canary.cleanupVerified -ne $true -or
        $canary.name -ne ("_fqgate-remote-bridge-phase6b-canary." + [string]$desiredConfig.zone.name)) {
        $code = Get-ErrorCode $result.Stderr
        throw "P6B1_CANARY_FAILED_$code"
    }
    return $canary
}

function Write-Evidence {
    $passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
    $failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
    $evidence = [ordered]@{
        schemaVersion = 1
        task = "phase-6-b1-stale-plan-guarded-dns-apply"
        generatedAt = [DateTime]::UtcNow.ToString("o")
        repository = $repositoryRoot
        commit = $script:commit
        records = @($records)
        summary = [ordered]@{ total = $records.Count; passed = $passed; failed = $failed }
    }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 128KB) { throw "P6B1_EVIDENCE_TOO_LARGE" }
    [System.IO.File]::WriteAllText($evidencePath, $json, [System.Text.UTF8Encoding]::new($false))
}

$script:nodePath = Resolve-CommandPath "node.exe"
$script:gitPath = Resolve-CommandPath "git.exe"
$script:corepackPath = Resolve-CommandPath "corepack.cmd"
$script:powerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$script:commit = ""
$resolvedDesiredState = $null
$resolvedConfig = $null
$resolvedIngress = $null
$desiredConfig = $null

try {
    if ([string]::IsNullOrWhiteSpace($script:nodePath) -or [string]::IsNullOrWhiteSpace($script:gitPath) -or
        [string]::IsNullOrWhiteSpace($script:corepackPath) -or -not (Test-Path -LiteralPath $script:powerShellPath)) {
        throw "P6B1_WINDOWS_TOOLS_REQUIRED"
    }
    $resolvedDesiredState = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    $resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
    $resolvedIngress = (Resolve-Path -LiteralPath $TunnelIngressConfigPath).Path
    foreach ($path in @($resolvedDesiredState, $resolvedConfig, $resolvedIngress)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "P6B1_REPO_EXTERNAL_CONFIG_REQUIRED" }
        $fullPath = [System.IO.Path]::GetFullPath($path)
        if ($fullPath.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "P6B1_CONFIG_MUST_REMAIN_REPO_EXTERNAL" }
    }
    $desiredText = Get-Content -LiteralPath $resolvedDesiredState -Raw
    if ($desiredText.Length -gt 64KB -or $desiredText -match '(?i)(api[_-]?token|client[_-]?secret|tunnel[_-]?token|jwt|cookie)') {
        throw "P6B1_DESIRED_STATE_SECRET_OR_SIZE"
    }
    $desiredConfig = $desiredText | ConvertFrom-Json -ErrorAction Stop
    $script:commit = (& $script:gitPath -C $repositoryRoot rev-parse HEAD).Trim()
    $branch = (& $script:gitPath -C $repositoryRoot branch --show-current).Trim()
    $status = @(& $script:gitPath -C $repositoryRoot status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($branch -ne "main" -or $status.Count -ne 0 -or $script:commit -notmatch '^[0-9a-f]{40}$') {
        throw "P6B1_MAIN_CLEAN_COMMIT_REQUIRED"
    }
    Add-Record "P6B1-W0" "PASS" @{ branch = $branch; commit = $script:commit; workingTree = "clean" }

    $focused = Invoke-BoundedProcess -FileName $script:corepackPath -Arguments @(
        "pnpm", "exec", "vitest", "run", "tests/phase6b1.test.ts", "tests/cli.test.ts", "tests/windows-scripts.test.ts", "--reporter=dot"
    ) -TimeoutMs 600000 -MaximumOutputCharacters 256KB
    if ($focused.ExitCode -ne 0) { throw "P6B1_FOCUSED_TESTS_FAILED" }
    $focusedCount = 0
    if ($focused.Stdout -match 'Tests\s+(\d+) passed') { $focusedCount = [int]$Matches[1] }
    if ($focusedCount -lt 20) { throw "P6B1_FOCUSED_TEST_SUMMARY_INVALID" }
    foreach ($id in @("P6B1-T1", "P6B1-T2", "P6B1-T3", "P6B1-T4", "P6B1-T5", "P6B1-T6")) {
        Add-Record $id "PASS" @{ focusedSuiteTestsPassed = $focusedCount }
    }

    $preflight = Invoke-Phase6AAcceptance "PRE"
    Add-Record "P6B1-W1" "PASS" @{ gates = "install,typecheck,lint,test,build,format,e2e" }
    Add-Record "P6B1-W2-PREFLIGHT" "PASS" @{ phase6aTotal = 14; phase6aPassed = 14; phase5cPassed = $preflight.Phase5CCount }

    . (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
    $binding = Get-AcceptanceBinding "CloudflareRead" $resolvedDesiredState $resolvedConfig
    $script:readToken = Get-AcceptanceCredential "CloudflareRead" $binding
    $script:readEnvironment["CLOUDFLARE_API_TOKEN"] = $script:readToken

    $preflightPlan = Get-RequiredPlan ([string]$preflight.Phase6A.plan.fingerprint)
    $supportedMissing = @($preflightPlan.checks | Where-Object {
        $_.id -match '^dns\.(human|admin|machine)\.record$' -and $_.classification -eq "missing" -and $_.action -eq "create"
    })
    foreach ($missing in $supportedMissing) {
        $context = ([regex]::Match([string]$missing.id, '^dns\.(human|admin|machine)\.record$')).Groups[1].Value
        Add-Record "P6B1-PRODUCTION-CANDIDATE" "INFO" @{
            checkId = [string]$missing.id
            hostname = [string]$desiredConfig.access.applications.PSObject.Properties[$context].Value.hostname
            content = "$($preflightPlan.observed.tunnel.selected.id).cfargotunnel.com"
            proxied = $true
        }
    }
    $unsupportedDrift = @($preflightPlan.checks | Where-Object {
        $_.classification -ne "in_sync" -and -not ($_.id -match '^dns\.(human|admin|machine)\.record$' -and $_.classification -eq "missing" -and $_.action -eq "create")
    })
    if ($unsupportedDrift.Count -gt 0) { throw "P6B1_UNSUPPORTED_LIVE_DRIFT" }

    if ($supportedMissing.Count -eq 0) {
        Add-Record "P6B1-NO-SUPPORTED-PRODUCTION-DRIFT" "PASS" @{ state = "NO_SUPPORTED_PRODUCTION_DRIFT"; fingerprint = $preflightPlan.fingerprint }
        $noopCheck = "dns.human.record"
        $noWriteEnvironment = @{} + $script:readEnvironment
        $noWrite = Invoke-CloudflareApply -Plan $preflightPlan -CheckId $noopCheck -WithWriteToken $false
        $noWriteCode = Get-ErrorCode $noWrite.Stderr
        if ($noWrite.ExitCode -eq 0 -or $noWriteCode -ne "CLOUDFLARE_APPLY_REJECTED") {
            throw "P6B1_IN_SYNC_APPLY_DID_NOT_FAIL_CLOSED_$noWriteCode"
        }
        Add-Record "P6B1-W4" "PASS" @{ result = $noWriteCode; writeCredentialProvided = $false; mutation = "none" }
    } else {
        Ensure-WriteToken
        foreach ($missing in $supportedMissing) {
            $currentPlan = Get-RequiredPlan
            $currentCheck = @($currentPlan.checks | Where-Object { $_.id -eq $missing.id -and $_.classification -eq "missing" -and $_.action -eq "create" })
            if ($currentCheck.Count -ne 1) { throw "P6B1_PRODUCTION_PLAN_CHANGED" }
            $apply = Invoke-CloudflareApply -Plan $currentPlan -CheckId ([string]$missing.id) -WithWriteToken $true
            $applyValue = Get-JsonValue $apply.Stdout
            if ($apply.ExitCode -ne 0 -or $null -eq $applyValue -or $applyValue.status -ne "applied" -or $applyValue.oldFingerprintInvalidated -ne $true) {
                if ((($apply.Stdout + "`n" + $apply.Stderr) -match '\bLOGIN_REQUIRED\b')) { Write-LoginRequiredResume }
                $applyCode = Get-ErrorCode $apply.Stderr
                throw "P6B1_PRODUCTION_APPLY_FAILED_$applyCode"
            }
        }
        $inSync = Get-RequiredPlan
        if (@($inSync.checks | Where-Object { $_.classification -ne "in_sync" }).Count -ne 0) {
            throw "P6B1_PRODUCTION_PLAN_NOT_IN_SYNC_AFTER_SUPPORTED_APPLY"
        }
        Add-Record "P6B1-PRODUCTION-DRIFT" "PASS" @{ repairedCheckCount = $supportedMissing.Count; finalPlan = "in_sync" }
    }

    Ensure-WriteToken
    $canary = Run-Canary
    Add-Record "P6B1-W3" "PASS" @{ name = $canary.name; recordId = $canary.recordId; type = "TXT"; cleanupVerified = $true }

    $postflight = Invoke-Phase6AAcceptance "POST"
    Add-Record "P6B1-W5" "PASS" @{ phase6aTotal = 14; phase6aPassed = 14; phase5cPassed = $postflight.Phase5CCount; listeners = "127.0.0.1:17281,127.0.0.1:17282" }
} catch {
    $message = [string]$_.Exception.Message
    if ($message -match '^(P6B1_[A-Z0-9,_-]{1,180})$') { $script:failureCode = $Matches[1] } else { $script:failureCode = "P6B1_ACCEPTANCE_FAILED" }
    Add-Record "P6B1-FAIL" "FAIL" @{ code = $script:failureCode }
} finally {
    $script:readToken = $null
    $script:writeToken = $null
    if ($null -ne $script:writeTokenSecure) { $script:writeTokenSecure.Dispose() }
    foreach ($key in @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_DNS_WRITE_TOKEN")) {
        if ($script:readEnvironment.ContainsKey($key)) { $script:readEnvironment[$key] = "" }
        if ($script:writeEnvironment.ContainsKey($key)) { $script:writeEnvironment[$key] = "" }
    }
    Write-Evidence
}

$passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
$failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
$summary = [ordered]@{ id = "P6B1-SUMMARY"; result = $(if ($failed -eq 0) { "PASS" } else { "FAIL" }); total = $records.Count; passed = $passed; failed = $failed; commit = $script:commit; evidence = $evidencePath }
Write-Host ($summary | ConvertTo-Json -Compress)
if ($failed -ne 0) { exit 1 }
