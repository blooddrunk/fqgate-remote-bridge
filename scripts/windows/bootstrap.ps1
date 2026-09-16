[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$DryRun,
    [switch]$VerifyCli
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw "Built CLI was not found at '$cliPath'. Run 'pnpm build' from '$repositoryRoot' before running this script."
}

function Invoke-BridgeCli {
    param([string[]]$Arguments)

    & $script:nodePath $script:cliPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "fqgate-remote-bridge exited with code $LASTEXITCODE"
    }
}

$node =
    Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $node) {
    throw "Node.js 22 or newer is required."
}

$nodePath = $node.Source
$nodeVersionText = (& $nodePath --version).Trim().TrimStart("v")
$nodeVersion = [Version]$nodeVersionText
if ($nodeVersion.Major -lt 22) {
    throw "Node.js 22 or newer is required; found $nodeVersionText."
}

if ($VerifyCli) {
    $verifyArguments = @("version", "--json")
    if ($ConfigPath) {
        $verifyArguments += @("--config", $ConfigPath)
    }
    Invoke-BridgeCli -Arguments $verifyArguments
    exit 0
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
