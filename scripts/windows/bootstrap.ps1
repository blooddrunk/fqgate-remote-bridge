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
    Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
$nodePath = $null
if ($null -ne $node) {
    $nodePath = $node.Source
} else {
    $nodeCandidates = @()
    if ($env:ProgramFiles) {
        $nodeCandidates += Join-Path $env:ProgramFiles "nodejs\node.exe"
    }
    if (${env:ProgramFiles(x86)}) {
        $nodeCandidates += Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"
    }
    if ($env:LOCALAPPDATA) {
        $nodeCandidates += Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"
    }
    $nodePath = $nodeCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($nodePath)) {
    throw "Node.js 22 or newer is required."
}

function Get-NodeVersionText {
    param([string]$Path)

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $Path
    $startInfo.Arguments = "--version"
    $startInfo.WorkingDirectory = $env:SystemRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw "Unable to start Node.js at '$Path'."
        }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "Node.js version probe failed: $stderr"
        }
        return $stdout.Trim()
    } finally {
        $process.Dispose()
    }
}

$nodeVersionText = (Get-NodeVersionText $nodePath).TrimStart("v")
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
