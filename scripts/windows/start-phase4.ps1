[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [string]$ServiceName = "FQGateRemoteBridgeCloudflared",
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $PSScriptRoot "start-dashboard.ps1"
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
    throw "The dashboard launcher was not found at '$launcherPath'."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $service) {
    throw "The cloudflared Windows service '$ServiceName' is not installed."
}

if ($service.Status -ne "Running") {
    Write-Host "Starting the existing cloudflared service '$ServiceName'..."
    Start-Service -Name $ServiceName
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $service = Get-Service -Name $ServiceName
        if ($service.Status -eq "Running") {
            break
        }
        Start-Sleep -Seconds 1
    }
}

$service = Get-Service -Name $ServiceName
if ($service.Status -ne "Running") {
    throw "The cloudflared Windows service '$ServiceName' did not reach Running."
}

Write-Host "cloudflared service is Running. Starting FQGate and the loopback Bridge..."
$launcherArguments = @(
    "-ConfigPath",
    $ConfigPath,
    "-SkipInstall",
    "-SkipBuild"
)
if ($NoBrowser) {
    $launcherArguments += "-NoBrowser"
}

& $launcherPath @launcherArguments
if ($LASTEXITCODE -ne 0) {
    throw "The FQGate/Bridge launcher exited with code $LASTEXITCODE."
}
