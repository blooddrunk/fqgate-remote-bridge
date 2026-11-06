[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'fqgate205-mp6-host.ps1') -RepositoryDirectory 'C:\fixture'
$script:failTcp=$false; $script:failProcess=$false; $script:failService=$false; $script:failTask=$false
$script:tcpState='Listen'; $script:port=17282
function Get-NetTCPConnection {
    if($script:failTcp) {throw 'SECRET_TCP'}
    [pscustomobject]@{LocalPort=$script:port;LocalAddress='127.0.0.1';OwningProcess=10;State=$script:tcpState}
}
function Get-CimInstance {
    param($ClassName)
    if($ClassName -eq 'Win32_Service') {
        if($script:failService) {throw 'SECRET_SERVICE'}
        return [pscustomobject]@{Name='fqgate_SECRET';PathName='SECRET --token SECRET';State='Stopped';StartMode='Manual';ProcessId=0}
    }
    if($script:failProcess) {throw 'SECRET_PROCESS'}
    @(
        [pscustomobject]@{Name='FQGate.exe';ProcessId=10;ParentProcessId=1;CreationDate=[DateTime]::Parse('2026-11-05T00:00:00.1234567Z');ExecutablePath='C:\SECRET';CommandLine='SECRET_ACCOUNT'}
        [pscustomobject]@{Name='node.exe';ProcessId=11;ParentProcessId=1;CreationDate=$null;ExecutablePath=$null;CommandLine='C:\fixture\scripts\start-bridge.mjs SECRET_TOKEN'}
        [pscustomobject]@{Name='node.exe';ProcessId=12;CommandLine='unrelated SECRET'}
    )
}
function Get-ScheduledTask {
    if($script:failTask) {throw 'SECRET_TASK'}
    [pscustomobject]@{TaskName='SECRET';TaskPath='SECRET';State='Ready';Actions=@([pscustomobject]@{Execute='node.exe';Arguments='C:\fixture\scripts\start-bridge.mjs SECRET';WorkingDirectory='C:\fixture'})}
}
$n=0
$r=Get-Mp6HostFacts 'C:\fixture'
if($r.tcp[0].state -ne 'LISTEN' -or $r.processes.Count -ne 2 -or $r.services.Count -ne 1 -or $r.tasks.Count -ne 1) {throw 'Metadata selection failed'}; $n++
if(($r|ConvertTo-Json -Depth 8) -match 'SECRET|C:\\fixture|CommandLine|ExecutablePath|PathName') {throw 'Private metadata leaked'}; $n++
if($r.runningArtifact -ne 'UNKNOWN' -or $r.exitCause -ne 'UNKNOWN_NO_EXIT_HISTORY' -or $r.readiness -ne 'BLOCKED') {throw 'Candidate promoted to runtime proof'}; $n++
if($r.processes[0].created -notmatch '\.1234567Z$') {throw 'Creation precision lost'}; $n++
$script:tcpState=0
if((Get-Mp6HostFacts 'C:\fixture').tcp[0].state -ne 'UNKNOWN') {throw 'State zero promoted to listener'}; $n++
$script:port=9999
if((Get-Mp6HostFacts 'C:\fixture').tcp.Count -ne 0) {throw 'Unbounded port inspection emitted'}; $n++
foreach($gate in @('Tcp','Process','Service','Task')) {
    Set-Variable -Scope Script -Name ('fail'+$gate) -Value $true
    $r=Get-Mp6HostFacts 'C:\fixture'
    if($r[($gate.ToLower()+'Status')] -ne 'UNREADABLE') {throw 'Unavailable gate hidden'}
    if($r.counters.get -ne 0 -or $r.counters.nativeStarts -ne 0 -or $r.counters.post -ne 0) {throw 'Metadata collector performed an action'}
    Set-Variable -Scope Script -Name ('fail'+$gate) -Value $false
    $n++
}
$denied=$false
try {Get-Mp6HostFacts 'relative'|Out-Null} catch {$denied=$true}
if(-not $denied) {throw 'Relative path accepted'}; $n++
Write-Output "PASS MP6 metadata/redaction negative fixtures $n/$n; real native actions=0"
