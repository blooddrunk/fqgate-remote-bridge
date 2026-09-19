[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [switch]$VerifyLocal,
    [switch]$RunAuthenticatedServiceTokenMatrix,
    [string]$MachineUrl,
    [string]$HumanUrl,
    [string]$AdminUrl,
    [string]$TunnelIngressConfigPath
)

$ErrorActionPreference = "Stop"

<#
    Phase 5-A acceptance.

    This script deliberately accepts no service-token credential arguments.
    The authenticated mode prompts with Read-Host -AsSecureString, decrypts
    only in memory, passes the values through a child-process environment, and
    clears both the child environment and local references in finally blocks.
    Output is limited to bounded PASS/FAIL/MANUAL/SKIP records.
#>

function Resolve-GitPath {
    $command = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }
    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += Join-Path $env:ProgramFiles "Git\cmd\git.exe"
        $candidates += Join-Path $env:ProgramFiles "Git\bin\git.exe"
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += Join-Path ${env:ProgramFiles(x86)} "Git\cmd\git.exe"
        $candidates += Join-Path ${env:ProgramFiles(x86)} "Git\bin\git.exe"
    }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

$script:gitPath = Resolve-GitPath

function Resolve-PermanentGitRoot {
    $base = "D:\code\research"
    $candidates = @(
        (Join-Path $base "fqgate-remote-bridge"),
        $base
    )
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
        if (-not [string]::IsNullOrWhiteSpace($script:gitPath)) {
            try {
            $root = (& $script:gitPath -C $candidate rev-parse --show-toplevel 2>$null).Trim()
            if (-not [string]::IsNullOrWhiteSpace($root)) {
                return $root
            }
            } catch {
                # Fall back to the repository marker below.
            }
        }
        $gitMarker = Join-Path $candidate ".git"
        if (Test-Path -LiteralPath $gitMarker) {
            if ((Test-Path -LiteralPath (Join-Path $gitMarker "HEAD")) -or
                -not (Test-Path -LiteralPath $gitMarker -PathType Container)) {
                return $candidate
            }
        }
    }
    throw "No existing Git working tree was found under D:\code\research. The acceptance script will not create a checkout."
}

$repositoryRoot = Resolve-PermanentGitRoot
$resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$configRaw = Get-Content -LiteralPath $resolvedConfigPath -Raw
if ($configRaw.Length -gt 128KB) {
    throw "The acceptance config is larger than the bounded metadata limit."
}
if ($configRaw -match '"(clientId|clientSecret|serviceToken|tunnelToken|accessToken|jwt|cookie)"\s*:') {
    throw "The acceptance config contains a forbidden credential-bearing key. Keep Client ID/Secret outside config."
}
$config = $configRaw | ConvertFrom-Json

$machineMetadataReady = -not [string]::IsNullOrWhiteSpace($config.remoteAccess.machineHostname) -and
    $null -ne $config.remoteAccess.machineAccess -and
    -not [string]::IsNullOrWhiteSpace($config.remoteAccess.machineAccess.teamDomain) -and
    -not [string]::IsNullOrWhiteSpace($config.remoteAccess.machineAccess.audience)

if ([string]::IsNullOrWhiteSpace($MachineUrl)) { $MachineUrl = "https://$($config.remoteAccess.machineHostname)" }
if ([string]::IsNullOrWhiteSpace($HumanUrl) -and $null -ne $config.remoteAccess.remoteHostname) {
    $HumanUrl = "https://$($config.remoteAccess.remoteHostname)"
}
if ([string]::IsNullOrWhiteSpace($AdminUrl) -and $null -ne $config.remoteAccess.adminHostname) {
    $AdminUrl = "https://$($config.remoteAccess.adminHostname)"
}

$script:failureCount = 0
$script:manualCount = 0
$script:nodePath = $null

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
    if ($State -eq "FAIL") { $script:failureCount++ }
    if ($State -eq "MANUAL") { $script:manualCount++ }
}

function Resolve-NodePath {
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $node) { return $node.Source }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles "nodejs\node.exe" }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe" }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe" }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

