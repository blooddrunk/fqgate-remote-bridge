[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Live')][string]$Mode = 'Preflight',
    [switch]$AllowLiveQr,
    [Parameter(Mandatory = $true)][string]$Config,
    [string]$EvidenceDirectory = 'D:\code\research\fqgate-205-qr-evidence'
)
$ErrorActionPreference = 'Stop'
# Explicit flag is necessary but cannot enable an unimplemented/unreviewed adapter.
# This version is a read-only blocked-contract delivery. Neither mode performs QR POSTs.
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'fqgate205-qr-preflight.mjs') --config $Config --evidence $EvidenceDirectory --mode $Mode --allow-live ([string][bool]$AllowLiveQr)
exit $LASTEXITCODE
