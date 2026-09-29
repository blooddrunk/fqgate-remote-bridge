[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DesiredStatePath,
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$TunnelIngressConfigPath,
    [string]$ApplyCheckId,
    [string]$B2WriteProfilePath
)

$ErrorActionPreference = "Stop"
$standardPathExt = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC"
$currentPathExt = [string]$env:PATHEXT
if ($currentPathExt -notmatch "(?i)(^|;)\.EXE(;|$)" -or $currentPathExt -notmatch "(?i)(^|;)\.CMD(;|$)") {
    $env:PATHEXT = if ([string]::IsNullOrWhiteSpace($currentPathExt)) { $standardPathExt } else { "$standardPathExt;$currentPathExt" }
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$evidencePath = "D:\code\research\fqgate-phase6b2-acceptance-evidence.json"
$phase6aEvidencePath = "D:\code\research\fqgate-phase6a-discovery-evidence.json"
$records = [System.Collections.Generic.List[object]]::new()
$secrets = @{}
$secureValues = [System.Collections.Generic.List[Security.SecureString]]::new()
$node = $null
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$commit = ""
$beforeFingerprint = ""
$afterFingerprint = ""
$mutationCount = 0
$failure = $null

function Add-Record([string]$Id, [string]$Result, [hashtable]$Metadata = @{}) {
    $item = [ordered]@{ id = $Id; result = $Result }
    foreach ($key in $Metadata.Keys) { $item[$key] = $Metadata[$key] }
    $item.timestamp = [DateTime]::UtcNow.ToString("o")
    $records.Add([pscustomobject]$item)
    Write-Host ($item | ConvertTo-Json -Compress -Depth 5)
}

function Invoke-BoundedProcess([string]$File, [string[]]$Arguments, [hashtable]$Environment = @{}, [int]$TimeoutMs = 1200000) {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $File
    $start.Arguments = ($Arguments | ForEach-Object {
        $value = [string]$_
        if ($value -notmatch '[\s"]') { $value } else { '"' + $value.Replace('"', '\"') + '"' }
    }) -join " "
    $start.WorkingDirectory = $root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($key in @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_DNS_WRITE_TOKEN", "CLOUDFLARE_B2_WRITE_TOKEN", "CLOUDFLARE_B2_SCOPE_READ_TOKEN", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET")) {
        $start.EnvironmentVariables.Remove($key)
    }
    foreach ($key in $Environment.Keys) { $start.EnvironmentVariables[[string]$key] = [string]$Environment[$key] }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw "P6B2_CHILD_START_FAILED" }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill() } catch { }
            throw "P6B2_CHILD_TIMEOUT"
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($stdout.Length -gt 2MB -or $stderr.Length -gt 2MB) { throw "P6B2_CHILD_OUTPUT_TOO_LARGE" }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
    } finally {
        foreach ($key in $Environment.Keys) { $start.EnvironmentVariables.Remove([string]$key) }
        $process.Dispose()
    }
}

