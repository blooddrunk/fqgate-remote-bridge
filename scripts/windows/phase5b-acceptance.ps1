[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [switch]$Census,
    [switch]$VerifyLocal,
    [switch]$RunAuthenticatedServiceTokenMatrix,
    [string]$TunnelIngressConfigPath
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ($root -ne "D:\code\research\fqgate-remote-bridge" -or -not (Test-Path (Join-Path $root ".git"))) {
    throw "P5B-W1 FAIL PERMANENT_WINDOWS_CHECKOUT_REQUIRED"
}
foreach ($port in @(17281,17282)) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") {
        throw "P5B-W2 FAIL LOOPBACK_LISTENER_REQUIRED port=$port"
    }
    Write-Host "P5B-W2 PASS loopback port=$port"
}
$node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles "nodejs\node.exe" }
if (-not $Census -and -not $VerifyLocal -and -not $RunAuthenticatedServiceTokenMatrix) { $Census = $true }
if ($Census -or $VerifyLocal) {
    & $node (Join-Path $PSScriptRoot "phase5b-census.mjs") $ConfigPath
    if ($LASTEXITCODE -ne 0) { throw "P5B-CENSUS FAIL See bounded check ID; LOGIN_REQUIRED uses the existing local /login QR flow, then rerun this command." }
}
if ($VerifyLocal) {
    & $node (Join-Path $PSScriptRoot "phase5b-matrix.mjs") --local
    if ($LASTEXITCODE -ne 0) { throw "P5B-LOCAL FAIL See bounded P5B-L result" }
}
if ($RunAuthenticatedServiceTokenMatrix) {
    if (-not $TunnelIngressConfigPath -or -not (Test-Path -LiteralPath $TunnelIngressConfigPath)) {
        throw "P5B-W3 FAIL EXISTING_TUNNEL_INGRESS_EVIDENCE_REQUIRED before credential entry"
    }
    $ingressText = Get-Content -LiteralPath $TunnelIngressConfigPath -Raw
    if ($ingressText.Length -gt 64KB -or $ingressText -match "17281") { throw "P5B-W3 FAIL INGRESS_EVIDENCE_INVALID" }
    $ingress = $ingressText | ConvertFrom-Json
    $configuration = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($ingress.service -ne "http://127.0.0.1:17282" -or $ingress.hostname -ne $configuration.remoteAccess.machineHostname) {
        throw "P5B-W3 FAIL EXISTING_MACHINE_INGRESS_MISMATCH"
    }
    Write-Host "P5B-W3 PASS existing machine ingress evidence targets only Bridge"
    & (Join-Path $PSScriptRoot "phase5a-acceptance.ps1") -ConfigPath $ConfigPath -RunAuthenticatedServiceTokenMatrix -Phase5BReadOnly -TunnelIngressConfigPath $TunnelIngressConfigPath
}
