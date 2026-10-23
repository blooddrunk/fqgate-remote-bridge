[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'fqgate205-mp3-native.ps1') -CurrentDirectory 'C:\fixture'
$script:hasBridge=$false; $script:hasApp=$true; $script:reparse=$false; $script:unreadable=$false
$script:viewPath='C:\fixture\webview'; $script:creation=[DateTime]::Parse('2026-10-23T00:00:00Z')
function Get-CimInstance {
    param($ClassName)
    if(-not $script:hasApp) { return @() }
    @(
        [pscustomobject]@{Name='FQGate.exe';ProcessId=10;ParentProcessId=1;ExecutablePath='C:\fixture\FQGate.exe';CreationDate=$script:creation;CommandLine='"C:\fixture\FQGate.exe" SECRET_NO_OUTPUT';WorkingSetSize=100}
        [pscustomobject]@{Name='FQGate.exe';ProcessId=20;ParentProcessId=10;ExecutablePath='C:\fixture\FQGate.exe';CreationDate=$script:creation;CommandLine='"C:\fixture\FQGate.exe" --source-worker SECRET_SOURCE --source-worker-parent-pid 10';WorkingSetSize=200}
        [pscustomobject]@{Name='msedgewebview2.exe';ProcessId=30;ParentProcessId=10;CommandLine=('--user-data-dir="'+$script:viewPath+'" SECRET_COOKIE')}
    )
}
function Get-NetTCPConnection {
    param($State)
    [pscustomobject]@{LocalPort=17281;LocalAddress='127.0.0.1';OwningProcess=10}
    if($script:hasBridge) { [pscustomobject]@{LocalPort=17282;LocalAddress='127.0.0.1';OwningProcess=11} }
}
function Get-Item {
    param($LiteralPath,[switch]$Force)
    if($script:unreadable) { throw 'SECRET_PATH' }
    [pscustomobject]@{Attributes=if($script:reparse){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Directory}}
}
$n=0
$r=Get-Mp3TopologyFacts 'C:\fixture'
if($r.parentCount -ne 1 -or $r.workerCount -ne 1 -or $r.processes.Count -ne 2) {throw 'Topology mismatch'}; $n++
if($r.bridgeStatus -ne 'BLOCKED_LISTENER_ABSENT') {throw 'Missing Bridge fabricated'}; $n++
if($r.webview.insidePayloadCount -ne 1 -or $r.webview.distinctObservedRoots -ne 1) {throw 'Storage placement mismatch'}; $n++
if(-not $r.processes[1].sourceWorkerSwitch -or -not $r.processes[1].parentSwitch) {throw 'Worker switch mismatch'}; $n++
if(($r|ConvertTo-Json -Depth 8) -match 'SECRET|CommandLine|C:\\fixture') {throw 'Private data leaked'}; $n++
if($r.independentLaunchContract -ne 'UNPROVEN' -or $r.storageIndependence -ne 'UNPROVEN' -or $r.lifecycleExperiment -ne 'NOT_EXECUTED') {throw 'Observation overclaimed'}; $n++
$script:hasBridge=$true
if((Get-Mp3TopologyFacts 'C:\fixture').bridgeStatus -ne 'OBSERVED_NOT_BUILD_VERIFIED') {throw 'Presence treated as build proof'}; $n++
$script:viewPath='C:\separate\webview'
if((Get-Mp3TopologyFacts 'C:\fixture').webview.insidePayloadCount -ne 0) {throw 'Outside placement mismatch'}; $n++
$script:viewPath='relative'
if((Get-Mp3TopologyFacts 'C:\fixture').webview.directoryUnknown -ne 1) {throw 'Relative storage accepted'}; $n++
$script:viewPath='C:\fixture\webview'; $script:reparse=$true
if((Get-Mp3TopologyFacts 'C:\fixture').webview.reparseCount -lt 1) {throw 'Reparse missed'}; $n++
$script:reparse=$false; $script:unreadable=$true
if((Get-Mp3TopologyFacts 'C:\fixture').webview.linkUnknown -lt 1) {throw 'Unreadable ancestors accepted'}; $n++
$script:unreadable=$false; $script:creation=$script:creation.AddTicks(1)
if((Get-Mp3TopologyFacts 'C:\fixture').processes[0].created -eq $r.processes[0].created) {throw 'Creation precision lost'}; $n++
$script:hasApp=$false
if((Get-Mp3TopologyFacts 'C:\fixture').parentCount -ne 0) {throw 'Absent process fabricated'}; $n++
$denied=$false
try {Get-Mp3TopologyFacts 'relative'|Out-Null} catch {$denied=$true}
if(-not $denied) {throw 'Relative installation accepted'}; $n++
Write-Output "PASS MP3 native read-only collection fixtures $n/$n; real process/login/POST effects=0"
