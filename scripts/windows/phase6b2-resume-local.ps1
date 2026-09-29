[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$DesiredStatePath,
    [Parameter(Mandatory=$true)][string]$ConfigPath,
    [Parameter(Mandatory=$true)][string]$TunnelIngressConfigPath
)

$ErrorActionPreference = "Stop"
$env:PATHEXT = ".COM;.EXE;.BAT;.CMD;$env:PATHEXT"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$previousPath = "D:\code\research\fqgate-phase6b2-acceptance-evidence.json"
$phase6aPath = "D:\code\research\fqgate-phase6a-discovery-evidence.json"
$evidencePath = "D:\code\research\fqgate-phase6b2-resume-evidence.json"
$records = [System.Collections.Generic.List[object]]::new()
$previousFailure = ""
$previousCommit = ""
$currentCommit = ""
$fingerprint = ""
$failure = $null

function Add-Record([string]$Id, [string]$Result, [hashtable]$Metadata = @{}) {
    $record = [ordered]@{ id=$Id; result=$Result; timestamp=[DateTime]::UtcNow.ToString("o") }
    foreach ($key in $Metadata.Keys) { $record[$key] = $Metadata[$key] }
    $records.Add([pscustomobject]$record)
    Write-Host ($record | ConvertTo-Json -Compress -Depth 5)
}

function Assert-PriorPass($Evidence, [string]$Id) {
    if (@($Evidence.records | Where-Object { $_.id -eq $Id -and $_.result -eq "PASS" }).Count -ne 1) {
        throw "P6B2_RESUME_PRIOR_EVIDENCE_INVALID"
    }
}

