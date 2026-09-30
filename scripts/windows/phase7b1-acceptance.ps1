[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigPath)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedRoot = 'D:\code\research\fqgate-remote-bridge'
$evidencePath = 'D:\code\research\fqgate-phase7b1-acceptance-evidence.json'
$records = [Collections.Generic.List[object]]::new()
$commit = ''
$failure = $null
$failureReason = $null
$snapshot = $null
$plan = $null
$before = $null
$after = $null
$journal = $null
$history = $null
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD;' + [string]$env:PATHEXT
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ms-playwright'
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'safe.directory'
$env:GIT_CONFIG_VALUE_0 = 'D:/code/research/fqgate-remote-bridge'

function Record([string]$Id,[string]$Result) {
    $records.Add([pscustomobject]@{ id=$Id; result=$Result })
    Write-Host "$Id $Result"
}
function Gate([string]$Id,[scriptblock]$Action) {
    try { & $Action; Record $Id 'PASS' }
    catch {
        $detail = [string]$_.Exception.Message
        $script:failureReason = if ($detail -match '^[a-z0-9-]{1,80}$') { $detail } else { 'check-failed' }
        throw "${Id}_FAILED"
    }
}
function Invoke-Quality([string]$Id,[string[]]$Arguments) {
    try { & $pnpm @Arguments }
    finally { [IO.File]::WriteAllBytes($routeTreePath,$routeTreeBaseline) }
    if ($LASTEXITCODE -ne 0) { throw "${Id}_FAILED" }
    Record $Id 'PASS'
}
function Invoke-Supervisor([string[]]$Arguments) {
    $lines = @(& $node (Join-Path $root 'dist\cli\main.js') supervisor @Arguments --config $config --json)
    if ($LASTEXITCODE -ne 0 -or $lines.Count -ne 1 -or $lines[0].Length -gt 4096) { throw 'supervisor-command-failed' }
    return ($lines[0] | ConvertFrom-Json -ErrorAction Stop)
}
function Listener([int]$Port) {
    $items = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($items.Count -ne 1 -or $items[0].LocalAddress -ne '127.0.0.1') { throw "listener-$Port" }
    $pidValue = [int]$items[0].OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction Stop
    if ($null -eq $process -or $null -eq $process.CreationDate) { throw "process-identity-$Port" }
    return [ordered]@{ pid=$pidValue; start=$process.CreationDate.ToUniversalTime().ToString('o') }
}
function RuntimeIdentity {
    $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json -ErrorAction Stop
    $serviceName = [string]$settings.cloudflared.serviceName
    if ([string]::IsNullOrWhiteSpace($serviceName)) { $serviceName = 'FQGateRemoteBridgeCloudflared' }
    if ($serviceName -notmatch '^[A-Za-z0-9._-]{1,80}$') { throw 'service-name-invalid' }
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction Stop
    if ($null -eq $service -or $service.State -ne 'Running' -or $service.ProcessId -le 0) { throw 'tunnel-service-not-running' }
    $tunnelPid = [int]$service.ProcessId
    $tunnelProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelPid" -ErrorAction Stop
    if ($null -eq $tunnelProcess -or $null -eq $tunnelProcess.CreationDate) { throw 'tunnel-identity-unknown' }
    return [ordered]@{
        bridge=(Listener 17282)
        fqgate=(Listener 17281)
        tunnel=[ordered]@{ pid=$tunnelPid; start=$tunnelProcess.CreationDate.ToUniversalTime().ToString('o') }
    }
}

