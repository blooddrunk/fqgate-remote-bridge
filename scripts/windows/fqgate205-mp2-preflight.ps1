[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Config,
    [Parameter(Mandatory=$true)][string]$Profiles,
    [string]$EvidenceDirectory='D:\code\research\fqgate-mp2-evidence'
)
$ErrorActionPreference = 'Stop'
# No Live/AllowLiveQr switch exists. PowerShell rejects either before Node runs.
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'fqgate205-mp2-preflight.mjs') --config $Config --profiles $Profiles --evidence $EvidenceDirectory
exit $LASTEXITCODE
