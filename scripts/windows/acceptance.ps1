[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$ExecuteInstall,
    [switch]$VerifyCli,
    [switch]$VerifyBridge
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

function Add-ConfigArgument {
    param([string[]]$Arguments)

    if ($ConfigPath) {
        return $Arguments + @("--config", $ConfigPath)
    }
    return $Arguments
}

if ($VerifyCli) {
    Invoke-BridgeCli (Add-ConfigArgument @("version", "--json"))
    if (-not $VerifyBridge) {
        exit 0
    }
}

if ($VerifyBridge) {
    $bridgePort = 17282
    $bridgeScriptPath = Join-Path $repositoryRoot "scripts\start-bridge.mjs"
    if (-not (Test-Path -LiteralPath $bridgeScriptPath -PathType Leaf)) {
        throw "Bridge launcher was not found at '$bridgeScriptPath'. Run 'pnpm build' from '$repositoryRoot' before running this script."
    }

    $bridgeArguments = @('"' + $bridgeScriptPath + '"')
    $bridgeProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList $bridgeArguments `
        -WorkingDirectory $repositoryRoot `
        -PassThru `
        -WindowStyle Hidden

    try {
        $bridgeReady = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
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
                # The launcher may still be loading the production bundle.
            }
        }

        if (-not $bridgeReady) {
            throw "The production bridge did not become ready on 127.0.0.1:$bridgePort."
        }

        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $bridgePort -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") {
            throw "The production bridge must have exactly one IPv4 loopback listener on port $bridgePort."
        }

        $rawStatus = 0
        try {
            $rawResponse = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri "http://127.0.0.1:$bridgePort/v1/market/health" `
                -TimeoutSec 2
            $rawStatus = [int]$rawResponse.StatusCode
        } catch {
            if ($null -ne $_.Exception.Response) {
                $rawStatus = [int]$_.Exception.Response.StatusCode
            } else {
                throw
            }
        }

        if ($rawStatus -ne 404) {
            throw "The raw FQGate path must remain unreachable; expected HTTP 404, received $rawStatus."
        }

        Write-Host "Production bridge loopback and deny-by-default smoke test passed."
    } finally {
        if ($null -ne $bridgeProcess -and -not $bridgeProcess.HasExited) {
            Stop-Process -Id $bridgeProcess.Id -Force
            $bridgeProcess.WaitForExit()
        }
    }

    exit 0
}

Write-Host "FQGate Remote Bridge Phase 0/1 Windows x64 acceptance procedure"
Write-Host "This script never installs a Windows service or Task Scheduler entry."

Invoke-BridgeCli (Add-ConfigArgument @("version", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "install", "--dry-run", "--json"))

if (-not $ExecuteInstall) {
    Write-Host "Dry-run complete. Re-run with -ExecuteInstall on a disposable/test-managed host to execute the acceptance steps."
    exit 0
}

Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "install", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "status", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "health", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "stop", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "start", "--json"))
Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "status", "--json"))

Write-Host "Running the fixture-backed rollback proof (no real FQGate binary is used by this check)..."
& pnpm test -- tests/lifecycle.test.ts
if ($LASTEXITCODE -ne 0) {
    throw "Fixture-backed lifecycle rollback proof failed with code $LASTEXITCODE"
}

Write-Host "Verify manually that the process path is the managed current/fqgate.exe path, that the first-use desktop acknowledgement (if shown) is completed, and that process/network/session state remain distinct."
Write-Host "Headless service support is not proven by this procedure."
