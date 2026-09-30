[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigPath)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedRoot = 'D:\code\research\fqgate-remote-bridge'
$evidencePath = 'D:\code\research\fqgate-phase7a-acceptance-evidence.json'
$records = [Collections.Generic.List[object]]::new()
$commit = ''
$snapshot = $null
$journalSummary = $null
$failure = $null
$failureReason = $null
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
        throw "$($Id)_FAILED"
    }
}
function Invoke-Quality([string]$Id,[string[]]$Arguments) {
    & $pnpm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$($Id)_FAILED" }
    Record $Id 'PASS'
}
function Invoke-Supervisor([string[]]$Arguments) {
    $lines = @(& $node (Join-Path $root 'dist\cli\main.js') supervisor @Arguments --config $config --json)
    if ($LASTEXITCODE -ne 0 -or $lines.Count -ne 1 -or $lines[0].Length -gt 4096) { throw 'P7A_SUPERVISOR_COMMAND_FAILED' }
    return ($lines[0] | ConvertFrom-Json -ErrorAction Stop)
}

try {
    Set-Location $root
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $pnpm = (Get-Command pnpm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    Gate 'P7A-01-CHECKOUT' {
        if ($root -ne $expectedRoot) { throw 'wrong-checkout' }
        $script:commit = (& $git -C $root rev-parse HEAD).Trim()
        if ($commit -notmatch '^[a-f0-9]{40}$') { throw 'invalid-commit' }
        $dirty = @(& $git -C $root status --porcelain | Where-Object { $_ })
        if ($dirty.Count -ne 0) { throw 'dirty-checkout' }
        $script:config = (Resolve-Path -LiteralPath $ConfigPath).Path
        if ($config.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'config-inside-repo' }
    }
    $versions = [ordered]@{ node=(& $node --version).Trim(); pnpm=(& $pnpm --version).Trim() }
    Invoke-Quality 'P7A-02-INSTALL' @('install','--frozen-lockfile')
    Invoke-Quality 'P7A-03-TYPECHECK' @('typecheck')
    Invoke-Quality 'P7A-04-LINT' @('lint')
    Invoke-Quality 'P7A-05-TEST' @('test')
    Invoke-Quality 'P7A-06-BUILD' @('build')
    Invoke-Quality 'P7A-07-FORMAT' @('format:check')
    Invoke-Quality 'P7A-08-E2E' @('test:e2e')
    Gate 'P7A-09-INSPECT' {
        $script:snapshot = Invoke-Supervisor @('inspect')
        if ($snapshot.schemaVersion -ne 1 -or $snapshot.bridge -ne 'ready' -or $snapshot.fqgate -ne 'ready' -or
            $snapshot.tunnel -ne 'running' -or $snapshot.session -notin @('connected','guest','login_required','unknown')) { throw 'prerequisite-not-ready' }
    }
    Gate 'P7A-10-WATCH' {
        $script:journalSummary = Invoke-Supervisor @('watch','--interval-ms','1000','--max-cycles','3')
        if ($journalSummary.cycles -ne 3 -or $journalSummary.records -lt 4) { throw 'bounded-watch-invalid' }
    }
    Gate 'P7A-11-JOURNAL' {
        $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
        $stateDir = Join-Path $settings.installDirectory 'supervisor'
        if (-not [IO.Path]::IsPathRooted($stateDir) -or $stateDir.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'unsafe-state-path' }
        $files = @(Get-ChildItem -LiteralPath $stateDir -File | Where-Object { $_.Name -match '^events\.jsonl(\.[1-3])?$' })
        if ($files.Count -lt 1 -or $files.Count -gt 4) { throw 'journal-file-count' }
        $recordCount = 0
        foreach ($file in $files) {
            if ($file.Length -gt 65536 -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'journal-file-bound' }
            foreach ($line in [IO.File]::ReadAllLines($file.FullName)) {
                if ([Text.Encoding]::UTF8.GetByteCount($line + "`n") -gt 512 -or
                    $line -match '(?i)(cfast_|eyJ[A-Za-z0-9_-]{20,}|authorization|cookie|assertion|client[_-]?secret|api[_-]?token|qr[_-]?payload)') { throw 'journal-secret-or-size' }
                $entry = $line | ConvertFrom-Json -ErrorAction Stop
                if ((($entry.PSObject.Properties.Name | Sort-Object) -join ',') -notin @('at,component,current,event,reason,schemaVersion','at,component,current,event,previous,reason,schemaVersion') -or
                    $entry.schemaVersion -ne 1 -or $entry.event -ne 'observation' -or
                    $entry.component -notin @('bridge','fqgate','session','tunnel') -or
                    $entry.reason -notin @('initial','state_changed','probe_failed','probe_recovered')) { throw 'journal-schema' }
                $recordCount++
            }
        }
        if ($recordCount -ne $journalSummary.records) { throw 'journal-count' }
        $script:journalSummary = [ordered]@{ records=$recordCount; rotatedFiles=$journalSummary.rotatedFiles }
    }
    Gate 'P7A-12-LOOPBACK' {
        foreach ($port in @(17281,17282)) {
            $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
            if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw "listener-$port" }
        }
    }
    Gate 'P7A-13-REMOTE-SURFACE' {
        & $git -C $root diff --exit-code origin/main -- src/bridge src/routes/api
        if ($LASTEXITCODE -ne 0) { throw 'authorization-changed' }
    }
} catch {
    $failure = [string]$_.Exception.Message
    if ($failure -notmatch '^P7A-[0-9]{2}-[A-Z-]+_FAILED$') { $failure = 'P7A-ACCEPTANCE-FAILED' }
    Record $failure 'FAIL'
    Write-Host "P7A failure=$failure reason=$failureReason snapshot=$($snapshot | ConvertTo-Json -Compress)"
} finally {
    foreach ($key in @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
    $evidence = [ordered]@{ schemaVersion=1; task='phase-7-a'; commit=$commit; versions=$versions;
        checks=@($records); snapshot=$snapshot; journal=$journalSummary;
        listeners=@('127.0.0.1:17281','127.0.0.1:17282'); ci=$null; failureCode=$failure; failureReason=$failureReason }
    $json = $evidence | ConvertTo-Json -Depth 6 -Compress
    if ($json.Length -gt 16384 -or $json -match '(?i)(cfast_|eyJ[A-Za-z0-9_-]{20,}|authorization|cookie|assertion|client[_-]?secret|api[_-]?token)') { throw 'P7A-EVIDENCE-REJECTED' }
    [IO.File]::WriteAllText($evidencePath,$json,[Text.UTF8Encoding]::new($false))
}
if ($null -ne $failure) { exit 1 }
