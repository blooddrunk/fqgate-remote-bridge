[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'fqgate205-qr-native.ps1')
$current = Join-Path ([IO.Path]::GetTempPath()) 'inert-qr-payload'
$record = @{ pid = 123; executablePath = (Join-Path $current 'fqgate.exe'); startedAt = '2026-10-14T00:00:00Z' }
function New-Facts {
    @{ listeners = @(@{ port = 17281; address = '127.0.0.1'; pid = 123 }, @{ port = 17282; address = '127.0.0.1'; pid = 456 }); process = @{ pid = 123; path = (Join-Path $current 'fqgate.exe'); created = '2026-10-14T00:00:00Z' }; profile = 'OUTSIDE_PAYLOAD' }
}
$script:cases = 0
function Assert-Case($Facts, $Record, [string]$Id, [string]$Expected) {
    $actual = Test-QrNativeFacts $Facts $Record $current
    if ($actual[$Id] -cne $Expected) { throw "Gate $Id failed" }
    $script:cases++
}
Assert-Case (New-Facts) $record 'PROCESS_RECORD' 'PASS'
Assert-Case (New-Facts) $record 'WEBVIEW_PROFILE' 'PASS'
$longRecord = @{ pid = [long]123; executablePath = $record.executablePath; startedAt = [DateTime]::Parse('2026-10-14T00:00:00Z').ToUniversalTime() }
Assert-Case (New-Facts) $longRecord 'PROCESS_RECORD' 'PASS'
$parsedRecord = $record | ConvertTo-Json | ConvertFrom-Json
Assert-Case (New-Facts) $parsedRecord 'PROCESS_RECORD' 'PASS'
$badRecord = @{ pid = [double]123; executablePath = $record.executablePath; startedAt = $record.startedAt }
Assert-Case (New-Facts) $badRecord 'PROCESS_RECORD' 'PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE'

foreach ($port in @(17281, 17282)) {
    $f = New-Facts; $f.listeners = @($f.listeners | Where-Object { $_.port -ne $port })
    Assert-Case $f $record "LISTENER_$port" 'LISTENER_ABSENT'
    foreach ($address in @('0.0.0.0', '::', '::1', '192.168.1.2')) {
        $f = New-Facts; ($f.listeners | Where-Object { $_.port -eq $port }).address = $address
        Assert-Case $f $record "LISTENER_$port" 'LISTENER_NOT_EXCLUSIVE_IPV4_LOOPBACK'
    }
    $f = New-Facts; $f.listeners += @{ port = $port; address = '127.0.0.1'; pid = 999 }
    Assert-Case $f $record "LISTENER_$port" 'LISTENER_NOT_EXCLUSIVE_IPV4_LOOPBACK'
}
foreach ($field in @('pid', 'path', 'created')) {
    $f = New-Facts; $f.process[$field] = if ($field -eq 'pid') { 999 } else { '' }
    Assert-Case $f $record 'PROCESS_RECORD' 'PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE'
}
$f = New-Facts; $f.process.created = '2026-10-15T00:00:00Z'
Assert-Case $f $record 'PROCESS_RECORD' 'PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE'
$f = New-Facts; $f.profile = 'INSIDE_PAYLOAD'
Assert-Case $f $record 'WEBVIEW_PROFILE' 'WEBVIEW_PROFILE_INSIDE_IMMUTABLE_PAYLOAD'
$f.profile = 'UNVERIFIED'
Assert-Case $f $record 'WEBVIEW_PROFILE' 'WEBVIEW_PROFILE_UNVERIFIED'
foreach ($badRecord in @($null, @{pid='123'; executablePath=$record.executablePath}, @{pid=123; executablePath=(Join-Path $current 'other.exe')})) {
    Assert-Case (New-Facts) $badRecord 'PROCESS_RECORD' 'PROCESS_RECORD_NATIVE_IDENTITY_MISMATCH_OR_UNREADABLE'
}
# Execute the real collector with native-command fixtures: command lines stay private.
function Get-NetTCPConnection { param($State) @([pscustomobject]@{LocalPort=17281;LocalAddress='127.0.0.1';OwningProcess=123},[pscustomobject]@{LocalPort=17282;LocalAddress='127.0.0.1';OwningProcess=456}) }
function Get-CimInstance {
    param($ClassName, $Filter)
    if ($Filter) { return [pscustomobject]@{ ProcessId=123; ExecutablePath=$record.executablePath; CreationDate=[DateTime]::UtcNow } }
    @([pscustomobject]@{ ProcessId=789; ParentProcessId=123; Name='msedgewebview2.exe'; CommandLine=('--user-data-dir="' + $script:profilePath + '" sensitive-value') })
}
$script:profilePath = Join-Path $current 'FQGate.exe.WebView2'
$f = Get-QrNativeFacts $current
Assert-Case $f $record 'WEBVIEW_PROFILE' 'WEBVIEW_PROFILE_INSIDE_IMMUTABLE_PAYLOAD'
$script:profilePath = Join-Path ([IO.Path]::GetTempPath()) 'mutable-profile'
$f = Get-QrNativeFacts $current
Assert-Case $f $record 'WEBVIEW_PROFILE' 'PASS'
if (($f | ConvertTo-Json -Depth 10) -match 'sensitive-value|user-data-dir|mutable-profile') { throw 'Sensitive collector output' }
Write-Output "PASS Windows native QR preflight behavior fixtures $script:cases/$script:cases"
