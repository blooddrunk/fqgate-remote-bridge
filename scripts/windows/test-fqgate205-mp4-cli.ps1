[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$node=(Get-Command node.exe -ErrorAction Stop).Source
$scripts=@('fqgate205-mp2-preflight.mjs','fqgate205-mp5-triage.mjs')
$n=0
foreach($name in $scripts) {
$script=Join-Path $PSScriptRoot $name
foreach($flag in @('--live','--apply','--url','--method','--source','--allow-live-qr')) {
    # Invalid invocation must fail before loading configuration or issuing any GET.
    $output=& $node $script --config UNUSED --profiles UNUSED --evidence UNUSED $flag
    if($LASTEXITCODE -ne 2) {throw 'Mutation/generic selector flag accepted'}
    $r=$output|ConvertFrom-Json
    if($name -eq 'fqgate205-mp2-preflight.mjs' -and ($r.gates[0].id -ne 'TOOLING_CONFIG' -or $r.counters.post -ne 0 -or $r.counters.qrBegin -ne 0 -or $r.receiptSaved -ne $false)) {throw 'CLI failure not reduced and side-effect free'}
    if($name -eq 'fqgate205-mp5-triage.mjs' -and ($r.exitCode -ne 2 -or $r.readiness -ne 'BLOCKED' -or $r.receiptSaved -ne $false)) {throw 'MP5 CLI failure not reduced'}
    if($output -match 'UNUSED|stack|Error:') {throw 'CLI leaked arguments/exception'}
    $n++
}
}
Write-Output "PASS MP4/MP5 CLI fail-closed fixtures $n/$n; native GET/POST/process mutation=0"
