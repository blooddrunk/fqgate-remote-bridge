[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'fqgate-v2-observation-gates.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('v2-observation-fixture-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path (Join-Path $root 'current') -Force)
[void](New-Item -ItemType Directory -Path (Join-Path $root 'previous') -Force)
# These are inert text files, never executable fixture binaries.
Set-Content (Join-Path $root 'current\fqgate.exe') 'inert-current'
Set-Content (Join-Path $root 'previous\fqgate.exe') 'inert-previous'
Set-Content (Join-Path $root 'state.json') '{}'
Set-Content (Join-Path $root 'process.json') '{}'
$node = if (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source } else { 'C:\Program Files\nodejs\node.exe' }
$script:count=0
function Assert-Gate($Result, [string]$Id, [string]$Expected) {
  $g = @($Result.checks | Where-Object { $_.id -eq $Id })
  if ($g.Count -ne 1 -or $g[0].status -cne $Expected) { throw "Gate $Id expected $Expected" }
}
function New-Report {
  @{ schemaVersion=1; trust='UNAUTHENTICATED_OBSERVATION'; version='2.0.5';
    signatureVerified=$false; installAllowed=$false; runtimeQualified=$false; qualification='BLOCKED';
    publishedAt='2026-10-12T05:22:42Z'; sequence=8; refreshSequence=9;
    metadataHashes=@{ freshness=('a'*64); stable=('b'*64); release=('c'*64); githubRelease=('d'*64) };
    windows=@{ fileName='FQGate-2.0.5-windows-x64.zip'; bytes=128; sha256=('e'*64) };
    archive=@{ entries=2; uncompressedBytes=256; requiredPeHeaders='PASS' }; cleanup='REMOVED' }
}
function New-Operations {
  @{
    Config={ $root }
    Snapshot={ param($directory) Get-V2FileSnapshot $directory }
    Listeners={ param($directory)
      @{ port=17281; address='127.0.0.1'; pid=123; identity='MANAGED_PATH_MATCH' }
      @{ port=17282; address='127.0.0.1'; pid=456; identity='MISMATCH' }
    }
    Observe={ @{ exitCode=1; stdout=((New-Report) | ConvertTo-Json -Depth 10); stderr='sensitive-not-saved' } }
  }
}
function Run-Case([string]$Name, [scriptblock]$Case) {
  & $Case
  $script:count++
  Write-Output "PASS $Name"
}
try {
  Run-Case 'valid observation preserves fixed files, never qualifies' {
    $r=Invoke-V2ObservationChecks (New-Operations) $true
    foreach ($id in @('config','loopback-17281','loopback-17282','managed-process','previous-present','transaction-clear','v2-observation','zip-cleanup','production-files-unchanged')) { Assert-Gate $r $id 'PASS' }
    foreach ($id in @('publisher-signature','metadata-freshness-anti-replay','directory-rollback','v2-runtime')) { Assert-Gate $r $id 'BLOCKED' }
    Assert-Gate $r 'production-upgrade' 'NOT_EXECUTED'
    if ($r.exitCode -ne 1) { throw 'Observation must stay blocked' }
  }
  foreach ($fixturePort in @(17281,17282)) {
    Run-Case "missing listener $fixturePort" {
      $ops=New-Operations; $ops.Listeners={ @{ port=$(if ($fixturePort -eq 17281) {17282} else {17281}); address='127.0.0.1'; pid=123; identity='MANAGED_PATH_MATCH' } }
      Assert-Gate (Invoke-V2ObservationChecks $ops $true) "loopback-$fixturePort" 'BLOCKED'
    }
    foreach ($address in @('0.0.0.0','::1','::','192.168.1.10')) {
      Run-Case "reject $address listener $fixturePort" {
        $ops=New-Operations; $ops.Listeners={ @{ port=$fixturePort; address=$address; pid=123; identity='MANAGED_PATH_MATCH' } }
        Assert-Gate (Invoke-V2ObservationChecks $ops $true) "loopback-$fixturePort" 'BLOCKED'
      }
    }
  }
  Run-Case 'duplicate listener' {
    $ops=New-Operations; $ops.Listeners={ 1..2 | ForEach-Object { @{ port=17281; address='127.0.0.1'; pid=123; identity='MANAGED_PATH_MATCH' } } }
    Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'loopback-17281' 'BLOCKED'
  }
  foreach ($identity in @('UNREADABLE','MISMATCH')) {
    Run-Case "process $identity" {
      $ops=New-Operations; $ops.Listeners={ @{ port=17281; address='127.0.0.1'; pid=123; identity=$identity } }
      Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'managed-process' 'BLOCKED'
    }
  }
  Run-Case 'listener provider exception' {
    $ops=New-Operations; $ops.Listeners={ throw 'secret' }
    Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'loopback-17281' 'BLOCKED'
  }
  Run-Case 'missing previous is blocked and never fabricated' {
    Remove-Item (Join-Path $root 'previous\fqgate.exe')
    $r=Invoke-V2ObservationChecks (New-Operations) $true
    Assert-Gate $r 'previous-present' 'BLOCKED'; Assert-Gate $r 'production-files-unchanged' 'PASS'
    if (Test-Path (Join-Path $root 'previous\fqgate.exe')) { throw 'Fabricated previous' }
    Set-Content (Join-Path $root 'previous\fqgate.exe') 'inert-previous'
  }
  Run-Case 'invalid config does not inspect production paths' {
    $ops=New-Operations; $ops.Config={ throw 'sensitive-config' }; $ops.Snapshot={ throw 'must not be invoked' }; $ops.Listeners={ throw 'must not be invoked' }
    $r=Invoke-V2ObservationChecks $ops $true
    Assert-Gate $r 'config' 'BLOCKED'; Assert-Gate $r 'managed-process' 'NOT_EXECUTED'
    if ($r.filesBefore -or $r.listeners.Count -ne 0) { throw 'Inspected invalid config' }
    if (($r | ConvertTo-Json -Depth 20) -match 'sensitive-config') { throw 'Error leak' }
  }
  Run-Case 'real config validator rejects missing malformed unknown and non-loopback config' {
    $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $helper=Join-Path $PSScriptRoot 'fqgate-v2-config.mjs'
    $cfg=Join-Path $root 'config.json'
    & $node $helper $repo $cfg | Out-Null
    if ($LASTEXITCODE -ne 2) { throw 'Missing config accepted' }
    foreach ($content in @('{broken','{"unknown":"sensitive"}','{"fqgateBaseUrl":"http://0.0.0.0:17281"}')) {
      [IO.File]::WriteAllText($cfg,$content)
      $out=& $node $helper $repo $cfg
      if ($LASTEXITCODE -ne 2 -or ($out -join '') -match 'sensitive') { throw 'Invalid config accepted or leaked' }
    }
    [IO.File]::WriteAllText($cfg,('{"installDirectory":' + ($root | ConvertTo-Json -Compress) + '}'))
    & $node $helper $repo $cfg | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Valid config denied' }
  }
  foreach ($code in @(0,2,23)) {
    Run-Case "CLI unexpected exit $code" {
      $ops=New-Operations; $ops.Observe={ @{ exitCode=$code; stdout=((New-Report) | ConvertTo-Json -Depth 10) } }
      $r=Invoke-V2ObservationChecks $ops $true
      Assert-Gate $r 'v2-observation' 'BLOCKED'; Assert-Gate $r 'production-files-unchanged' 'PASS'
    }
  }
  Run-Case 'actual child exception exit is rejected and production hashes stay fixed' {
    $child=Join-Path $root 'crash.mjs'
    [IO.File]::WriteAllText($child,"throw new Error('fixture-only');")
    $ops=New-Operations
    $ops.Observe={
      $info=New-Object Diagnostics.ProcessStartInfo
      $info.FileName=$node; $info.Arguments='"' + $child + '"'
      $info.UseShellExecute=$false; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
      $p=New-Object Diagnostics.Process; $p.StartInfo=$info; [void]$p.Start()
      $out=$p.StandardOutput.ReadToEndAsync(); $err=$p.StandardError.ReadToEndAsync(); $p.WaitForExit()
      $res=@{ exitCode=$p.ExitCode; stdout=$out.Result }; $p.Dispose(); $res
    }
    $r=Invoke-V2ObservationChecks $ops $true
    Assert-Gate $r 'v2-observation' 'BLOCKED'; Assert-Gate $r 'production-files-unchanged' 'PASS'
    if ($r.observationExitCode -ne 1) { throw 'Child did not fail' }
  }
  Run-Case 'CLI throw still snapshots after failure' {
    $ops=New-Operations; $ops.Observe={ throw 'secret' }
    $r=Invoke-V2ObservationChecks $ops $true
    Assert-Gate $r 'v2-observation' 'BLOCKED'; Assert-Gate $r 'production-files-unchanged' 'PASS'
  }
  foreach ($bad in @('', '{bad', '{"installAllowed":false}', ('x'*131073))) {
    Run-Case 'malformed or oversized metadata' {
      $ops=New-Operations; $ops.Observe={ @{ exitCode=1; stdout=$bad } }
      Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'v2-observation' 'BLOCKED'
    }
  }
  Run-Case 'coherent historical replay never passes freshness' {
    $ops=New-Operations; $ops.Observe={ $v=New-Report; $v.sequence=7; $v.refreshSequence=8; $v.publishedAt='2026-10-11T05:05:34Z'; @{ exitCode=1; stdout=($v | ConvertTo-Json -Depth 10) } }
    Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'metadata-freshness-anti-replay' 'BLOCKED'
  }
  foreach ($field in @('signatureVerified','installAllowed','runtimeQualified')) {
    Run-Case "reject unexpected privilege $field" {
      $ops=New-Operations; $ops.Observe={ $v=New-Report; $v[$field]=$true; @{ exitCode=1; stdout=($v | ConvertTo-Json -Depth 10) } }
      Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'v2-observation' 'BLOCKED'
    }
  }
  Run-Case 'future timestamp rejected' {
    $ops=New-Operations; $ops.Observe={ $v=New-Report; $v.publishedAt='9999-01-01T00:00:00Z'; @{ exitCode=1; stdout=($v | ConvertTo-Json -Depth 10) } }
    Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'v2-observation' 'BLOCKED'
  }
  Run-Case 'ZIP not removed is blocked' {
    $ops=New-Operations; $ops.Observe={ $v=New-Report; $v.cleanup='PRESENT'; @{ exitCode=1; stdout=($v | ConvertTo-Json -Depth 10) } }
    Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'zip-cleanup' 'BLOCKED'
  }
  Run-Case 'untrusted response and stderr fields never saved' {
    $ops=New-Operations; $ops.Observe={ $v=New-Report; $v.token='sensitive-token'; $v.archive.files=@('sensitive-path'); @{ exitCode=1; stdout=($v | ConvertTo-Json -Depth 10); stderr='sensitive-stderr' } }
    $r=Invoke-V2ObservationChecks $ops $true
    Assert-Gate $r 'v2-observation' 'PASS'
    if (($r | ConvertTo-Json -Depth 20) -match 'sensitive') { throw 'Untrusted response persisted' }
  }
  foreach ($kind in @('changed','deleted','created','unreadable')) {
    Run-Case "production snapshot $kind" {
      $ops=New-Operations
      $ops.Observe={
        if ($kind -eq 'changed') { Set-Content (Join-Path $root 'state.json') '{"changed":true}' }
        if ($kind -eq 'deleted') { Remove-Item (Join-Path $root 'state.json') }
        if ($kind -eq 'created') { Set-Content (Join-Path $root 'install.lock') 'inert-lock' }
        @{ exitCode=2; stdout='' }
      }
      if ($kind -eq 'unreadable') { $ops.Snapshot={ param($d) $v=Get-V2FileSnapshot $d; $v['state.json']=@{ readable=$false; present=$null }; $v } }
      Assert-Gate (Invoke-V2ObservationChecks $ops $true) 'production-files-unchanged' 'BLOCKED'
      Set-Content (Join-Path $root 'state.json') '{}'
      if (Test-Path (Join-Path $root 'install.lock')) { Remove-Item (Join-Path $root 'install.lock') }
    }
  }
  Run-Case 'existing fixture lock stays untouched' {
    Set-Content (Join-Path $root 'install.lock') 'inert-lock'
    $r=Invoke-V2ObservationChecks (New-Operations) $true
    Assert-Gate $r 'transaction-clear' 'BLOCKED'; Assert-Gate $r 'production-files-unchanged' 'PASS'
  }
  Write-Output "PASS $script:count Windows fixture behavior cases; no production service/network/credentials used"
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
exit 0