$script:nodePath = Resolve-NodePath
if ([string]::IsNullOrWhiteSpace($script:nodePath)) {
    throw "Node.js 22 or newer is required on the permanent Windows environment."
}

function ConvertTo-ProcessArgument {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-ChildProcess {
    param(
        [string[]]$Arguments,
        [hashtable]$Environment = @{}
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:nodePath
    $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    $startInfo.WorkingDirectory = $script:repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) {
        $startInfo.EnvironmentVariables[[string]$key] = [string]$Environment[$key]
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "Unable to start child process." }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = $stdout
            Stderr = $stderr
        }
    } finally {
        foreach ($key in $Environment.Keys) {
            $startInfo.EnvironmentVariables.Remove([string]$key)
        }
        $process.Dispose()
    }
}

function Invoke-BridgeCli {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $arguments = @($script:repositoryRoot + "\dist\cli\main.js") + $Arguments + @("--config", $resolvedConfigPath)
    return Invoke-ChildProcess -Arguments $arguments
}

function Read-BoundedText {
    param([System.IO.Stream]$Stream, [int]$MaximumBytes = 64KB)
    $buffer = New-Object byte[] 8192
    $memory = New-Object System.IO.MemoryStream
    try {
        while (($read = $Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if (($memory.Length + $read) -gt $MaximumBytes) { return "" }
            $memory.Write($buffer, 0, $read)
        }
        return [Text.Encoding]::UTF8.GetString($memory.ToArray())
    } finally {
        $memory.Dispose()
    }
}

function Invoke-BoundedHttp {
    param(
        [ValidateSet("GET", "POST")]
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers = @{},
        [int]$TimeoutSeconds = 20
    )

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.AllowAutoRedirect = $false
    $request.Timeout = $TimeoutSeconds * 1000
    $request.ReadWriteTimeout = $TimeoutSeconds * 1000
    foreach ($key in $Headers.Keys) {
        switch ([string]$key.ToLowerInvariant()) {
            "host" { $request.Host = [string]$Headers[$key]; continue }
            default { $request.Headers[[string]$key] = [string]$Headers[$key] }
        }
    }
    try {
        $response = $request.GetResponse()
        try {
            $body = Read-BoundedText $response.GetResponseStream()
            return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $body; Error = $null }
        } finally { $response.Dispose() }
    } catch [System.Net.WebException] {
        if ($null -ne $_.Exception.Response) {
            $response = $_.Exception.Response
            try {
                $body = Read-BoundedText $response.GetResponseStream()
                return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $body; Error = $null }
            } finally { $response.Dispose() }
        }
        return [pscustomobject]@{ Status = 0; Body = ""; Error = "HTTP request failed" }
    } catch {
        return [pscustomobject]@{ Status = 0; Body = ""; Error = "HTTP request failed" }
    } finally {
        $request.Abort()
    }
}

function Get-ErrorCode {
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) { return "" }
    try {
        $parsed = $Body | ConvertFrom-Json
        if ($null -ne $parsed.error.code) { return [string]$parsed.error.code }
    } catch { return "" }
    return ""
}

function Assert-LoopbackListener {
    param([string]$Id, [int]$Port, [string]$Name)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq "127.0.0.1") {
        Write-Result $Id $Name "PASS" ("127.0.0.1:{0}" -f $Port)
    } else {
        $observed = ($listeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ","
        if ([string]::IsNullOrWhiteSpace($observed)) { $observed = "none" }
        Write-Result $Id $Name "FAIL" ("expected exactly one IPv4 loopback listener; observed {0}" -f $observed)
    }
}

