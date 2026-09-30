[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$DesiredStatePath,
    [Parameter(Mandatory=$true)][string]$ConfigPath,
    [Parameter(Mandatory=$true)][string]$TunnelIngressConfigPath
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedRoot = 'D:\code\research\fqgate-remote-bridge'
$evidencePath = 'D:\code\research\fqgate-phase6c-closure-evidence.json'
$phase6aEvidencePath = 'D:\code\research\fqgate-phase6a-discovery-evidence.json'
$records = [Collections.Generic.List[object]]::new()
$commit = ''
$fingerprint = ''
$failure = $null

function Record([string]$Id,[string]$Result) {
    $records.Add([pscustomobject]@{ id=$Id; result=$Result })
    Write-Host "$Id $Result"
}

function Run-Phase([string]$Id,[string]$File,[string[]]$Arguments) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\windows\$File") @Arguments
    if ($LASTEXITCODE -ne 0) { throw "P6C_$($Id)_FAILED" }
    Record $Id 'PASS'
}

try {
    if ($root -ne $expectedRoot) { throw 'P6C_PERMANENT_CHECKOUT_REQUIRED' }
    $env:PATHEXT = '.COM;.EXE;.BAT;.CMD;' + [string]$env:PATHEXT
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ms-playwright'
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'safe.directory'
    $env:GIT_CONFIG_VALUE_0 = 'D:/code/research/fqgate-remote-bridge'
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $commit = (& $git -C $root rev-parse HEAD).Trim()
    $branch = (& $git -C $root branch --show-current).Trim()
    $dirty = @(& $git -C $root status --porcelain | Where-Object { $_ }).Count
    if ($commit -notmatch '^[a-f0-9]{40}$' -or $branch -notin @('codex/phase-6-c','main') -or $dirty -ne 0) { throw 'P6C_CLEAN_REVIEW_COMMIT_REQUIRED' }
    Record 'P6C-CHECKOUT' 'PASS'
    $desired = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    $config = (Resolve-Path -LiteralPath $ConfigPath).Path
    $ingress = (Resolve-Path -LiteralPath $TunnelIngressConfigPath).Path
    foreach ($path in @($desired,$config,$ingress)) {
        if ($path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'P6C_EXTERNAL_INPUT_REQUIRED' }
    }
    foreach ($key in @('CLOUDFLARE_DNS_WRITE_TOKEN','CLOUDFLARE_B2_WRITE_TOKEN','CLOUDFLARE_B2_SCOPE_READ_TOKEN')) {
        [Environment]::SetEnvironmentVariable($key,$null,'Process')
    }
    $pnpm = (Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $routeTree = Join-Path $root 'src\routeTree.gen.ts'
    $baseline = [IO.File]::ReadAllBytes($routeTree)
    foreach ($gate in @(
        @{ id='P6C-Q1'; args=@('install','--frozen-lockfile') },
        @{ id='P6C-Q2'; args=@('typecheck') },
        @{ id='P6C-Q3'; args=@('lint') },
        @{ id='P6C-Q4'; args=@('test') },
        @{ id='P6C-Q5'; args=@('build') },
        @{ id='P6C-Q6'; args=@('format:check') },
        @{ id='P6C-Q7'; args=@('test:e2e') }
    )) {
        try { & $pnpm @($gate.args) } finally { [IO.File]::WriteAllBytes($routeTree,$baseline) }
        if ($LASTEXITCODE -ne 0) { throw "P6C_$($gate.id)_FAILED" }
        Record $gate.id 'PASS'
    }
    Run-Phase 'P6C-PRE-AUDIT' 'phase6c-credential-audit.ps1' @('-DesiredStatePath',$desired,'-ConfigPath',$config,'-Stage','Pre')
    $pre = Get-Content -LiteralPath 'D:\code\research\fqgate-phase6c-audit-pre.json' -Raw | ConvertFrom-Json
    if ($pre.commit -ne $commit -or $pre.summary.total -ne 9 -or $pre.summary.passed -ne 9) { throw 'P6C_PRE_AUDIT_EVIDENCE_INVALID' }
    $fingerprint = [string]$pre.planFingerprint

    $phase6aArgs = @('-DesiredStatePath',$desired,'-ConfigPath',$config,'-TunnelIngressConfigPath',$ingress,'-CredentialSource','Vault','-RunQualityGates','-RunPhase5CRemoteRegression')
    if ($branch -eq 'codex/phase-6-c') { $phase6aArgs += '-AllowPhase6CReviewBranch' }
    Run-Phase 'P6C-P6A-AND-MACHINE' 'phase6a-acceptance.ps1' $phase6aArgs
    $phase6a = Get-Content -LiteralPath $phase6aEvidencePath -Raw | ConvertFrom-Json
    if ($phase6a.commit -ne $commit -or $phase6a.plan.fingerprint -ne $fingerprint -or $phase6a.summary.total -ne 14 -or $phase6a.summary.passed -ne 14 -or $phase6a.summary.failed -ne 0) { throw 'P6C_PHASE6A_EVIDENCE_INVALID' }
    Run-Phase 'P6C-HUMAN-ADMIN' 'phase45-acceptance.ps1' @('-ConfigPath',$config,'-RunAuthenticatedBrowserMatrix')
    Run-Phase 'P6C-P5A-LOCAL' 'phase5a-acceptance.ps1' @('-ConfigPath',$config,'-VerifyLocal')
    Run-Phase 'P6C-P5B-LOCAL' 'phase5b-acceptance.ps1' @('-ConfigPath',$config,'-Census','-VerifyLocal')
    Run-Phase 'P6C-P5C-LOCAL' 'phase5c-acceptance.ps1' @('-ConfigPath',$config,'-VerifyLocal')
    foreach ($port in @(17281,17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'P6C_LISTENER_FAILED' }
    }
    Record 'P6C-LISTENER' 'PASS'
    Run-Phase 'P6C-POST-AUDIT' 'phase6c-credential-audit.ps1' @('-DesiredStatePath',$desired,'-ConfigPath',$config,'-Stage','Post')
    $post = Get-Content -LiteralPath 'D:\code\research\fqgate-phase6c-audit-post.json' -Raw | ConvertFrom-Json
    if ($post.commit -ne $commit -or $post.planFingerprint -ne $fingerprint -or $post.summary.passed -ne 9 -or
        (@($pre.records | ForEach-Object { "$($_.id):$($_.result)" }) -join ',') -ne (@($post.records | ForEach-Object { "$($_.id):$($_.result)" }) -join ',')) { throw 'P6C_AUDIT_OUTCOME_CHANGED' }
    Record 'P6C-PRE-POST-EQUAL' 'PASS'
} catch {
    $code = [string]$_.Exception.Message
    if ($code -notmatch '^P6C_[A-Z0-9_-]{1,100}$') { $code = 'P6C_ACCEPTANCE_FAILED' }
    $failure = $code
    Record 'P6C-FAIL' 'FAIL'
    Write-Host "P6C-FAIL code=$code"
} finally {
    foreach ($key in @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
    $passed = @($records | Where-Object result -eq 'PASS').Count
    $failed = @($records | Where-Object result -eq 'FAIL').Count
    $evidence = [ordered]@{ schemaVersion=1; task='phase-6-c-live-closure'; commit=$commit; planFingerprint=$fingerprint; preAuditId=$(if ($null -eq $failure) { 'P6C-PRE-AUDIT:PASS' } else { '' }); postAuditId=$(if ($null -eq $failure) { 'P6C-POST-AUDIT:PASS' } else { '' }); records=@($records); summary=[ordered]@{ total=$records.Count; passed=$passed; failed=$failed }; failureCode=$failure }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 16384 -or $json -match '(?i)(cfast_|eyJ[A-Za-z0-9_-]{20,}|authorization|cookie|assertion|client[_-]?secret|api[_-]?token)') { throw 'P6C_EVIDENCE_SECRET_REJECTED' }
    [IO.File]::WriteAllText($evidencePath,$json,[Text.UTF8Encoding]::new($false))
}
if ($null -ne $failure) { exit 1 }
