[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'fqgate205-mp2-native.ps1')
$script:ports=@(17281,17282)
function Get-NetTCPConnection {
    param($State)
    $script:listenerReads++
    if($script:listenerDrift -and $script:listenerReads -gt 1) {
        [pscustomobject]@{LocalPort=17281;LocalAddress='127.0.0.1';OwningProcess=999}
        return
    }
    $script:ports | ForEach-Object { [pscustomobject]@{LocalPort=$_; LocalAddress='127.0.0.1'; OwningProcess=($_ - 17271)} }
}
function Get-CimInstance {
    param($ClassName,$Filter)
    $n=[int]($Filter -replace 'ProcessId = ','')
    $script:reads++
    if($script:vanish -and $script:reads -gt 2) {return @()}
    [pscustomobject]@{ProcessId=$n; ParentProcessId=10; ExecutablePath='C:\inert\FQGate.exe'; CreationDate=([DateTime]::Parse('2026-10-22T00:00:00Z').AddTicks($(if($script:pidReuse -and $script:reads -gt 2){1}else{0}))); CommandLine='SECRET_NEVER_EMIT'}
}
$script:reparse=$false; $script:unreadable=$false; $script:pidReuse=$false; $script:reads=0
$script:vanish=$false; $script:listenerDrift=$false; $script:listenerReads=0
function Start-Process {throw 'PROCESS_MUTATION_FORBIDDEN'}
function Stop-Process {throw 'PROCESS_MUTATION_FORBIDDEN'}
function Invoke-WebRequest {throw 'NETWORK_FORBIDDEN_IN_COLLECTOR'}
function Invoke-RestMethod {throw 'NETWORK_FORBIDDEN_IN_COLLECTOR'}
function Get-Item {
    param($LiteralPath,[switch]$Force)
    if($script:unreadable) { throw 'SECRET_PATH' }
    [pscustomobject]@{Attributes=if($script:reparse){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Normal}}
}
$n=0
$r=Get-Mp2NativeFacts '21,22'
if ($r.listeners.Count -ne 2 -or $r.processes.Count -ne 4) { throw 'Native collection mismatch' }; $n++
if (($r|ConvertTo-Json -Depth 8) -match 'SECRET|CommandLine') { throw 'Raw process secret leaked' }; $n++
foreach($port in @(17281,17282)) {
    $script:ports=@(17281,17282)|Where-Object {$_ -ne $port}
    $r=Get-Mp2NativeFacts ''
    if (@($r.listeners|Where-Object {$_.port -eq $port}).Count -ne 0) { throw 'Missing listener fabricated' }; $n++
}
foreach($bad in @('0','1;whoami','1,,2','-1',('1,'*16+'1'))) {
    $denied=$false
    try { Get-Mp2NativeFacts $bad | Out-Null } catch { $denied=$true }
    if(-not $denied) { throw 'Unsafe PID input accepted' }; $n++
}
$script:ports=@(17281,17282)
foreach($kind in @('reparse','unreadable')) {
    if($kind -eq 'reparse'){$script:reparse=$true}else{$script:unreadable=$true}
    $r=Get-Mp2NativeFacts ''
    if(@($r.processes|Where-Object {$_.pathSafe}).Count -ne 0){throw 'Unsafe/unreadable ancestor accepted'}; $n++
    $script:reparse=$false; $script:unreadable=$false
}
$script:reads=0; $script:pidReuse=$true; $denied=$false
try {Get-Mp2NativeFacts ''|Out-Null} catch {$denied=$true}
if(-not $denied){throw 'PID creation reuse accepted'}; $n++
$script:pidReuse=$false
foreach($kind in @('vanish','listenerDrift')) {
    $script:reads=0; $script:listenerReads=0
    if($kind -eq 'vanish'){$script:vanish=$true}else{$script:listenerDrift=$true}
    $denied=$false
    try {Get-Mp2NativeFacts ''|Out-Null} catch {$denied=$true}
    if(-not $denied){throw 'Unstable native inventory accepted'}; $n++
    $script:vanish=$false; $script:listenerDrift=$false
}
Write-Output "PASS MP2 native GET-only collection fixtures $n/$n; account/QR writes=0"
