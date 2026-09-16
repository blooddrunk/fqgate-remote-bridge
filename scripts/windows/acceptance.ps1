[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$ExecuteInstall
)

$ErrorActionPreference = "Stop"

function Invoke-BridgeCli {
    param([string[]]$Arguments)

    & pnpm exec fqgate-remote-bridge @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "fqgate-remote-bridge exited with code $LASTEXITCODE"
    }
}

function Add-ConfigArgument {
    param([string[]]$Arguments)

    if ($ConfigPath) {
        return $Arguments + @("--config", $ConfigPath)
    }
    return $Arguments
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