function Read-Json([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 2MB) { return $null }
    try { return $Text.Trim() | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
}

function Convert-Secure([Security.SecureString]$Value) {
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
}

function Get-HiddenToken([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    if ($null -eq $secure -or $secure.Length -lt 8) { throw "P6B2_HIDDEN_TOKEN_INVALID" }
    $secureValues.Add($secure)
    return Convert-Secure $secure
}

function Invoke-Plan([string]$Desired) {
    $result = Invoke-BoundedProcess $node @((Join-Path $root "dist\cli\main.js"), "cloudflare", "plan", "--desired-state", $Desired, "--json") $secrets 120000
    $plan = Read-Json $result.Stdout
    if ($result.ExitCode -ne 0 -or $null -eq $plan -or $plan.readOnly -ne $true -or $plan.fingerprint -notmatch '^[a-f0-9]{64}$' -or $plan.mutationMethods.Count -ne 0) { throw "P6B2_LIVE_PLAN_FAILED" }
    return $plan
}

function Invoke-Phase6A([string]$Stage, [string]$Desired, [string]$Config, [string]$Ingress, [bool]$RunRemote) {
    $arguments = @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\windows\phase6a-acceptance.ps1"),
        "-DesiredStatePath", $Desired, "-ConfigPath", $Config, "-TunnelIngressConfigPath", $Ingress,
        "-CredentialSource", "Vault", "-RunQualityGates", "-AllowPhase6B2ReviewBranch"
    )
    if ($RunRemote) { $arguments += "-RunPhase5CRemoteRegression" }
    $result = Invoke-BoundedProcess $powershell $arguments @{} 2400000
    $expectedExit = if ($RunRemote) { 0 } else { 1 }
    $expectedSummary = if ($RunRemote) { '"result":"PASS"' } else { '"result":"INCOMPLETE"' }
    if ($result.ExitCode -ne $expectedExit -or $result.Stdout -notmatch [regex]::Escape($expectedSummary)) {
        if (($result.Stdout + $result.Stderr) -match '\bLOGIN_REQUIRED\b') {
            Write-Host "MANUAL_FQGATE_LOGIN_REQUIRED: open http://127.0.0.1:17282/login, start the existing QR flow, physically scan and approve. Resume: .\scripts\windows\phase6b2-acceptance.ps1 -DesiredStatePath `"$Desired`" -ConfigPath `"$Config`" -TunnelIngressConfigPath `"$Ingress`""
        }
        throw "P6B2_$Stage`_PHASE6A_FAILED"
    }
    $evidence = Get-Content -LiteralPath $phase6aEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
    $expectedPassed = if ($RunRemote) { 14 } else { 13 }
    $expectedSkipped = if ($RunRemote) { 0 } else { 1 }
    if ($evidence.commit -ne $commit -or $evidence.summary.total -ne 14 -or $evidence.summary.passed -ne $expectedPassed -or $evidence.summary.failed -ne 0 -or $evidence.summary.manual -ne 0 -or $evidence.summary.skipped -ne $expectedSkipped) {
        throw "P6B2_$Stage`_PHASE6A_COUNTS_INVALID"
    }
    Add-Record "P6B2-$Stage-P6A" "PASS" @{ checks = 14; passed = $expectedPassed; fingerprint = [string]$evidence.plan.fingerprint; quality = "frozen-install,typecheck,lint,test,build,format,e2e"; remoteMachine = $(if ($RunRemote) { "phase5c" } else { "postcheck-pending" }) }
    return $evidence
}

function Assert-Loopback {
    foreach ($port in @(17281, 17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") { throw "P6B2_LOOPBACK_LISTENER_FAILED_$port" }
    }
    Add-Record "P6B2-LOOPBACK" "PASS" @{ fqgate = "127.0.0.1:17281"; bridge = "127.0.0.1:17282" }
}

try {
    if ($root -ne $expectedRoot -or -not (Test-Path -LiteralPath (Join-Path $root ".git"))) { throw "P6B2_PERMANENT_WINDOWS_CHECKOUT_REQUIRED" }
    $env:GIT_CONFIG_COUNT = "1"
    $env:GIT_CONFIG_KEY_0 = "safe.directory"
    $env:GIT_CONFIG_VALUE_0 = "D:/code/research/fqgate-remote-bridge"
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $commit = (& $git -C $root rev-parse HEAD).Trim()
    $branch = (& $git -C $root branch --show-current).Trim()
    $status = @(& $git -C $root status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($branch -ne "codex/phase-6-b2" -or $status.Count -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') { throw "P6B2_CLEAN_REVIEW_COMMIT_REQUIRED" }
    Add-Record "P6B2-CHECKOUT" "PASS" @{ branch = $branch; commit = $commit; workingTree = "clean" }
    $desired = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    $config = (Resolve-Path -LiteralPath $ConfigPath).Path
    $ingress = (Resolve-Path -LiteralPath $TunnelIngressConfigPath).Path
    foreach ($path in @($desired, $config, $ingress)) {
        if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "P6B2_CONFIG_MUST_REMAIN_REPO_EXTERNAL" }
    }
    $pre = Invoke-Phase6A "PRE" $desired $config $ingress $false
    . (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
    $binding = Get-AcceptanceBinding "CloudflareRead" $desired $config
    $secrets["CLOUDFLARE_API_TOKEN"] = Get-AcceptanceCredential "CloudflareRead" $binding
    $plan = Invoke-Plan $desired
    if ($plan.fingerprint -ne $pre.plan.fingerprint) { throw "P6B2_PREFLIGHT_PLAN_CHANGED" }
    $beforeFingerprint = [string]$plan.fingerprint
    $drift = @($plan.checks | Where-Object { $_.classification -ne "in_sync" })
    $cli = Join-Path $root "dist\cli\main.js"
    if ($drift.Count -eq 0) {
        $noop = Invoke-BoundedProcess $node @($cli, "cloudflare", "apply", "--desired-state", $desired, "--expected-fingerprint", $beforeFingerprint, "--check-id", "tunnel.ingress.human.route", "--json") $secrets 120000
        $errorValue = Read-Json $noop.Stderr
        if ($noop.ExitCode -eq 0 -or $errorValue.error.code -ne "CLOUDFLARE_APPLY_REJECTED" -or $errorValue.error.message -notmatch 'zero writes') { throw "P6B2_IN_SYNC_NOOP_PROOF_FAILED" }
        Add-Record "P6B2-NOOP" "PASS" @{ classification = "in_sync"; fingerprint = $beforeFingerprint; writeCredentialProvided = $false; mutationCount = 0 }
    } else {
        if ([string]::IsNullOrWhiteSpace($ApplyCheckId) -or @($drift | Where-Object { $_.id -eq $ApplyCheckId }).Count -ne 1) { throw "P6B2_EXACT_REVIEWED_CHECK_ID_REQUIRED" }
        $arguments = @($cli, "cloudflare", "apply", "--desired-state", $desired, "--expected-fingerprint", $beforeFingerprint, "--check-id", $ApplyCheckId, "--json")
        if ($ApplyCheckId -match '^dns\.(human|admin|machine)\.record$') {
            $secrets["CLOUDFLARE_DNS_WRITE_TOKEN"] = Get-HiddenToken "Short-lived exact-zone DNS-write token (hidden)"
        } else {
            if ([string]::IsNullOrWhiteSpace($B2WriteProfilePath)) { throw "P6B2_EXACT_WRITE_PROFILE_REQUIRED" }
            $profilePath = (Resolve-Path -LiteralPath $B2WriteProfilePath).Path
            if ($profilePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "P6B2_PROFILE_MUST_REMAIN_REPO_EXTERNAL" }
            $profile = Invoke-BoundedProcess $node @($cli, "cloudflare", "b2-profile-fingerprint", "--b2-write-profile", $profilePath, "--json") @{} 120000
            $profileValue = Read-Json $profile.Stdout
            if ($profile.ExitCode -ne 0 -or $profileValue.fingerprint -notmatch '^[a-f0-9]{64}$') { throw "P6B2_PROFILE_INVALID" }
            $arguments += @("--b2-write-profile", $profilePath, "--expected-b2-profile-fingerprint", [string]$profileValue.fingerprint)
            $secrets["CLOUDFLARE_B2_WRITE_TOKEN"] = Get-HiddenToken "Short-lived exact-account Tunnel/Access-write token (hidden)"
            $secrets["CLOUDFLARE_B2_SCOPE_READ_TOKEN"] = Get-HiddenToken "Short-lived account-token scope-read credential (hidden)"
        }
        $applied = Invoke-BoundedProcess $node $arguments $secrets 420000
        $result = Read-Json $applied.Stdout
        if ($applied.ExitCode -ne 0 -or $result.status -ne "applied") {
            $applyError = Read-Json $applied.Stderr
            if ($applyError.error.code -eq "CLOUDFLARE_MANUAL_REQUIRED") {
                $dashboard = if ($ApplyCheckId -like "tunnel.*") { "Cloudflare Zero Trust > Networks > Tunnels > intended Tunnel > Public Hostnames; field: exact hostname, Bridge origin, Access AUD" } else { "Cloudflare Zero Trust > Access > Applications > identified application/policy; field: exact hostname/AUD or policy selector/MFA" }
                Write-Host "MANUAL_REQUIRED checkId=$ApplyCheckId resource=$($applyError.error.message) dashboard=$dashboard expected=repo-external desired-state and exact profile; reason=API write or postcondition uncertain; doNotChange=other Tunnel/Access/DNS/token resources"
                Write-Host "Read-only resume: .\scripts\windows\phase6b2-acceptance.ps1 -DesiredStatePath `"$desired`" -ConfigPath `"$config`" -TunnelIngressConfigPath `"$ingress`""
            }
            throw "P6B2_BOUNDED_APPLY_FAILED"
        }
        $mutationCount = 1
        Add-Record "P6B2-ONE-ACTION" "PASS" @{ checkId = $ApplyCheckId; resourceType = [string]$result.resourceType; resourceId = [string]$result.resourceId; fingerprintBefore = [string]$result.fingerprintBefore; fingerprintAfter = [string]$result.fingerprintAfter; mutationCount = 1 }
    }
    $postPlan = Invoke-Plan $desired
    $afterFingerprint = [string]$postPlan.fingerprint
    if (@($postPlan.checks | Where-Object { $_.classification -ne "in_sync" }).Count -ne 0) { throw "P6B2_POST_PLAN_NOT_IN_SYNC" }
    Add-Record "P6B2-POST-PLAN" "PASS" @{ classification = "in_sync"; fingerprint = $afterFingerprint; mutationCount = $mutationCount }
    $post = Invoke-Phase6A "POST" $desired $config $ingress $true
    if ($post.plan.fingerprint -ne $afterFingerprint) { throw "P6B2_POST_ACCEPTANCE_PLAN_CHANGED" }
    # The existing headed harness requires a real terminal for operator Access login/MFA.
    & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\windows\phase45-acceptance.ps1") -ConfigPath $config -RunAuthenticatedBrowserMatrix
    if ($LASTEXITCODE -ne 0) { throw "P6B2_PHASE45_BROWSER_FAILED" }
    Add-Record "P6B2-PHASE45-BROWSER" "PASS" @{ contexts = "ordinary,admin" }
    foreach ($spec in @(
        @{ Id = "P6B2-P5A-LOCAL"; File = "phase5a-acceptance.ps1"; Args = @("-ConfigPath", $config, "-VerifyLocal") },
        @{ Id = "P6B2-P5B-LOCAL"; File = "phase5b-acceptance.ps1"; Args = @("-ConfigPath", $config, "-Census", "-VerifyLocal") },
        @{ Id = "P6B2-P5C-LOCAL"; File = "phase5c-acceptance.ps1"; Args = @("-ConfigPath", $config, "-VerifyLocal") }
    )) {
        $check = Invoke-BoundedProcess $powershell (@("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\windows\$($spec.File)")) + $spec.Args) @{} 900000
        if ($check.ExitCode -ne 0) { throw "$($spec.Id)_FAILED" }
        Add-Record $spec.Id "PASS"
    }
    Assert-Loopback
} catch {
    $message = [string]$_.Exception.Message
    $failure = if ($message -match '^P6B2_[A-Z0-9_-]{1,180}$') { $message } else { "P6B2_ACCEPTANCE_FAILED" }
    Add-Record "P6B2-FAIL" "FAIL" @{ code = $failure }
} finally {
    foreach ($key in @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_DNS_WRITE_TOKEN", "CLOUDFLARE_B2_WRITE_TOKEN", "CLOUDFLARE_B2_SCOPE_READ_TOKEN")) {
        if ($secrets.ContainsKey($key)) { $secrets[$key] = ""; $secrets.Remove($key) }
    }
    foreach ($value in $secureValues) { $value.Dispose() }
    foreach ($key in @("GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0")) { [Environment]::SetEnvironmentVariable($key, $null, "Process") }
    $passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
    $failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
    $evidence = [ordered]@{
        schemaVersion = 1; task = "phase-6-b2-bounded-tunnel-access-provisioning"; generatedAt = [DateTime]::UtcNow.ToString("o")
        commit = $commit; fingerprintBefore = $beforeFingerprint; fingerprintAfter = $afterFingerprint; mutationCount = $mutationCount
        records = @($records); summary = [ordered]@{ total = $records.Count; passed = $passed; failed = $failed }
    }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 128KB) { throw "P6B2_EVIDENCE_TOO_LARGE" }
    [System.IO.File]::WriteAllText($evidencePath, $json, [System.Text.UTF8Encoding]::new($false))
}
if ($null -ne $failure) { exit 1 }
