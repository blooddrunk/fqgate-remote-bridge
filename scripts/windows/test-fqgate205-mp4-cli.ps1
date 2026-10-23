[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$node=(Get-Command node.exe -ErrorAction Stop).Source
$script=Join-Path $PSScriptRoot 'fqgate205-mp2-preflight.mjs'
$n=0
foreach($flag in @('--live','--apply','--url','--method','--source','--allow-live-qr')) {
    # Invalid invocation must fail before loading configuration or issuing any GET.
    $output=& $node $script --config UNUSED --profiles UNUSED --evidence UNUSED $flag
    if($LASTEXITCODE -ne 2) {throw 'Mutation/generic selector flag accepted'}
    $r=$output|ConvertFrom-Json
    if($r.gates[0].id -ne 'TOOLING_CONFIG' -or $r.counters.post -ne 0 -or $r.counters.qrBegin -ne 0 -or $r.receiptSaved -ne $false) {throw 'CLI failure not reduced and side-effect free'}
    if($output -match 'UNUSED|stack|Error:') {throw 'CLI leaked arguments/exception'}
    $n++
}
Write-Output "PASS MP4 CLI fail-closed fixtures $n/$n; native GET/POST/process mutation=0"
