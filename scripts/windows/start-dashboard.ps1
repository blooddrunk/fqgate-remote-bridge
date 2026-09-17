[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$InstallFqgate,
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $repositoryRoot

$node =
    Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
$script:nodePath = $null
if ($null -ne $node) {
    $script:nodePath = $node.Source
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
    $script:nodePath = $nodeCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($script:nodePath)) {
    throw "Node.js 22 or newer is required. Install Node.js from https://nodejs.org/"
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

$nodeVersionText = (Get-NodeVersionText $script:nodePath).TrimStart("v")
$nodeVersion = [Version]$nodeVersionText
if ($nodeVersion.Major -lt 22) {
    throw "Node.js 22 or newer is required; found $nodeVersionText."
}

$corepack =
    Get-Command corepack.cmd -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
$pnpm =
    Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -ne $corepack) {
    $script:packageManagerPath = $corepack.Source
    $script:packageManagerPrefix = @("pnpm")
} elseif ($null -ne $pnpm) {
    $script:packageManagerPath = $pnpm.Source
    $script:packageManagerPrefix = @()
} else {
    throw "pnpm was not found. Run 'corepack enable' or install pnpm 11.23.0 with 'npm install --global pnpm@11.23.0'."
}

function Invoke-Pnpm {
    param([string[]]$Arguments)

    $invokeArguments = @($script:packageManagerPrefix) + $Arguments
    & $script:packageManagerPath @invokeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm exited with code $LASTEXITCODE"
    }
}

if ($ConfigPath) {
    $resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    $env:FQGATE_REMOTE_BRIDGE_CONFIG = $resolvedConfigPath
}

if (-not $SkipInstall -and -not (Test-Path -LiteralPath (Join-Path $repositoryRoot "node_modules") -PathType Container)) {
    Write-Host "Installing JavaScript dependencies with the pinned pnpm version..."
    Invoke-Pnpm @("install", "--frozen-lockfile")
}

if (-not $SkipBuild) {
    Write-Host "Building the CLI and production dashboard..."
    Invoke-Pnpm @("build")
}

$cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
$bridgeScriptPath = Join-Path $repositoryRoot "scripts\start-bridge.mjs"
$serverOutputPath = Join-Path $repositoryRoot ".output\server\index.mjs"
if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw "Built CLI was not found at '$cliPath'. Run this script without -SkipBuild."
}
if (-not (Test-Path -LiteralPath $serverOutputPath -PathType Leaf)) {
    throw "Production dashboard output was not found. Run this script without -SkipBuild."
}

function Add-ConfigArgument {
    param([string[]]$Arguments)

    if ($ConfigPath) {
        return $Arguments + @("--config", $ConfigPath)
    }
    return $Arguments
}

function ConvertTo-ProcessArgument {
    param([string]$Value)

    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-NodeCli {
    param([string[]]$Arguments)

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:nodePath
    $startInfo.Arguments = (@($cliPath) + $Arguments |
        ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    $startInfo.WorkingDirectory = $repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $false
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw "Unable to start the bridge CLI."
        }
        $stdout = $process.StandardOutput.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "fqgate-remote-bridge exited with code $($process.ExitCode)"
        }
        return $stdout
    } finally {
        $process.Dispose()
    }
}

function Invoke-FqgateCli {
    param([string[]]$Arguments)

    $stdout = Invoke-NodeCli -Arguments (Add-ConfigArgument $Arguments)
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        Write-Host $stdout.TrimEnd()
    }
}

function Get-FqgateStatus {
    $statusOutput = Invoke-NodeCli -Arguments (Add-ConfigArgument @("fqgate", "status", "--json"))
    if ([string]::IsNullOrWhiteSpace($statusOutput)) {
        throw "Unable to read the FQGate lifecycle status."
    }

    try {
        $status = $statusOutput | ConvertFrom-Json
    } catch {
        throw "The FQGate lifecycle status was not valid JSON."
    }
    return $status
}

$fqgateStatus = Get-FqgateStatus
if ($fqgateStatus.lifecycle -eq "not_installed") {
    if (-not $InstallFqgate) {
        Write-Host "FQGate is not installed. Preview it with:"
        Write-Host "  node .\dist\cli\main.js fqgate install --dry-run"
        Write-Host "Then run this launcher again with -InstallFqgate to explicitly install it."
        throw "FQGate is not installed."
    }

    Write-Host "Installing FQGate from the validated official release source..."
    Invoke-FqgateCli @("fqgate", "install")
    $fqgateStatus = Get-FqgateStatus
}

if ($fqgateStatus.lifecycle -eq "incompatible") {
    throw "The installed FQGate version is not validated for this bridge."
}
if ($fqgateStatus.process.state -eq "not_running") {
    Write-Host "Starting the bridge-managed FQGate desktop process..."
    Invoke-FqgateCli @("fqgate", "start")
} elseif ($fqgateStatus.process.state -in @("identity_mismatch", "unknown")) {
    throw "The managed FQGate process identity could not be verified."
}

$bridgePort = 17282
if ($env:BRIDGE_PORT) {
    $parsedPort = 0
    if (-not [int]::TryParse($env:BRIDGE_PORT, [ref]$parsedPort)) {
        throw "BRIDGE_PORT must be an integer between 1024 and 65535."
    }
    if ($parsedPort -lt 1024 -or $parsedPort -gt 65535) {
        throw "BRIDGE_PORT must be an integer between 1024 and 65535."
    }
    $bridgePort = $parsedPort
}

$bridgeArguments = @('"' + $bridgeScriptPath + '"')
$bridgeProcess = Start-Process `
    -FilePath $script:nodePath `
    -ArgumentList $bridgeArguments `
    -WorkingDirectory $repositoryRoot `
    -PassThru `
    -NoNewWindow

try {
    $bridgeReady = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 250
        if ($bridgeProcess.HasExited) {
            throw "The production bridge exited before it became ready."
        }
        try {
            $versionResponse = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri "http://127.0.0.1:$bridgePort/api/v1/version" `
                -TimeoutSec 2
            if ($versionResponse.StatusCode -eq 200) {
                $bridgeReady = $true
                break
            }
        } catch {
            # The production bundle may still be loading.
        }
    }

    if (-not $bridgeReady) {
        throw "The production bridge did not become ready on 127.0.0.1:$bridgePort."
    }

    $dashboardUrl = "http://127.0.0.1:$bridgePort/"
    if (-not $NoBrowser) {
        Start-Process $dashboardUrl | Out-Null
    }
    Write-Host "Dashboard is ready at $dashboardUrl"
    Write-Host "Press Ctrl+C to stop the bridge. FQGate will remain running."
    Wait-Process -Id $bridgeProcess.Id
} finally {
    if ($null -ne $bridgeProcess -and -not $bridgeProcess.HasExited) {
        Stop-Process -Id $bridgeProcess.Id -Force
        $bridgeProcess.WaitForExit()
    }
}
