[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [string]$OrdinaryUrl,
    [string]$AdminUrl,
    [switch]$RestartCloudflared,
    [switch]$RunLocalMaintenance
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

<#
    Phase 4.5 live acceptance helper.

    This script deliberately does not log Access assertions, cookies, QR
    payloads, redirect locations, Tunnel tokens, or confirmation grants. It
    performs only bounded probes and never runs updates.apply.
#>

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$serviceName = [string]$config.cloudflared.serviceName
if ([string]::IsNullOrWhiteSpace($serviceName)) {
    throw "cloudflared.serviceName is missing from the configuration."
}

if ([string]::IsNullOrWhiteSpace($OrdinaryUrl)) {
    $OrdinaryUrl = "https://$($config.remoteAccess.remoteHostname)"
}
if ([string]::IsNullOrWhiteSpace($AdminUrl)) {
    $AdminUrl = "https://$($config.remoteAccess.adminHostname)"
}

$script:failureCount = 0

function Write-Result {
    param(
        [string]$Id,
        [string]$Name,
        [ValidateSet("PASS", "FAIL", "MANUAL", "SKIP")]
        [string]$State,
        [string]$Detail
    )

    $color = switch ($State) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "MANUAL" { "Yellow" }
        default { "DarkYellow" }
    }
    Write-Host ("[{0}] {1} - {2}: {3}" -f $State, $Id, $Name, $Detail) -ForegroundColor $color
    if ($State -eq "FAIL") {
        $script:failureCount++
    }
}

