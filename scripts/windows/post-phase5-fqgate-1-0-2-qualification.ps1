[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [string]$TunnelIngressConfigPath,
    [switch]$RunAuthenticatedServiceTokenMatrix
)

$ErrorActionPreference = "Stop"
$expectedVersion = "1.0.2"
$expectedFileName = "FQGate-1.0.2-windows-x64-UNSIGNED.exe"
$expectedSize = 23065088
$expectedSha256 = "024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$evidencePath = Join-Path (Split-Path (Resolve-Path -LiteralPath $ConfigPath).Path -Parent) "fqgate-post-phase5-1-0-2-evidence.json"
$records = [System.Collections.Generic.List[object]]::new()

if ($root -ne $expectedRoot -or -not (Test-Path -LiteralPath (Join-Path $root ".git"))) {
    throw "P5Q-W1 FAIL PERMANENT_WINDOWS_CHECKOUT_REQUIRED"
}

function Add-Record {
    param(
        [string]$Id,
        [bool]$Pass,
        [hashtable]$Metadata = @{},
        [switch]$ContinueOnFailure
    )
    $record = [ordered]@{
        id = $Id
        result = $(if ($Pass) { "PASS" } else { "FAIL" })
    }
    foreach ($key in $Metadata.Keys) { $record[$key] = $Metadata[$key] }
    $record.timestamp = [DateTime]::UtcNow.ToString("o")
    $records.Add([pscustomobject]$record)
    Write-Host ($record | ConvertTo-Json -Compress)
    if (-not $Pass -and -not $ContinueOnFailure) { throw "${Id} FAIL" }
}

function Resolve-Node {
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $node) { return $node.Source }
    $candidate = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    throw "P5Q-W2 FAIL NODE_REQUIRED"
}

function Resolve-PowerShell {
    foreach ($name in @("pwsh.exe", "powershell.exe")) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command) { return $command.Source }
    }
    throw "P5Q-W3 FAIL POWERSHELL_REQUIRED"
}

function Resolve-Git {
    $command = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles "Git\cmd\git.exe" }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} "Git\cmd\git.exe" }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

function Resolve-Corepack {
    $command = Get-Command corepack.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { return $command.Source }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles "nodejs\corepack.cmd" }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} "nodejs\corepack.cmd" }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

function ConvertTo-ProcessArgument {
    param([string]$Value)

    if ($null -eq $Value) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-BoundedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [string[]]$Arguments = @(),
        [string]$RawArguments,
        [string]$WorkingDirectory = $root
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FileName
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($PSBoundParameters.ContainsKey("RawArguments")) {
        $startInfo.Arguments = $RawArguments
    } else {
        $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " "
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "PROCESS_START_FAILED" }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($stdout.Length -gt 64KB) { $stdout = $stdout.Substring(0, 64KB) }
        if ($stderr.Length -gt 16KB) { $stderr = $stderr.Substring(0, 16KB) }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
    } finally {
        $process.Dispose()
    }
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $root
    )

    if ($Path -match '(?i)\.(cmd|bat)$') {
        $commandShell = $env:ComSpec
        if ([string]::IsNullOrWhiteSpace($commandShell)) {
            $commandShell = Join-Path $env:SystemRoot "System32\cmd.exe"
        }
        $commandLine = ConvertTo-ProcessArgument $Path
        if ($Arguments.Count -gt 0) {
            $commandLine += " " + (($Arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join " ")
        }
        return Invoke-BoundedProcess -FileName $commandShell -RawArguments ('/d /s /c "' + $commandLine + '"') -WorkingDirectory $WorkingDirectory
    }
    return Invoke-BoundedProcess -FileName $Path -Arguments $Arguments -WorkingDirectory $WorkingDirectory
}

function Invoke-NodeCli {
    param([string[]]$Arguments)
    $escaped = @($root + "\dist\cli\main.js") + $Arguments + @("--config", (Resolve-Path -LiteralPath $ConfigPath).Path)
    return Invoke-BoundedProcess -FileName $script:nodePath -Arguments $escaped -WorkingDirectory $root
}