function ConvertFrom-SecureStringInMemory {
    param([Security.SecureString]$Value)
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

if (-not $VerifyLocal -and -not $RunAuthenticatedServiceTokenMatrix) { $VerifyLocal = $true }

if ($RunAuthenticatedServiceTokenMatrix -and -not $machineMetadataReady) {
    throw "Phase 5-A authenticated acceptance requires machineHostname, machineAccess.teamDomain, and machineAccess.audience in repo-external config; no credential prompt was opened."
}

if ($VerifyLocal) {
    $cliResult = Invoke-BridgeCli "version", "--json"
    if ($cliResult.ExitCode -eq 0) {
        Write-Result "P5A-W1" "permanent Windows CLI smoke" "PASS" "version command exited 0"
    } else {
        Write-Result "P5A-W1" "permanent Windows CLI smoke" "FAIL" "version command failed"
    }

    $configHostnames = @(
        [string]$config.remoteAccess.remoteHostname,
        [string]$config.remoteAccess.adminHostname,
        [string]$config.remoteAccess.machineHostname
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    if (($configHostnames | Select-Object -Unique).Count -ne $configHostnames.Count) {
        Write-Result "P5A-W2" "human/admin/machine hostnames are distinct" "FAIL" "duplicate hostname in acceptance config"
    } elseif (-not $machineMetadataReady) {
        Write-Result "P5A-W2" "human/admin/machine hostnames are distinct" "MANUAL" "machineHostname, machineAccess.teamDomain, and machineAccess.audience are missing from repo-external config"
    } else {
        Write-Result "P5A-W2" "human/admin/machine hostnames are distinct" "PASS" "three-way hostname collision check"
    }

    Write-Result "P5A-W3" "Tunnel origin evidence is reserved for authenticated acceptance" "SKIP" "the external Tunnel ingress is checked by P5A-W11; repo config stores no origin or token"

    $bridgeProcess = $null
    try {
        $bridgeScript = Join-Path $script:repositoryRoot "scripts\start-bridge.mjs"
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $script:nodePath
        $startInfo.Arguments = ConvertTo-ProcessArgument $bridgeScript
        $startInfo.WorkingDirectory = $script:repositoryRoot
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.EnvironmentVariables["FQGATE_REMOTE_BRIDGE_CONFIG"] = $resolvedConfigPath
        $bridgeProcess = New-Object System.Diagnostics.Process
        $bridgeProcess.StartInfo = $startInfo
        if (-not $bridgeProcess.Start()) { throw "Unable to start production bridge" }

        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            $versionResponse = Invoke-BoundedHttp -Method GET -Uri "http://127.0.0.1:17282/api/v1/version"
            if ($versionResponse.Status -eq 200) { $ready = $true; break }
        }
        if ($ready) {
            Write-Result "P5A-W4" "production Bridge loopback smoke" "PASS" "HTTP 200 on 127.0.0.1:17282"
        } else {
            Write-Result "P5A-W4" "production Bridge loopback smoke" "FAIL" "Bridge did not become ready"
        }

        Assert-LoopbackListener "P5A-W5" 17282 "Bridge listener remains IPv4 loopback-only"
        Assert-LoopbackListener "P5A-W6" 17281 "FQGate listener remains IPv4 loopback-only"

        $rawResponse = Invoke-BoundedHttp -Method GET -Uri "http://127.0.0.1:17282/v1/market/health"
        if ($rawResponse.Status -eq 404) {
            Write-Result "P5A-W7" "local raw FQGate path is denied" "PASS" "HTTP 404"
        } else {
            Write-Result "P5A-W7" "local raw FQGate path is denied" "FAIL" ("unexpected HTTP {0}" -f $rawResponse.Status)
        }

        $unknownResponse = Invoke-BoundedHttp -Method GET -Uri "http://127.0.0.1:17282/api/v1/version" -Headers @{ host = "unknown.example.com"; "x-forwarded-host" = [string]$config.remoteAccess.adminHostname }
        if ($unknownResponse.Status -eq 421) {
            Write-Result "P5A-W8" "unknown and forwarded-host spoofing are denied" "PASS" "HTTP 421"
        } else {
            Write-Result "P5A-W8" "unknown and forwarded-host spoofing are denied" "FAIL" ("unexpected HTTP {0}; code={1}" -f $unknownResponse.Status, (Get-ErrorCode $unknownResponse.Body))
        }
    } catch {
        Write-Result "P5A-W4" "production Bridge loopback smoke" "FAIL" "production smoke process failed"
    } finally {
        if ($null -ne $bridgeProcess) {
            if (-not $bridgeProcess.HasExited) { Stop-Process -Id $bridgeProcess.Id -Force }
            $bridgeProcess.Dispose()
        }
    }

    $serviceName = [string]$config.cloudflared.serviceName
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        Write-Result "P5A-W9" "cloudflared uses protected token-file service" "MANUAL" "service '$serviceName' is not installed on this host"
    } elseif ($service.PathName -match '--token-file' -and $service.PathName -notmatch 'eyJ[a-zA-Z0-9_-]{20,}') {
        Write-Result "P5A-W9" "cloudflared uses protected token-file service" "PASS" "service command has --token-file and no inline token"
    } else {
        Write-Result "P5A-W9" "cloudflared uses protected token-file service" "FAIL" "service command shape is not secret-safe"
    }
}

