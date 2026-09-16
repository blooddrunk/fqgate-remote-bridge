[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-BridgeCli {
    param([string[]]$Arguments)

    & pnpm exec fqgate-remote-bridge @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "fqgate-remote-bridge exited with code $LASTEXITCODE"
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
    throw "Node.js 22 or newer is required."
}

$nodeVersionText = (& node --version).Trim().TrimStart("v")
$nodeVersion = [Version]$nodeVersionText
if ($nodeVersion.Major -lt 22) {
    throw "Node.js 22 or newer is required; found $nodeVersionText."
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($null -eq $pnpm) {
    throw "pnpm is required. Install pnpm 11.x or enable it through Corepack."
}

$installArguments = @("fqgate", "install")
if ($DryRun) {
    $installArguments += "--dry-run"
}
if ($ConfigPath) {
    $installArguments += @("--config", $ConfigPath)
}

Write-Host "Running the local-only FQGate lifecycle install command..."
Invoke-BridgeCli -Arguments $installArguments

$statusArguments = @("fqgate", "status")
if ($ConfigPath) {
    $statusArguments += @("--config", $ConfigPath)
}
Invoke-BridgeCli -Arguments $statusArguments
