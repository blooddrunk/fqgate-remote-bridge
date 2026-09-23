[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [switch]$VerifyLocal,
    [switch]$RunAuthenticatedServiceTokenMatrix,
    [string]$TunnelIngressConfigPath,
    [ValidateSet("Prompt", "Vault")][string]$CredentialSource = "Prompt"
)

$ErrorActionPreference = "Stop"
$currentPathExt = [string]$env:PATHEXT
if ($currentPathExt -notmatch '(?i)(^|;)\.EXE(;|$)' -or $currentPathExt -notmatch '(?i)(^|;)\.CMD(;|$)') {
    $env:PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;$currentPathExt"
}
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ($root -ne "D:\code\research\fqgate-remote-bridge" -or -not (Test-Path (Join-Path $root ".git"))) {
    throw "P5C-W1 FAIL PERMANENT_WINDOWS_CHECKOUT_REQUIRED"
}
if (-not $VerifyLocal -and -not $RunAuthenticatedServiceTokenMatrix) { $VerifyLocal = $true }
$records = [System.Collections.Generic.List[bool]]::new()
function Write-P5CRecord([string]$Id, [bool]$Pass, [hashtable]$Metadata) {
    $records.Add($Pass)
    $record = [ordered]@{ id = $Id; result = $(if ($Pass) { "PASS" } else { "FAIL" }) }
    foreach ($key in $Metadata.Keys) { $record[$key] = $Metadata[$key] }
    $record.timestamp = [DateTime]::UtcNow.ToString("o")
    Write-Host ($record | ConvertTo-Json -Compress)
}
foreach ($port in @(17281, 17282)) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    $pass = $listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq "127.0.0.1"
    Write-P5CRecord "P5C-W2-$port" $pass @{ port = $port; address = $(if ($pass) { "127.0.0.1" } else { "invalid" }) }
}
$node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles "nodejs\node.exe" }
if ($VerifyLocal) {
    & $node (Join-Path $PSScriptRoot "phase5c-matrix.mjs") --local
    if ($LASTEXITCODE -ne 0) { throw "P5C-LOCAL FAIL See bounded P5C-L check and machine-derived summary" }
}
if ($RunAuthenticatedServiceTokenMatrix) {
    if (-not $TunnelIngressConfigPath -or -not (Test-Path -LiteralPath $TunnelIngressConfigPath)) {
        throw "P5C-W3 FAIL EXISTING_TUNNEL_INGRESS_EVIDENCE_REQUIRED before credential entry"
    }
    $ingressText = Get-Content -LiteralPath $TunnelIngressConfigPath -Raw
    $configuration = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $ingress = $ingressText | ConvertFrom-Json
    $ingressPass = $ingressText.Length -le 64KB -and $ingressText -notmatch "17281" -and
        $ingress.service -eq "http://127.0.0.1:17282" -and
        $ingress.hostname -eq $configuration.remoteAccess.machineHostname
    Write-P5CRecord "P5C-W3" $ingressPass @{ origin = $(if ($ingressPass) { "bridge-loopback" } else { "invalid" }) }
    if (-not $ingressPass) { throw "P5C-W3 FAIL EXISTING_MACHINE_INGRESS_MISMATCH" }
    & (Join-Path $PSScriptRoot "phase5a-acceptance.ps1") -ConfigPath $ConfigPath -RunAuthenticatedServiceTokenMatrix -Phase5CReadOnly -TunnelIngressConfigPath $TunnelIngressConfigPath -CredentialSource $CredentialSource
    if (-not $?) { throw "P5C-REMOTE FAIL See bounded P5C-R check and machine-derived summary" }
}
$passed = @($records | Where-Object { $_ }).Count
$summary = [ordered]@{
    id = "P5C-W-SUMMARY"
    result = $(if ($passed -eq $records.Count) { "PASS" } else { "FAIL" })
    total = $records.Count
    passed = $passed
    failed = $records.Count - $passed
    timestamp = [DateTime]::UtcNow.ToString("o")
}
Write-Host ($summary | ConvertTo-Json -Compress)
if ($passed -ne $records.Count) { throw "Phase 5-C Windows acceptance failed" }
