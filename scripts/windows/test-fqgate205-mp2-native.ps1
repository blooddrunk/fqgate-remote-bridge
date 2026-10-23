[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'fqgate205-mp2-native.ps1')
$script:ports=@(17281,17282)
function Get-NetTCPConnection {
    param($State)
    $script:ports | ForEach-Object { [pscustomobject]@{LocalPort=$_; LocalAddress='127.0.0.1'; OwningProcess=($_ - 17271)} }
}
function Get-CimInstance {
    param($ClassName,$Filter)
    $n=[int]($Filter -replace 'ProcessId = ','')
    [pscustomobject]@{ProcessId=$n; ParentProcessId=10; ExecutablePath='C:\inert\FQGate.exe'; CreationDate=[DateTime]::Parse('2026-10-22T00:00:00Z'); CommandLine='SECRET_NEVER_EMIT'}
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
Write-Output "PASS MP2 native GET-only collection fixtures $n/$n; account/QR writes=0"