try {
    Set-Location $root
    $gitCommand = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $git = if ($null -ne $gitCommand) { $gitCommand.Source } else { 'C:\Program Files\Git\cmd\git.exe' }
    if (-not (Test-Path -LiteralPath $git)) { throw 'git-not-found' }
    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $pnpm = (Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    Gate 'P7B1-01-CHECKOUT' {
        if ($root -ne $expectedRoot) { throw 'wrong-checkout' }
        $script:commit = (& $git -C $root rev-parse HEAD).Trim()
        if ($commit -notmatch '^[a-f0-9]{40}$') { throw 'invalid-commit' }
        if (@(& $git -C $root status --porcelain | Where-Object { $_ }).Count -ne 0) { throw 'dirty-checkout' }
        $script:config = (Resolve-Path -LiteralPath $ConfigPath).Path
        if ($config.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'config-inside-repo' }
    }
    Gate 'P7B1-02-BASELINE' { $script:before = RuntimeIdentity }
    $versions = [ordered]@{ node=(& $node --version).Trim(); pnpm=(& $pnpm --version).Trim() }
    if ($versions.pnpm -ne '11.23.0') { throw 'pinned-pnpm-unavailable' }
    $routeTreePath = Join-Path $root 'src\routeTree.gen.ts'
    $routeTreeBaseline = [IO.File]::ReadAllBytes($routeTreePath)
    Invoke-Quality 'P7B1-03-INSTALL' @('install','--frozen-lockfile')
    Invoke-Quality 'P7B1-04-TYPECHECK' @('typecheck')
    Invoke-Quality 'P7B1-05-LINT' @('lint')
    Invoke-Quality 'P7B1-06-TEST' @('test')
    Invoke-Quality 'P7B1-07-BUILD' @('build')
    Invoke-Quality 'P7B1-08-FORMAT' @('format:check')
    Invoke-Quality 'P7B1-09-E2E' @('test:e2e')
    Gate 'P7B1-10-INSPECT' {
        $script:snapshot = Invoke-Supervisor @('inspect')
        if ($snapshot.schemaVersion -ne 1 -or $snapshot.bridge -ne 'ready' -or $snapshot.fqgate -ne 'ready' -or $snapshot.tunnel -ne 'running') { throw 'prerequisite-not-ready' }
    }
    Gate 'P7B1-11-HEALTHY-PLAN' {
        $script:plan = Invoke-Supervisor @('recovery-plan')
        if ($plan.schemaVersion -ne 1 -or @($plan.decisions).Count -ne 3) { throw 'plan-schema' }
        foreach ($item in $plan.decisions) {
            if ($item.decision -ne 'no_action' -or $item.reason -ne 'healthy' -or $null -ne $item.action) { throw 'healthy-plan-action' }
        }
    }
    Gate 'P7B1-12-HISTORY' {
        $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json -ErrorAction Stop
        $stateDir = Join-Path $settings.installDirectory 'supervisor'
        if (-not [IO.Path]::IsPathRooted($stateDir) -or $stateDir.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'unsafe-state-path' }
        $item = Get-Item -LiteralPath (Join-Path $stateDir 'recovery.json') -ErrorAction Stop
        if ($item.Length -gt 4096 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'history-file-bound' }
        $script:history = Get-Content -LiteralPath $item.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
        if ($history.schemaVersion -ne 1 -or @($history.decisions).Count -ne 3 -or
            (($history.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'decisions,history,schemaVersion' -or
            (($history.history.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'bridge,fqgate,tunnel') { throw 'history-schema' }
        foreach ($component in @('bridge','fqgate','tunnel')) {
            $entry = $history.history.$component
            if ((($entry.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'attempts,consecutive,lastAttemptAt,lastState,stableSince' -or
                $entry.attempts -lt 0 -or $entry.attempts -gt 5 -or $entry.consecutive -lt 0 -or $entry.consecutive -gt 1000) { throw 'history-entry-schema' }
        }
        foreach ($index in @(0,1,2)) {
            $decision = $history.decisions[$index]
            if ($decision.component -ne @('bridge','fqgate','tunnel')[$index] -or
                $decision.decision -notin @('no_action','eligible','suppressed','exhausted','forbidden') -or
                $decision.reason -notin @('healthy','threshold','cooldown','attempt_limit','eligible','login_required','incompatible','missing_tunnel','unknown_state','probe_failed','identity_unknown','transaction_unresolved','history_invalid')) { throw 'decision-schema' }
        }
        $raw = [IO.File]::ReadAllText($item.FullName)
        if ($raw -match '(?i)(cfast_|eyJ[A-Za-z0-9_-]{20,}|authorization|cookie|assertion|client[_-]?secret|api[_-]?token|qr[_-]?payload)') { throw 'history-secret' }
    }
    Gate 'P7B1-13-WATCH-JOURNAL' {
        $script:journal = Invoke-Supervisor @('watch','--interval-ms','1000','--max-cycles','3')
        if ($journal.cycles -ne 3 -or $journal.records -lt 4) { throw 'watch-regression' }
    }
    Gate 'P7B1-14-REMOTE-SURFACE' {
        & $git -C $root diff --exit-code 60ac0f64db2ce44f7629495e1a95af01a104c4d0 HEAD -- src/bridge src/routes
        if ($LASTEXITCODE -ne 0) { throw 'authorization-changed' }
    }
    Gate 'P7B1-15-LOOPBACK-IDENTITY' {
        $script:after = RuntimeIdentity
        foreach ($component in @('bridge','fqgate','tunnel')) {
            if ($before[$component].pid -ne $after[$component].pid -or $before[$component].start -ne $after[$component].start) { throw "restart-$component" }
        }
    }
} catch {
    $failure = [string]$_.Exception.Message
    if ($failure -notmatch '^P7B1-[0-9]{2}-[A-Z-]+_FAILED$') { $failure = 'P7B1-ACCEPTANCE-FAILED' }
    Record $failure 'FAIL'
    Write-Host "P7B1 failure=$failure reason=$failureReason"
} finally {
    foreach ($key in @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
    $evidence = [ordered]@{ schemaVersion=1; task='phase-7-b1'; commit=$commit; versions=$versions;
        checks=@($records); snapshot=$snapshot; plan=$plan; journal=$journal; before=$before; after=$after;
        historyBytes=$(if ($null -eq $history) { $null } else { [Text.Encoding]::UTF8.GetByteCount(($history | ConvertTo-Json -Compress -Depth 8)) });
        failureCode=$failure; failureReason=$failureReason }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 16384 -or $json -match '(?i)(cfast_|eyJ[A-Za-z0-9_-]{20,}|authorization|cookie|assertion|client[_-]?secret|api[_-]?token)') { throw 'P7B1-EVIDENCE-REJECTED' }
    [IO.File]::WriteAllText($evidencePath,$json,[Text.UTF8Encoding]::new($false))
}
if ($null -ne $failure) { exit 1 }
