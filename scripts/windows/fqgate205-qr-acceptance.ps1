[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Live')][string]$Mode = 'Preflight',
    [switch]$AllowLiveQr,
    [Parameter(Mandatory = $true)][string]$Config,
    [string]$EvidenceDirectory = 'D:\code\research\fqgate-205-qr-evidence'
)
$ErrorActionPreference = 'Stop'
# Only the Live harness can begin QR, and only with an explicit operator flag.
# Preflight never begins/polls QR or changes source configuration.
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ($Mode -eq 'Live') {
    Write-Host 'Live QR may replace the selected source login. Closing/cancelling stops polling; it does not log out or remove any source.'
    & $node (Join-Path $PSScriptRoot 'fqgate205-qr-live.mjs') --config $Config --evidence $EvidenceDirectory --allow-live ([string][bool]$AllowLiveQr)
    exit $LASTEXITCODE
}
& $node (Join-Path $PSScriptRoot 'fqgate205-qr-preflight.mjs') --config $Config --evidence $EvidenceDirectory --mode $Mode --allow-live ([string][bool]$AllowLiveQr)
exit $LASTEXITCODE