if ($RunAuthenticatedServiceTokenMatrix) {
    $harnessPath = Join-Path $script:repositoryRoot "scripts\windows\phase5a-authenticated-acceptance.mjs"
    $clientIdSecure = Read-Host "Cloudflare service-token Client ID (hidden)" -AsSecureString
    $clientSecretSecure = Read-Host "Cloudflare service-token Client Secret (hidden)" -AsSecureString
    $clientId = $null
    $clientSecret = $null
    try {
        $clientId = ConvertFrom-SecureStringInMemory $clientIdSecure
        $clientSecret = ConvertFrom-SecureStringInMemory $clientSecretSecure
        $arguments = @(
            $harnessPath,
            "--machine-url", $MachineUrl
        )
        if (-not [string]::IsNullOrWhiteSpace($HumanUrl)) { $arguments += @("--human-url", $HumanUrl) }
        if (-not [string]::IsNullOrWhiteSpace($AdminUrl)) { $arguments += @("--admin-url", $AdminUrl) }
        $child = Invoke-ChildProcess -Arguments $arguments -Environment @{
            CF_ACCESS_CLIENT_ID = $clientId
            CF_ACCESS_CLIENT_SECRET = $clientSecret
        }
        if (-not [string]::IsNullOrWhiteSpace($child.Stdout)) {
            # The companion emits only bounded PASS/FAIL records; it never echoes env values.
            Write-Host $child.Stdout.TrimEnd()
        }
        if ($child.ExitCode -eq 0) {
            Write-Result "P5A-W10" "real Cloudflare service-token request matrix" "PASS" "companion exited 0"
        } else {
            Write-Result "P5A-W10" "real Cloudflare service-token request matrix" "FAIL" "companion returned a non-zero result; inspect the bounded P5A-R records above"
        }
    } finally {
        if ($null -ne $clientIdSecure) { $clientIdSecure.Dispose() }
        if ($null -ne $clientSecretSecure) { $clientSecretSecure.Dispose() }
        $clientId = $null
        $clientSecret = $null
    }

    if ([string]::IsNullOrWhiteSpace($TunnelIngressConfigPath)) {
        Write-Result "P5A-W11" "machine Tunnel ingress contains only the Bridge origin" "MANUAL" "review the machine hostname ingress in Cloudflare and confirm exactly http://127.0.0.1:17282 with no 17281 route"
    } else {
        $ingressPath = (Resolve-Path -LiteralPath $TunnelIngressConfigPath).Path
        $ingress = Get-Content -LiteralPath $ingressPath -Raw
        if ($ingress.Length -gt 64KB) { throw "Tunnel ingress evidence exceeds the bounded size limit." }
        if ($ingress -match "17281" -or $ingress -notmatch "http://127\.0\.0\.1:17282") {
            Write-Result "P5A-W11" "machine Tunnel ingress contains only the Bridge origin" "FAIL" "ingress evidence contains a non-Bridge origin"
        } else {
            Write-Result "P5A-W11" "machine Tunnel ingress contains only the Bridge origin" "PASS" "bounded ingress evidence contains Bridge origin and no 17281"
        }
    }
}

if ($script:failureCount -gt 0) {
    throw ("Phase 5-A acceptance failed with {0} failed check(s)." -f $script:failureCount)
}
if ($script:manualCount -gt 0) {
    throw ("Phase 5-A acceptance remains OPEN with {0} manual evidence item(s); complete the exact operator action named above and rerun." -f $script:manualCount)
}
Write-Host "Phase 5-A acceptance completed with no failed or pending checks."