function Get-ErrorCode {
    param([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) {
        return ""
    }
    try {
        $parsed = $Body | ConvertFrom-Json
        if ($null -ne $parsed.error.code) {
            return [string]$parsed.error.code
        }
    } catch {
        return ""
    }
    return ""
}

function Invoke-BoundedHttp {
    param(
        [ValidateSet("GET", "POST")]
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [string]$Body,
        [int]$TimeoutSeconds = 30
    )

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.AllowAutoRedirect = $false
    $request.Timeout = $TimeoutSeconds * 1000
    $request.ReadWriteTimeout = $TimeoutSeconds * 1000
    try {
        if ($null -ne $Headers) {
            foreach ($key in $Headers.Keys) {
                $headerName = [string]$key
                $headerValue = [string]$Headers[$key]
                switch ($headerName.ToLowerInvariant()) {
                    "content-type" { $request.ContentType = $headerValue; continue }
                    "host" { $request.Host = $headerValue; continue }
                    "content-length" { $request.ContentLength = [long]$headerValue; continue }
                    default { $request.Headers[$headerName] = $headerValue }
                }
            }
        }
        if (-not [string]::IsNullOrEmpty($Body)) {
            $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
            $request.ContentLength = $bytes.Length
            $stream = $request.GetRequestStream()
            try {
                $stream.Write($bytes, 0, $bytes.Length)
            } finally {
                $stream.Dispose()
            }
        }
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try {
            $responseBody = $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Body = $responseBody
            Error = $null
        }
    } catch [System.Net.WebException] {
        if ($null -ne $_.Exception.Response) {
            $response = $_.Exception.Response
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try {
                $responseBody = $reader.ReadToEnd()
            } finally {
                $reader.Dispose()
            }
            return [pscustomobject]@{
                Status = [int]$response.StatusCode
                Body = $responseBody
                Error = $null
            }
        }
        return [pscustomobject]@{
            Status = 0
            Body = ""
            Error = $_.Exception.Message
        }
    } catch {
        return [pscustomobject]@{
            Status = 0
            Body = ""
            Error = $_.Exception.Message
        }
    } finally {
        if ($null -ne $request) { $request.Abort() }
    }
}

function Assert-LoopbackListener {
    param(
        [string]$Id,
        [string]$Name,
        [int]$Port
    )

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $valid = $listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq "127.0.0.1"
    if ($valid) {
        Write-Result $Id $Name "PASS" ("exactly 127.0.0.1:{0}" -f $Port)
    } else {
        $addresses = ($listeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ", "
        if ([string]::IsNullOrWhiteSpace($addresses)) { $addresses = "no listener" }
        Write-Result $Id $Name "FAIL" ("expected exactly one IPv4 loopback listener; observed {0}" -f $addresses)
    }
}

function Assert-LocalGet {
    param(
        [string]$Id,
        [string]$Name,
        [string]$Path,
        [int[]]$ExpectedStatus
    )

    $result = Invoke-BoundedHttp -Method GET -Uri ("http://127.0.0.1:17282" + $Path)
    if ($ExpectedStatus -contains $result.Status) {
        Write-Result $Id $Name "PASS" ("HTTP {0}" -f $result.Status)
    } else {
        $detail = if ($result.Status -eq 0) { $result.Error } else { "HTTP $($result.Status)" }
        Write-Result $Id $Name "FAIL" $detail
    }
}

function Assert-LocalPost {
    param(
        [string]$Id,
        [string]$Name,
        [string]$Path,
        [int[]]$ExpectedStatus,
        [int]$TimeoutSeconds = 30
    )

    $result = Invoke-BoundedHttp `
        -Method POST `
        -Uri ("http://127.0.0.1:17282" + $Path) `
        -Headers @{ "content-type" = "application/json" } `
        -Body "{}" `
        -TimeoutSeconds $TimeoutSeconds
    if ($ExpectedStatus -contains $result.Status) {
        Write-Result $Id $Name "PASS" ("HTTP {0}" -f $result.Status)
    } else {
        $detail = if ($result.Status -eq 0) { $result.Error } else { "HTTP $($result.Status); code=$(Get-ErrorCode $result.Body)" }
        Write-Result $Id $Name "FAIL" $detail
    }
}

function Assert-HostPolicy {
    $result = Invoke-BoundedHttp `
        -Method GET `
        -Uri "http://127.0.0.1:17282/api/v1/capabilities" `
        -Headers @{ "Host" = "unknown.invalid"; "X-Forwarded-Host" = [string]$config.remoteAccess.remoteHostname }
    if ($result.Status -eq 421 -and (Get-ErrorCode $result.Body) -eq "HOST_NOT_ALLOWED") {
        Write-Result "T15" "unknown Host and forwarded-host spoofing" "PASS" "HTTP 421 HOST_NOT_ALLOWED"
    } else {
        Write-Result "T15" "unknown Host and forwarded-host spoofing" "FAIL" ("HTTP {0}; code={1}" -f $result.Status, (Get-ErrorCode $result.Body))
    }
}

function Assert-UnauthenticatedPublicHost {
    param(
        [string]$Id,
        [string]$Name,
        [string]$Uri
    )

    $result = Invoke-BoundedHttp -Method GET -Uri ($Uri.TrimEnd("/" ) + "/") -TimeoutSeconds 20
    $expected = @(302, 303, 307, 308, 401, 403)
    if ($expected -contains $result.Status) {
        Write-Result $Id $Name "PASS" ("unauthenticated request returned HTTP {0}; challenge/denial observed" -f $result.Status)
    } else {
        $detail = if ($result.Status -eq 0) { $result.Error } else { "HTTP $($result.Status); public access must not return 200" }
        Write-Result $Id $Name "FAIL" $detail
    }
}

function Assert-UnauthenticatedMaintenance {
    param(
        [string]$Id,
        [string]$Name,
        [string]$HostName,
        [string]$Path
    )

    $result = Invoke-BoundedHttp `
        -Method POST `
        -Uri ("http://127.0.0.1:17282" + $Path) `
        -Headers @{ "Host" = $HostName; "content-type" = "application/json" } `
        -Body "{}"
    if ($result.Status -eq 403 -and (Get-ErrorCode $result.Body) -eq "ACCESS_ASSERTION_REQUIRED") {
        Write-Result $Id $Name "PASS" "Bridge rejected the request before maintenance dispatch (HTTP 403 ACCESS_ASSERTION_REQUIRED)"
    } else {
        Write-Result $Id $Name "FAIL" ("HTTP {0}; code={1}" -f $result.Status, (Get-ErrorCode $result.Body))
    }
}

Write-Host "Phase 4.5 live acceptance helper (never runs updates.apply)." -ForegroundColor Cyan
Write-Host ("Config: {0}" -f $ConfigPath)
Write-Host ("Ordinary public URL: {0}" -f $OrdinaryUrl)
Write-Host ("Admin public URL: {0}" -f $AdminUrl)

Assert-LoopbackListener "T1" "FQGate listener" 17281
Assert-LoopbackListener "T1" "Bridge listener" 17282

$service = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $serviceName) -ErrorAction SilentlyContinue
if ($null -eq $service) {
    Write-Result "T3" "cloudflared service" "FAIL" "service not found"
} else {
    $pathName = [string]$service.PathName
    $usesTokenFile = $pathName -match "--token-file"
    $containsRawToken = $pathName -match "eyJ[a-zA-Z0-9_-]{20,}"
    if ($service.State -eq "Running" -and $usesTokenFile -and -not $containsRawToken) {
        Write-Result "T3" "cloudflared token-file service" "PASS" "service Running; command shape contains --token-file and no raw token"
    } else {
        Write-Result "T3" "cloudflared token-file service" "FAIL" ("state={0}; token-file={1}; raw-token={2}" -f $service.State, $usesTokenFile, $containsRawToken)
    }
}

if ($RestartCloudflared) {
    try {
        Restart-Service -Name $serviceName -Force -ErrorAction Stop
        $deadline = (Get-Date).AddSeconds(30)
        do {
            Start-Sleep -Milliseconds 500
            $service = Get-Service -Name $serviceName -ErrorAction Stop
        } while ($service.Status -ne "Running" -and (Get-Date) -lt $deadline)
        if ($service.Status -eq "Running") {
            Write-Result "T3-reconnect" "cloudflared restart/reconnect" "PASS" "service returned to Running"
        } else {
            Write-Result "T3-reconnect" "cloudflared restart/reconnect" "FAIL" ("service state is {0}" -f $service.Status)
        }
    } catch {
        Write-Result "T3-reconnect" "cloudflared restart/reconnect" "MANUAL" "restart was not performed by this shell; run Restart-Service as an administrator"
    }
} else {
    Write-Result "T3-reconnect" "cloudflared restart/reconnect" "SKIP" "re-run with -RestartCloudflared after the base checks pass"
}

Assert-LocalGet "T16" "local Bridge version" "/api/v1/version" @(200)
Assert-LocalGet "T16" "local update status" "/api/v1/updates/status" @(200)
Assert-LocalGet "T16" "local OpenAPI catalog" "/api/v1/openapi/catalog" @(200)

$rawResult = Invoke-BoundedHttp -Method GET -Uri "http://127.0.0.1:17282/v1/market/health"
if ($rawResult.Status -eq 404) {
    Write-Result "T15" "local raw FQGate path" "PASS" "HTTP 404"
} else {
    Write-Result "T15" "local raw FQGate path" "FAIL" ("HTTP {0}" -f $rawResult.Status)
}

Assert-HostPolicy

$maintenancePaths = @(
    "/api/v1/updates/check",
    "/api/v1/updates/plan",
    "/api/v1/updates/apply",
    "/api/v1/openapi/refresh"
)
foreach ($path in $maintenancePaths) {
    $operationName = $path.TrimStart("/").Replace("/", ".")
    Assert-UnauthenticatedMaintenance "T5" ("ordinary host unauthenticated {0}" -f $operationName) ([string]$config.remoteAccess.remoteHostname) $path
    Assert-UnauthenticatedMaintenance "T6/T9" ("admin host unauthenticated {0}" -f $operationName) ([string]$config.remoteAccess.adminHostname) $path
}

Assert-UnauthenticatedPublicHost "T6" "ordinary public Access challenge" $OrdinaryUrl
Assert-UnauthenticatedPublicHost "T6" "admin public Access challenge" $AdminUrl

if ($RunLocalMaintenance) {
    Assert-LocalPost "T16" "local updates.check" "/api/v1/updates/check" @(200) 60
    Assert-LocalPost "T16" "local updates.plan" "/api/v1/updates/plan" @(200) 60
    Assert-LocalPost "T16" "local openapi.refresh" "/api/v1/openapi/refresh" @(200) 30
} else {
    Write-Result "T16-maintenance" "local check/plan/OpenAPI refresh" "SKIP" "re-run with -RunLocalMaintenance; this mode never runs updates.apply"
}

Write-Host ""
Write-Host "Manual browser evidence still required:" -ForegroundColor Yellow
Write-Host "  T4: ordinary-human Dashboard/status/QR/reference; direct maintenance calls must be 403."
Write-Host "  T7/T8: verify the low-friction admin policy (exact operator identity + MFA, require=[]; no WARP/certificate/posture) and complete the real browser login."
Write-Host "  T9/T10: real admin session must reach Bridge and run check/plan/OpenAPI refresh."
Write-Host "  T11/T12: use the admin UI/test harness for confirmation expiry, replay, mismatch, and race."
Write-Host "  T13: only an explicitly approved known-safe candidate may be applied; otherwise record NOT AVAILABLE."
Write-Host "  T14/T17: authenticated negative-path and real mobile-browser smoke."

if ($script:failureCount -gt 0) {
    Write-Host ("BLOCKED: {0} automated checks failed. Fix these before browser acceptance." -f $script:failureCount) -ForegroundColor Red
    exit 1
}

Write-Host "Automated checks passed. The remaining manual items are the real Access identity/browser gates listed above." -ForegroundColor Green
exit 0