try {
    if ($root -ne $expectedRoot) { throw "P6B2_RESUME_PERMANENT_CHECKOUT_REQUIRED" }
    $env:GIT_CONFIG_COUNT = "1"
    $env:GIT_CONFIG_KEY_0 = "safe.directory"
    $env:GIT_CONFIG_VALUE_0 = "D:/code/research/fqgate-remote-bridge"
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $currentCommit = (& $git -C $root rev-parse HEAD).Trim()
    $branch = (& $git -C $root branch --show-current).Trim()
    $status = @(& $git -C $root status --porcelain | Where-Object { $_ })
    if ($branch -ne "codex/phase-6-b2" -or $status.Count -ne 0 -or $currentCommit -notmatch '^[a-f0-9]{40}$') {
        throw "P6B2_RESUME_CLEAN_REVIEW_COMMIT_REQUIRED"
    }
    $desired = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    $config = (Resolve-Path -LiteralPath $ConfigPath).Path
    $ingress = (Resolve-Path -LiteralPath $TunnelIngressConfigPath).Path
    foreach ($path in @($desired,$config,$ingress)) {
        if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "P6B2_RESUME_EXTERNAL_INPUT_REQUIRED" }
    }
    $previous = Get-Content -LiteralPath $previousPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $previousCommit = [string]$previous.commit
    $fingerprint = [string]$previous.fingerprintAfter
    if ($previousCommit -notmatch '^[a-f0-9]{40}$' -or $fingerprint -notmatch '^[a-f0-9]{64}$' -or
        $previous.fingerprintBefore -ne $fingerprint -or $previous.mutationCount -ne 0 -or
        $previous.summary.failed -ne 1 -or @($previous.records | Where-Object { $_.result -eq "FAIL" }).Count -ne 1) {
        throw "P6B2_RESUME_PRIOR_EVIDENCE_INVALID"
    }
    foreach ($id in @("P6B2-CHECKOUT","P6B2-PRE-P6A","P6B2-NOOP","P6B2-POST-PLAN","P6B2-POST-P6A","P6B2-PHASE45-BROWSER")) {
        Assert-PriorPass $previous $id
    }
    $last = $previous.records[-1]
    if ($last.id -ne "P6B2-FAIL" -or $last.result -ne "FAIL" -or
        @($previous.records | Where-Object { $_.id -eq "P6B2-P5B-LOCAL" -and $_.result -eq "PASS" }).Count -ne 0) {
        throw "P6B2_RESUME_NOT_LOCAL_FAILURE"
    }
    $previousFailure = [string]$last.code
    & $git -C $root merge-base --is-ancestor $previousCommit HEAD
    if ($LASTEXITCODE -ne 0) { throw "P6B2_RESUME_UNRELATED_COMMIT" }
    $changed = @(& $git -C $root diff --name-only $previousCommit HEAD)
    foreach ($name in $changed) {
        if ($name -notin @("scripts/windows/phase6b2-resume-local.ps1", "scripts/windows/phase6b2-acceptance.ps1", "tests/windows-scripts.test.ts", "docs/operations/windows-phase-6-b2-acceptance.md", "docs/status/phase-6-b2-implementation-handoff.md")) {
            throw "P6B2_RESUME_RUNTIME_CHANGED"
        }
    }
    Add-Record "P6B2-RESUME-PRIOR" "PASS" @{ priorCommit=$previousCommit; currentCommit=$currentCommit; fingerprint=$fingerprint; priorFailure=$previousFailure; browser="ordinary-and-admin-PASS" }
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\windows\phase6a-acceptance.ps1") -DesiredStatePath $desired -ConfigPath $config -TunnelIngressConfigPath $ingress -CredentialSource Vault -RunQualityGates -RunPhase5CRemoteRegression -AllowPhase6B2ReviewBranch | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "P6B2_RESUME_PHASE6A_FAILED" }
    $phase6a = Get-Content -LiteralPath $phase6aPath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($phase6a.commit -ne $currentCommit -or $phase6a.plan.fingerprint -ne $fingerprint -or
        $phase6a.summary.total -ne 14 -or $phase6a.summary.passed -ne 14 -or $phase6a.summary.failed -ne 0) {
        throw "P6B2_RESUME_PHASE6A_EVIDENCE_INVALID"
    }
    Add-Record "P6B2-RESUME-P6A" "PASS" @{ checks=14; fingerprint=$fingerprint; remoteMachine="phase5c" }
    foreach ($spec in @(
        @{ Id="P6B2-RESUME-P5A-LOCAL"; File="phase5a-acceptance.ps1"; Args=@("-ConfigPath",$config,"-VerifyLocal") },
        @{ Id="P6B2-RESUME-P5B-LOCAL"; File="phase5b-acceptance.ps1"; Args=@("-ConfigPath",$config,"-Census","-VerifyLocal") },
        @{ Id="P6B2-RESUME-P5C-LOCAL"; File="phase5c-acceptance.ps1"; Args=@("-ConfigPath",$config,"-VerifyLocal") }
    )) {
        $arguments = $spec.Args
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\windows\$($spec.File)") @arguments | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "$($spec.Id)_FAILED" }
        Add-Record $spec.Id "PASS"
    }
    foreach ($port in @(17281,17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") { throw "P6B2_RESUME_LOOPBACK_FAILED" }
    }
    Add-Record "P6B2-RESUME-LOOPBACK" "PASS" @{ fqgate="127.0.0.1:17281"; bridge="127.0.0.1:17282" }
} catch {
    $message = [string]$_.Exception.Message
    $failure = if ($message -match '^P6B2[_-][A-Z0-9_-]{1,180}$') { $message } else { "P6B2_RESUME_FAILED" }
    Add-Record "P6B2-RESUME-FAIL" "FAIL" @{ code=$failure }
} finally {
    foreach ($key in @("GIT_CONFIG_COUNT","GIT_CONFIG_KEY_0","GIT_CONFIG_VALUE_0")) { [Environment]::SetEnvironmentVariable($key,$null,"Process") }
    $passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
    $failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
    $evidence = [ordered]@{ schemaVersion=1; task="phase-6-b2-resume-local"; generatedAt=[DateTime]::UtcNow.ToString("o"); previousCommit=$previousCommit; currentCommit=$currentCommit; fingerprint=$fingerprint; previousFailure=$previousFailure; mutationCount=0; records=@($records); summary=[ordered]@{ total=$records.Count; passed=$passed; failed=$failed } }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 64KB) { throw "P6B2_RESUME_EVIDENCE_TOO_LARGE" }
    [System.IO.File]::WriteAllText($evidencePath,$json,[System.Text.UTF8Encoding]::new($false))
}
if ($null -ne $failure) { exit 1 }