function Read-JsonOutput {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 64KB) { return $null }
    try { return $Text.Trim() | ConvertFrom-Json } catch {
        foreach ($line in ($Text -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 8)) {
            try { return $line.Trim() | ConvertFrom-Json } catch { }
        }
        return $null
    }
}

function Invoke-PhaseScript {
    param(
        [string]$ScriptName,
        [string[]]$Arguments
    )
    $scriptPath = Join-Path $root ("scripts\windows\" + $ScriptName)
    if ($ScriptName -match '(?i)\.mjs$') {
        $child = Invoke-BoundedProcess -FileName $script:nodePath -Arguments (@($scriptPath) + $Arguments) -WorkingDirectory $root
    } else {
        $child = Invoke-BoundedProcess -FileName $script:powerShellPath -Arguments (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath) + $Arguments) -WorkingDirectory $root
    }
    $text = $child.Stdout
    if (-not [string]::IsNullOrWhiteSpace($child.Stderr)) { $text += "`r`n" + $child.Stderr }
    if ($text.Length -gt 64KB) { $text = $text.Substring(0, 64KB) }
    return [pscustomobject]@{ ExitCode = $child.ExitCode; Output = $text }
}

function Invoke-InteractivePhaseScript {
    param(
        [string]$ScriptName,
        [string[]]$Arguments
    )
    $scriptPath = Join-Path $root ("scripts\windows\" + $ScriptName)
    $output = & $script:powerShellPath -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $lines = @($output | ForEach-Object { [string]$_ })
    if ($lines.Count -gt 0) {
        $text = $lines -join "`r`n"
        if ($text.Length -gt 64KB) { throw "P5Q-REMOTE_OUTPUT_TOO_LARGE" }
        foreach ($line in $lines) { Write-Host $line }
    }
    return $exitCode
}

function Get-JsonRecords {
    param([string]$Text)
    $parsed = [System.Collections.Generic.List[object]]::new()
    foreach ($line in ($Text -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $value = $line | ConvertFrom-Json
            if ($null -ne $value.id -and $null -ne $value.result) {
                $parsed.Add([pscustomobject]@{
                    id = [string]$value.id
                    result = [string]$value.result
                    error = if ($null -eq $value.error) { $null } else { [string]$value.error }
                    version = if ($null -eq $value.version) { $null } else { [string]$value.version }
                    fingerprint = if ($null -eq $value.fingerprint) { $null } else { [string]$value.fingerprint }
                    bytes = if ($null -eq $value.bytes) { $null } else { [int64]$value.bytes }
                    count = if ($null -eq $value.count) { $null } else { [int]$value.count }
                    status = if ($null -eq $value.status) { $null } else { [int]$value.status }
                    total = if ($null -eq $value.total) { $null } else { [int]$value.total }
                    passed = if ($null -eq $value.passed) { $null } else { [int]$value.passed }
                    failed = if ($null -eq $value.failed) { $null } else { [int]$value.failed }
                })
            }
        } catch {
            # Child acceptance output is intentionally not copied into evidence.
        }
    }
    return @($parsed)
}

function Assert-LoopbackListener {
    param([string]$Id, [int]$Port)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $pass = $listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq "127.0.0.1"
    Add-Record $Id $pass @{ port = $Port; listenerCount = $listeners.Count; address = $(if ($pass) { "127.0.0.1" } else { "invalid" }) }
}

function Write-LoginBoundary {
    Write-Host "MANUAL_FQGATE_LOGIN_REQUIRED: open http://127.0.0.1:17282/login on the permanent Windows host, complete the physical QR scan/approval, then rerun the exact qualification command."
    Write-Host ("RERUN: .\scripts\windows\post-phase5-fqgate-1-0-2-qualification.ps1 -ConfigPath `"{0}`"{1}" -f $resolvedConfig, $(if ($RunAuthenticatedServiceTokenMatrix) { " -TunnelIngressConfigPath `"$TunnelIngressConfigPath`" -RunAuthenticatedServiceTokenMatrix" } else { "" }))
}

function Write-Evidence {
    $passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
    $failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
    $evidence = [ordered]@{
        schemaVersion = 1
        task = "post-phase-5-fqgate-1-0-2-qualification"
        generatedAt = [DateTime]::UtcNow.ToString("o")
        repository = $root
        expectedArtifact = [ordered]@{
            version = $expectedVersion
            fileName = $expectedFileName
            size = $expectedSize
            sha256 = $expectedSha256
        }
        records = @($records)
        summary = [ordered]@{ total = $records.Count; passed = $passed; failed = $failed }
    }
    $json = $evidence | ConvertTo-Json -Depth 8 -Compress
    if ($json.Length -gt 64KB) { throw "P5Q-EVIDENCE_TOO_LARGE" }
    Set-Content -LiteralPath $evidencePath -Value $json -Encoding UTF8
}

$script:nodePath = Resolve-Node
$script:powerShellPath = Resolve-PowerShell
$script:gitPath = Resolve-Git
$script:corepackPath = Resolve-Corepack
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path

try {
    if ([string]::IsNullOrWhiteSpace($script:gitPath)) { throw "P5Q-W4 FAIL GIT_REQUIRED" }
    if ([string]::IsNullOrWhiteSpace($script:corepackPath)) { throw "P5Q-W6 FAIL COREPACK_REQUIRED" }
    $gitStatus = Invoke-ExternalCommand -Path $script:gitPath -Arguments @("-C", $root, "status", "--porcelain") -WorkingDirectory $root
    $dirty = if ($gitStatus.ExitCode -eq 0) { @($gitStatus.Stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) } else { @("GIT_STATUS_FAILED") }
    Add-Record "P5Q-W4" ($dirty.Count -eq 0) @{ workingTree = $(if ($dirty.Count -eq 0) { "clean" } else { "dirty" }) }
    $branchResult = Invoke-ExternalCommand -Path $script:gitPath -Arguments @("-C", $root, "branch", "--show-current") -WorkingDirectory $root
    $branch = if ($branchResult.ExitCode -eq 0) { $branchResult.Stdout.Trim() } else { "" }
    Add-Record "P5Q-W5" ($branch -eq "main") @{ branch = if ([string]::IsNullOrWhiteSpace($branch)) { "unknown" } else { $branch } }
    $commitResult = Invoke-ExternalCommand -Path $script:gitPath -Arguments @("-C", $root, "rev-parse", "HEAD") -WorkingDirectory $root
    $commit = if ($commitResult.ExitCode -eq 0) { $commitResult.Stdout.Trim() } else { "" }
    $nodeVersionResult = Invoke-ExternalCommand -Path $script:nodePath -Arguments @("--version") -WorkingDirectory $root
    $nodeVersion = if ($nodeVersionResult.ExitCode -eq 0) { $nodeVersionResult.Stdout.Trim() } else { "" }
    $pnpmVersionResult = Invoke-ExternalCommand -Path $script:corepackPath -Arguments @("pnpm", "--version") -WorkingDirectory $root
    $pnpmVersion = if ($pnpmVersionResult.ExitCode -eq 0) { $pnpmVersionResult.Stdout.Trim() } else { "" }
    $toolchainPass =
        $commit -match '^[0-9a-f]{40}$' -and
        $nodeVersion -match '^v\d+\.\d+\.\d+$' -and
        $pnpmVersion -match '^\d+\.\d+\.\d+$'
    Add-Record "P5Q-W6" $toolchainPass @{ commit = $commit; node = $nodeVersion; pnpm = $pnpmVersion; powershell = $PSVersionTable.PSVersion.ToString() }

    $releaseResult = Invoke-NodeCli @("fqgate", "release", "--json")
    $release = Read-JsonOutput $releaseResult.Stdout
    $package = $release.package
    $manifestPass = $releaseResult.ExitCode -eq 0 -and
        $release.version -eq $expectedVersion -and
        $package.fileName -eq $expectedFileName -and
        [int64]$package.size -eq $expectedSize -and
        $package.sha256 -eq $expectedSha256
    Add-Record "P5Q-M1" $manifestPass @{ version = [string]$release.version; fileName = [string]$package.fileName; size = [int64]$package.size; sha256 = [string]$package.sha256 }

    $baselineResult = Invoke-NodeCli @("fqgate", "status", "--json")
    $baseline = Read-JsonOutput $baselineResult.Stdout
    $baselinePass = $baselineResult.ExitCode -eq 0 -and
        $baseline.lifecycle -eq "ready" -and
        $baseline.process.state -eq "running" -and
        $baseline.installed.version -eq "1.0.1" -and
        [int64]$baseline.installed.size -gt 0 -and
        $baseline.installed.sha256 -match '^[a-f0-9]{64}$' -and
        $baseline.health.available -eq $true -and
        $baseline.health.validPayload -eq $true
    Add-Record "P5Q-B1" $baselinePass @{ version = [string]$baseline.installed.version; sha256 = [string]$baseline.installed.sha256; size = [int64]$baseline.installed.size }
    Assert-LoopbackListener "P5Q-B2" 17281
    Assert-LoopbackListener "P5Q-B3" 17282

    $baselineCensus = Invoke-PhaseScript "phase5b-census.mjs" @($resolvedConfig)
    $baselineCensusRecords = Get-JsonRecords $baselineCensus.Output
    $baselineFailure = @($baselineCensusRecords | Where-Object { $_.result -eq "FAIL" } | Select-Object -First 1)
    if ($baselineCensus.ExitCode -ne 0 -and $baselineFailure.Count -gt 0 -and $baselineFailure[0].error -eq "LOGIN_REQUIRED") {
        Add-Record "P5Q-B4" $false @{ errorCode = "LOGIN_REQUIRED" } -ContinueOnFailure
        Write-LoginBoundary
        throw "P5Q-B4 FAIL baseline semantic census requires the existing QR login"
    }
    $baselineOpenApi = @($baselineCensusRecords | Where-Object { $_.id -eq "P5B-C2" } | Select-Object -First 1)
    $baselineContract = @($baselineCensusRecords | Where-Object { $_.id -eq "P5B-C5" } | Select-Object -First 1)
    $baselineLookup = @($baselineCensusRecords | Where-Object { $_.id -eq "P5B-C3" } | Select-Object -First 1)
    $baselineCensusPass =
        $baselineCensus.ExitCode -eq 0 -and
        $baselineOpenApi.Count -eq 1 -and
        $baselineOpenApi[0].bytes -gt 0 -and
        $baselineOpenApi[0].count -gt 0 -and
        $baselineOpenApi[0].fingerprint -match '^[a-f0-9]{64}$' -and
        $baselineContract.Count -eq 1 -and
        $baselineContract[0].result -eq "PASS" -and
        $baselineContract[0].fingerprint -match '^[a-f0-9]{64}$' -and
        $baselineLookup.Count -eq 1 -and
        $baselineLookup[0].result -eq "PASS" -and
        $baselineLookup[0].count -ge 1
    Add-Record "P5Q-B4" $baselineCensusPass @{ openapiBytes = if ($baselineOpenApi.Count -eq 1) { $baselineOpenApi[0].bytes } else { $null }; openapiOperations = if ($baselineOpenApi.Count -eq 1) { $baselineOpenApi[0].count } else { $null }; openapiFingerprint = if ($baselineOpenApi.Count -eq 1) { $baselineOpenApi[0].fingerprint } else { $null }; lookupContractFingerprint = if ($baselineContract.Count -eq 1) { $baselineContract[0].fingerprint } else { $null }; lookupCount = if ($baselineLookup.Count -eq 1) { $baselineLookup[0].count } else { $null } }
    if (-not $baselineCensusPass) { throw "P5Q-B4 FAIL baseline OpenAPI/lookup evidence did not pass" }

    $qualificationResult = Invoke-NodeCli @("fqgate", "qualify", "--json")
    $qualificationError = Read-JsonOutput $qualificationResult.Stderr
    if ($qualificationResult.ExitCode -ne 0) {
        $errorCode = [string]$qualificationError.error.code
        Add-Record "P5Q-Q1" $false @{ errorCode = if ([string]::IsNullOrWhiteSpace($errorCode)) { "QUALIFICATION_FAILED" } else { $errorCode } } -ContinueOnFailure
        if ($errorCode -eq "LOGIN_REQUIRED") {
            Write-LoginBoundary
        }
        $rollbackResult = Invoke-NodeCli @("fqgate", "status", "--json")
        $rollback = Read-JsonOutput $rollbackResult.Stdout
        Add-Record "P5Q-Q2" ($rollback.installed.version -eq "1.0.1" -and $rollback.lifecycle -eq "ready") @{ activeVersion = [string]$rollback.installed.version; errorCode = if ([string]::IsNullOrWhiteSpace($errorCode)) { "QUALIFICATION_FAILED" } else { $errorCode } }
        throw "P5Q-Q1 FAIL candidate qualification failed and rollback was checked"
    }
    Add-Record "P5Q-Q1" $true @{ qualification = "completed" }

    $activeResult = Invoke-NodeCli @("fqgate", "status", "--json")
    $active = Read-JsonOutput $activeResult.Stdout
    $activePass = $activeResult.ExitCode -eq 0 -and
        $active.lifecycle -eq "ready" -and
        $active.process.state -eq "running" -and
        $active.installed.version -eq $expectedVersion -and
        [int64]$active.installed.size -eq $expectedSize -and
        $active.installed.sha256 -eq $expectedSha256 -and
        $active.compatibility.supported -eq $true -and
        $active.compatibility.validated -eq $true -and
        $active.health.available -eq $true -and
        $active.health.validPayload -eq $true
    Add-Record "P5Q-Q3" $activePass @{ version = [string]$active.installed.version; size = [int64]$active.installed.size; sha256 = [string]$active.installed.sha256; lifecycle = [string]$active.lifecycle }
    Assert-LoopbackListener "P5Q-Q4" 17281
    Assert-LoopbackListener "P5Q-Q5" 17282

    $phase5b = Invoke-PhaseScript "phase5b-acceptance.ps1" @("-ConfigPath", $resolvedConfig, "-Census", "-VerifyLocal")
    $phase5bRecords = Get-JsonRecords $phase5b.Output
    Add-Record "P5Q-R1" ($phase5b.ExitCode -eq 0 -and @($phase5bRecords | Where-Object { $_.result -eq "FAIL" }).Count -eq 0) @{ child = "phase5b"; childTotal = @($phase5bRecords).Count; childFailed = @($phase5bRecords | Where-Object { $_.result -eq "FAIL" }).Count }

    $phase5c = Invoke-PhaseScript "phase5c-acceptance.ps1" @("-ConfigPath", $resolvedConfig, "-VerifyLocal")
    $phase5cRecords = Get-JsonRecords $phase5c.Output
    Add-Record "P5Q-R2" ($phase5c.ExitCode -eq 0 -and @($phase5cRecords | Where-Object { $_.result -eq "FAIL" }).Count -eq 0) @{ child = "phase5c"; childTotal = @($phase5cRecords).Count; childFailed = @($phase5cRecords | Where-Object { $_.result -eq "FAIL" }).Count }

    if ($RunAuthenticatedServiceTokenMatrix) {
        if ([string]::IsNullOrWhiteSpace($TunnelIngressConfigPath)) { throw "P5Q-R3 FAIL TUNNEL_INGRESS_EVIDENCE_REQUIRED" }
        $remoteExitCode = Invoke-InteractivePhaseScript "phase5c-acceptance.ps1" @("-ConfigPath", $resolvedConfig, "-RunAuthenticatedServiceTokenMatrix", "-TunnelIngressConfigPath", $TunnelIngressConfigPath)
        Add-Record "P5Q-R3" ($remoteExitCode -eq 0) @{ child = "phase5c-remote"; childExitCode = $remoteExitCode }
    } else {
        Write-Host "P5Q-R3 SKIP remote service-token matrix was not requested; run with -RunAuthenticatedServiceTokenMatrix for the hidden credential boundary."
    }
}
catch {
    if ($_.Exception.Message -notmatch "^P5Q-") { Write-Host "P5Q-UNEXPECTED FAIL bounded qualification harness failure" }
    throw
}
finally {
    Write-Evidence
}

$passed = @($records | Where-Object { $_.result -eq "PASS" }).Count
$failed = @($records | Where-Object { $_.result -eq "FAIL" }).Count
Write-Host (([ordered]@{ id = "P5Q-SUMMARY"; result = $(if ($failed -eq 0) { "PASS" } else { "FAIL" }); total = $records.Count; passed = $passed; failed = $failed } | ConvertTo-Json -Compress))
if ($failed -ne 0) { exit 1 }
