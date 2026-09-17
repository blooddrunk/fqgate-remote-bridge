[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$ExecuteInstall,
    [switch]$VerifyCli,
    [switch]$VerifyBridge,
    [switch]$VerifyPhase3,
    [switch]$VerifyPhase4,
    [string]$RemoteUrl
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$cliPath = Join-Path $repositoryRoot "dist\cli\main.js"
if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw "Built CLI was not found at '$cliPath'. Run 'pnpm build' from '$repositoryRoot' before running this script."
}

function Invoke-BridgeCli {
    param([string[]]$Arguments)

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:nodePath
    $startInfo.Arguments = (@($script:cliPath) + $Arguments |
        ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    $startInfo.WorkingDirectory = $script:repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw "Unable to start the bridge CLI."
        }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($stdout) {
            Write-Host $stdout.TrimEnd()
        }
        if ($stderr) {
            Write-Host $stderr.TrimEnd()
        }
        if ($process.ExitCode -ne 0) {
            throw "fqgate-remote-bridge exited with code $($process.ExitCode)"
        }
    } finally {
        $process.Dispose()
    }
}

function ConvertTo-ProcessArgument {
    param([string]$Value)

    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Get-HttpStatusWithoutRedirect {
    param([string]$Uri)

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.AllowAutoRedirect = $false
    $request.Method = "GET"
    $request.Timeout = 15000
    try {
        $response = $request.GetResponse()
        try {
            return [int]$response.StatusCode
        } finally {
            $response.Dispose()
        }
    } catch [System.Net.WebException] {
        if ($null -ne $_.Exception.Response) {
            $response = $_.Exception.Response
            try {
                return [int]$response.StatusCode
            } finally {
                $response.Dispose()
            }
        }
        throw
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
if ([string]::IsNullOrWhiteSpace($nodeVersionText)) {
    throw "Node.js 22 or newer is required; the version probe returned no version."
}
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

if ($VerifyPhase3) {
    # Phase 3 verification deliberately implies the ordinary CLI and bridge
    # smoke checks, but never applies an update or changes the FQGate binary.
    $VerifyCli = $true
    $VerifyBridge = $true
}

if ($VerifyPhase4) {
    # Phase 4 is explicit and never silently creates a Tunnel, Access policy,
    # service, or token file. It reuses the safe loopback checks and requires
    # real operator-provided Cloudflare resources for the public check.
    $VerifyCli = $true
    $VerifyBridge = $true
}

if ($VerifyCli) {
    Invoke-BridgeCli (Add-ConfigArgument @("version", "--json"))
    if ($VerifyPhase3) {
        Invoke-BridgeCli (Add-ConfigArgument @("fqgate", "update", "--check", "--json"))
    }
    if ($VerifyPhase4) {
        Invoke-BridgeCli (Add-ConfigArgument @("cloudflared", "status", "--json"))
    }
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

        if ($VerifyPhase3) {
            $fqgateListeners = @(Get-NetTCPConnection -State Listen -LocalPort 17281 -ErrorAction SilentlyContinue)
            if ($fqgateListeners.Count -ne 1 -or $fqgateListeners[0].LocalAddress -ne "127.0.0.1") {
                throw "FQGate must have exactly one IPv4 loopback listener on port 17281."
            }

            $updateStatusResponse = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri "http://127.0.0.1:$bridgePort/api/v1/updates/status" `
                -TimeoutSec 5
            $updateStatus = ($updateStatusResponse.Content | ConvertFrom-Json)
            if ($updateStatus.releaseSource.id -ne "github") {
                throw "The Dashboard update source must remain the fixed GitHub adapter."
            }

            $catalogResponse = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri "http://127.0.0.1:$bridgePort/api/v1/openapi/catalog" `
                -TimeoutSec 5
            $catalog = ($catalogResponse.Content | ConvertFrom-Json)
            if ($catalog.snapshot.endpoint -ne "http://127.0.0.1:17281/openapi.json") {
                throw "Runtime OpenAPI discovery did not use the fixed loopback endpoint."
            }
            if ($catalog.snapshot.fingerprint -notmatch '^[a-f0-9]{64}$') {
                throw "Runtime OpenAPI did not return a deterministic SHA-256 fingerprint."
            }
            $operationCount = @($catalog.snapshot.operations).Count
            $missingContractCount = @($catalog.contractCoverage.missing).Count
            Write-Host ("Runtime OpenAPI live check: openapi={0}; bytes={1}; fingerprint={2}; operations={3}; missing_required={4}." -f `
                $catalog.snapshot.openapiVersion,
                $catalog.snapshot.byteLength,
                $catalog.snapshot.fingerprint,
                $operationCount,
                $missingContractCount)

            $checkResponse = Invoke-WebRequest `
                -UseBasicParsing `
                -Method Post `
                -ContentType "application/json" `
                -Body "{}" `
                -Uri "http://127.0.0.1:$bridgePort/api/v1/updates/check" `
                -TimeoutSec 30
            $check = ($checkResponse.Content | ConvertFrom-Json)
            if ($check.releaseSource.id -ne "github") {
                throw "Dashboard update check did not use the fixed GitHub adapter."
            }

            $unknownStatus = 0
            try {
                $unknownResponse = Invoke-WebRequest `
                    -UseBasicParsing `
                    -Uri "http://127.0.0.1:$bridgePort/v1/new/unregistered" `
                    -TimeoutSec 2
                $unknownStatus = [int]$unknownResponse.StatusCode
            } catch {
                if ($null -ne $_.Exception.Response) {
                    $unknownStatus = [int]$_.Exception.Response.StatusCode
                } else {
                    throw
                }
            }
            if ($unknownStatus -ne 404) {
                throw "An unregistered upstream endpoint must remain unreachable; received $unknownStatus."
            }

            Write-Host "Phase 3 trusted update check, live OpenAPI catalog, contract fingerprint, and deny-by-default smoke tests passed."
        }

        if ($VerifyPhase4) {
            $fqgateListeners = @(Get-NetTCPConnection -State Listen -LocalPort 17281 -ErrorAction SilentlyContinue)
            if ($fqgateListeners.Count -ne 1 -or $fqgateListeners[0].LocalAddress -ne "127.0.0.1") {
                throw "FQGate must have exactly one IPv4 loopback listener on port 17281."
            }

            $serviceName = "FQGateRemoteBridgeCloudflared"
            $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
            if ($null -eq $service) {
                throw "The Phase 4 cloudflared Windows service is not installed."
            }
            if ($service.State -ne "Running") {
                throw "The Phase 4 cloudflared Windows service is not running."
            }
            if ([string]::IsNullOrWhiteSpace($service.PathName) -or $service.PathName -notmatch '--token-file') {
                throw "The cloudflared Windows service must use --token-file."
            }
            if ($service.PathName -match 'eyJ[a-zA-Z0-9_-]{20,}') {
                throw "The cloudflared Windows service command appears to contain a raw token."
            }

            if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
                Write-Host "Phase 4 live Cloudflare check is pending: provide -RemoteUrl to test unauthenticated Access protection."
            } else {
                $accessStatus = Get-HttpStatusWithoutRedirect -Uri $RemoteUrl
                if ($accessStatus -notin @(302, 303, 307, 308, 401, 403)) {
                    throw "The unauthenticated public hostname was not challenged or denied by Cloudflare Access; received $accessStatus."
                }
                Write-Host ("Unauthenticated Cloudflare Access check returned HTTP {0}; authenticated human and remote-denial checks remain manual evidence steps." -f $accessStatus)
            }
            Write-Host "Phase 4 local loopback, cloudflared service, token-file invocation, and origin-isolation checks passed. Do not mark Phase 4 closed until authenticated remote and restart/reconnect evidence is recorded."
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
