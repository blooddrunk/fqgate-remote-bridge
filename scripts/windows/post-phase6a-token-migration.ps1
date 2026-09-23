[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet("Inventory","Migrate","Verify","Rollback","Finalize")][string]$Action,
    [string]$ConfigPath = "D:\code\research\fqgate-acceptance-config.json",
    [string]$DesiredStatePath = "D:\code\research\fqgate-phase6a-desired.json",
    [string]$TunnelIngressConfigPath = "D:\code\research\fqgate-machine-tunnel-ingress-evidence.json"
)
$ErrorActionPreference = "Stop"
$currentPathExt = [string]$env:PATHEXT
if ($currentPathExt -notmatch '(?i)(^|;)\.EXE(;|$)' -or $currentPathExt -notmatch '(?i)(^|;)\.CMD(;|$)') {
    $env:PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;$currentPathExt"
}
$root = "D:\code\research\fqgate-remote-bridge"
$oldDirectory = "D:\code\research\fqgate-secrets"
$oldToken = Join-Path $oldDirectory "tunnel-token"
$newToken = "C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token"
$newDirectory = Split-Path $newToken -Parent
$serviceName = "FQGateRemoteBridgeCloudflared"
$evidencePath = "D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json"
if ((Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path -ne $root) { throw "P6V-W3 PERMANENT_WINDOWS_CHECKOUT_REQUIRED" }

function Record([string]$id, [string]$result, [hashtable]$metadata=@{}) {
    $r = [ordered]@{ id=$id; result=$result; timestamp=[DateTimeOffset]::UtcNow.ToString("o") }
    foreach ($key in $metadata.Keys) { $r[$key] = $metadata[$key] }
    $r | ConvertTo-Json -Compress | Write-Output
}
function Assert-Admin {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "P6V-W3 ELEVATION_REQUIRED" }
}
function Assert-PlainPath([string]$path, [bool]$directory, [bool]$allowMissing) {
    $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { if ($allowMissing) { return }; throw "P6V-W3 PATH_MISSING" }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.LinkType) { throw "P6V-W3 REPARSE_POINT_DENIED" }
    if ([bool]$item.PSIsContainer -ne $directory) { throw "P6V-W3 PATH_TYPE_INVALID" }
}
function Assert-Acl([string]$path) {
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw "P6V-W3 ACL_INHERITANCE" }
    $allow = @{}
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { continue }
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin @("S-1-5-18", "S-1-5-32-544")) { throw "P6V-W3 ACL_BROAD_PRINCIPAL" }
        $allow[$sid] = $true
    }
    if (-not $allow.ContainsKey("S-1-5-18") -or -not $allow.ContainsKey("S-1-5-32-544")) { throw "P6V-W3 ACL_SERVICE_MISSING" }
}
function Get-Consumers {
    $found = [System.Collections.Generic.List[string]]::new()
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if ($null -eq $service) { throw "P6V-W5 SERVICE_MISSING" }
    if ($service.PathName.Contains($oldDirectory)) { $found.Add("service") }
    $files = @(Get-ChildItem "D:\code\research" -File -ErrorAction Stop | Where-Object { $_.Extension -in @(".json", ".ps1", ".cmd", ".mjs") })
    $files += @(Get-ChildItem (Join-Path $root "scripts") -Recurse -File | Where-Object { $_.Extension -in @(".ps1", ".cmd", ".mjs", ".json") })
    foreach ($file in $files) {
        if ($file.FullName -eq $evidencePath -or $file.FullName -eq $PSCommandPath) { continue }
        if ($file.Length -gt 1MB) { throw "P6V-W5 INVENTORY_FILE_TOO_LARGE" }
        if (Select-String -LiteralPath $file.FullName -Pattern "fqgate-secrets" -SimpleMatch -Quiet) { $found.Add($file.FullName) }
    }
    return @($found)
}
function Get-Config {
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($config.cloudflared.serviceName -ne $serviceName) { throw "P6V-W3 SERVICE_IDENTITY_MISMATCH" }
    return $config
}
function Set-ConfigTokenPath([string]$path) {
    $config = Get-Config
    $config.cloudflared.tokenFile = $path
    $temporary = "$ConfigPath.p6v-tmp"
    try {
        [IO.File]::WriteAllText($temporary, ($config | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $ConfigPath -Force
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}
function Invoke-Service([string]$command) {
    & node.exe (Join-Path $root "dist\cli\main.js") cloudflared service $command --config $ConfigPath --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "P6V-W4 SERVICE_COMMAND_FAILED" }
}
function Restart-ServiceBounded {
    Invoke-Service "stop"
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
    do {
        $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
        if ($null -eq $service) { throw "P6V-W4 SERVICE_MISSING" }
        if ($service.State -eq "Stopped") { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if ($service.State -ne "Stopped") { throw "P6V-W4 SERVICE_STOP_TIMEOUT" }
    Invoke-Service "start"
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
    do {
        $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
        if ($service.State -eq "Running") { return }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "P6V-W4 SERVICE_START_TIMEOUT"
}
function Assert-Service([string]$path) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if ($null -eq $service -or $service.State -ne "Running" -or $service.StartName -ne "LocalSystem" -or -not $service.PathName.Contains($path)) { throw "P6V-W4 SERVICE_STATE_INVALID" }
    $statusLines = @(& node.exe (Join-Path $root "dist\cli\main.js") cloudflared status --config $ConfigPath)
    if ($LASTEXITCODE -ne 0 -or @($statusLines | Where-Object { $_ -eq "token-file: secure" }).Count -ne 1) { throw "P6V-W3 TOKEN_FILE_NOT_SECURE" }
}
function Assert-OldService {
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if ($null -eq $service -or $service.State -ne "Running" -or $service.StartName -ne "LocalSystem" -or
        -not $service.PathName.Contains("tunnel run --token-file") -or
        -not $service.PathName.Contains('"' + $oldToken + '"') -or
        $service.PathName -match 'eyJ[a-zA-Z0-9_-]{20,}') { throw "P6V-W3 OLD_SERVICE_SHAPE_INVALID" }
}
function Assert-Listeners {
    foreach ($port in @(17281,17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") { throw "P6V-W4 LOOPBACK_INVALID" }
    }
}
function Assert-SameTokenBytes([string]$source, [string]$destination) {
    $oldBytes = [IO.File]::ReadAllBytes($source)
    $newBytes = [IO.File]::ReadAllBytes($destination)
    try {
        if ($oldBytes.Length -eq 0 -or $oldBytes.Length -gt 16KB -or $oldBytes.Length -ne $newBytes.Length) { throw "P6V-W3 STAGED_TOKEN_MISMATCH" }
        for ($index=0; $index -lt $oldBytes.Length; $index++) {
            if ($oldBytes[$index] -ne $newBytes[$index]) { throw "P6V-W3 STAGED_TOKEN_MISMATCH" }
        }
    } finally {
        [Array]::Clear($oldBytes, 0, $oldBytes.Length)
        [Array]::Clear($newBytes, 0, $newBytes.Length)
    }
}
function Assert-RegressionEvidence {
    $commit = (& git.exe -C $root rev-parse HEAD).Trim()
    $phase6 = Get-Content -LiteralPath "D:\code\research\fqgate-phase6a-discovery-evidence.json" -Raw | ConvertFrom-Json
    $phase5 = Get-Content -LiteralPath "D:\code\research\fqgate-phase5c-remote-evidence.json" -Raw | ConvertFrom-Json
    $machineRecords = @($phase5.records -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
    if ($phase6.commit -ne $commit -or $phase5.commit -ne $commit -or
        $phase6.summary.total -ne 14 -or $phase6.summary.passed -ne 14 -or
        $machineRecords.Count -ne 21 -or @($machineRecords | Where-Object result -ne "PASS").Count -ne 0) {
        throw "P6V-W2 REGRESSION_EVIDENCE_INVALID"
    }
    return [pscustomobject]@{ commit=$commit; phase6aPassed=14; phase5cPassed=21 }
}

try {
    $consumers = @(Get-Consumers)
    Record "P6V-W5-INVENTORY" "PASS" @{ count=$consumers.Count; consumers=$consumers }
    if ($Action -eq "Inventory") { exit 0 }
    if ($Action -eq "Verify") {
        . (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
        foreach ($kind in @("CloudflareRead", "MachineClientId", "MachineClientSecret")) {
            $binding = Get-AcceptanceBinding $kind $DesiredStatePath $ConfigPath
            $value = Get-AcceptanceCredential $kind $binding
            $value = $null
        }
        if ((Get-Config).cloudflared.tokenFile -ne $newToken) { throw "P6V-W4 NEW_CONFIG_REQUIRED" }
        $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
        if ($null -eq $service -or $service.State -ne "Running" -or $service.StartName -ne "LocalSystem" -or -not $service.PathName.Contains($newToken)) { throw "P6V-W4 SERVICE_STATE_INVALID" }
        Assert-Listeners
        if (-not (Test-Path -LiteralPath $evidencePath)) { throw "P6V-W4 MIGRATION_EVIDENCE_MISSING" }
        $migrationEvidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
        $currentCommit = (& git.exe -C $root rev-parse HEAD).Trim()
        if ($migrationEvidence.commit -ne $currentCommit -or $migrationEvidence.rollback -ne "PASS" -or $migrationEvidence.remote.humanAdmin -ne "PASS") { throw "P6V-W4 MIGRATION_EVIDENCE_INVALID" }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase6a-acceptance.ps1") -DesiredStatePath $DesiredStatePath -ConfigPath $ConfigPath -TunnelIngressConfigPath $TunnelIngressConfigPath -CredentialSource Vault -RunQualityGates -RunPhase5CRemoteRegression
        if ($LASTEXITCODE -ne 0) { throw "P6V-W4 REMOTE_REGRESSION_FAILED" }
        $regression = Assert-RegressionEvidence
        if ($migrationEvidence.commit -ne $regression.commit) { throw "P6V-W4 COMMIT_MISMATCH" }
        $migrationEvidence.remote.phase6a = 14
        $migrationEvidence.remote.phase5c = 21
        $migrationEvidence.verification = "PASS"
        $migrationEvidence.checks += "P6V-W2:PASS"
        $migrationEvidence.checks += "P6V-W4:PASS"
        [IO.File]::WriteAllText($evidencePath, ($migrationEvidence | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
        Record "P6V-W4" "PASS" @{ rollback="PASS"; regression="human-admin-machine"; phase6aPassed=14; phase5cPassed=21 }
        exit 0
    }
    Assert-Admin
    if ($Action -eq "Rollback") {
        Set-ConfigTokenPath $oldToken
        Invoke-Service "install"
        Restart-ServiceBounded
        Assert-Service $oldToken
        Record "P6V-W4-ROLLBACK" "PASS" @{ oldPathRestored=$true }
        exit 0
    }
    if ($Action -eq "Migrate") {
        if ((Get-Config).cloudflared.tokenFile -ne $oldToken) { throw "P6V-W3 OLD_CONFIG_REQUIRED" }
        Assert-OldService
        Assert-PlainPath "C:\ProgramData" $true $false
        Assert-PlainPath "C:\ProgramData\FQGateRemoteBridge" $true $true
        Assert-PlainPath $newDirectory $true $true
        Assert-PlainPath $newToken $false $true
        if ((Test-Path -LiteralPath "C:\ProgramData\FQGateRemoteBridge") -and
            @(Get-ChildItem -LiteralPath "C:\ProgramData\FQGateRemoteBridge" -Force | Where-Object Name -ne "secrets").Count -ne 0) { throw "P6V-W3 UNEXPECTED_TARGET_CONTENT" }
        if ((Test-Path -LiteralPath $newDirectory) -and
            @(Get-ChildItem -LiteralPath $newDirectory -Force | Where-Object Name -ne "tunnel-token").Count -ne 0) { throw "P6V-W3 UNEXPECTED_TARGET_CONTENT" }
        Assert-PlainPath $oldDirectory $true $false
        Assert-PlainPath $oldToken $false $false
        New-Item -ItemType Directory -Path $newDirectory -Force | Out-Null
        foreach ($path in @("C:\ProgramData\FQGateRemoteBridge", $newDirectory)) {
            & icacls.exe $path /inheritance:r /grant:r 'NT AUTHORITY\SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "P6V-W3 ACL_SET_FAILED" }
            Assert-Acl $path
        }
        if (-not (Test-Path -LiteralPath $newToken)) {
            Copy-Item -LiteralPath $oldToken -Destination $newToken -ErrorAction Stop
            & icacls.exe $newToken /inheritance:r /grant:r 'NT AUTHORITY\SYSTEM:(R)' 'BUILTIN\Administrators:(F)' | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "P6V-W3 ACL_SET_FAILED" }
        }
        Assert-Acl $newToken
        Assert-SameTokenBytes $oldToken $newToken
        Record "P6V-W3" "PASS" @{ path=$newToken; serviceIdentity="LocalSystem"; acl="protected" }
        $changed = $false
        try {
            $changed = $true
            Set-ConfigTokenPath $newToken
            Invoke-Service "install"
            Restart-ServiceBounded
            Assert-Service $newToken
            # Exercise the actual rollback path, then switch back to the new file.
            Set-ConfigTokenPath $oldToken
            Invoke-Service "install"
            Restart-ServiceBounded
            Assert-Service $oldToken
            Record "P6V-W4-ROLLBACK" "PASS" @{ oldPathRestored=$true }
            Set-ConfigTokenPath $newToken
            Invoke-Service "install"
            Restart-ServiceBounded
            Assert-Service $newToken
            Assert-Listeners
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase45-acceptance.ps1") -ConfigPath $ConfigPath -RunAuthenticatedBrowserMatrix
            if ($LASTEXITCODE -ne 0) { throw "P6V-W4 HUMAN_ADMIN_REGRESSION_FAILED" }
            $commit = (& git.exe -C $root rev-parse HEAD).Trim()
            Record "P6V-W4-ADMIN" "PASS" @{ path=$newToken; rollback="PASS"; regression="human-admin"; machineVerification="PENDING" }
            $evidenceJson = [pscustomobject]@{ schemaVersion=1; task="post-phase6a-credential-custody"; commit=$commit; checks=@("P6V-W1:PASS","P6V-W3:PASS","P6V-W4-ROLLBACK:PASS","P6V-W4-ADMIN:PASS"); service=@{ name=$serviceName; identity="LocalSystem"; tokenFile=$newToken }; acl="protected"; rollback="PASS"; remote=@{ humanAdmin="PASS"; phase6a=0; phase5c=0 }; oldConsumerCount=@(Get-Consumers).Count; oldDirectoryRetired=$false } | ConvertTo-Json -Depth 8
            [IO.File]::WriteAllText($evidencePath, $evidenceJson, [Text.UTF8Encoding]::new($false))
            Record "P6V-W4-VERIFY-READY" "PASS" @{ account="ordinary-enrolled-user"; timeoutMinutes=15 }
            $deadline = [DateTimeOffset]::UtcNow.AddMinutes(15)
            $verified = $false
            do {
                Start-Sleep -Seconds 2
                try { $verificationEvidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json }
                catch { continue }
                if ($verificationEvidence.commit -ne $commit) { throw "P6V-W4 VERIFICATION_COMMIT_MISMATCH" }
                if ($verificationEvidence.verification -eq "FAIL") { throw "P6V-W4 REMOTE_REGRESSION_FAILED" }
                if ($verificationEvidence.verification -eq "PASS" -and $verificationEvidence.remote.phase6a -eq 14 -and $verificationEvidence.remote.phase5c -eq 21) {
                    $verified = $true
                    break
                }
            } while ([DateTimeOffset]::UtcNow -lt $deadline)
            if (-not $verified) { throw "P6V-W4 VERIFICATION_TIMEOUT" }
            $regression = Assert-RegressionEvidence
            Record "P6V-W4" "PASS" @{ path=$newToken; rollback="PASS"; regression="human-admin-machine"; phase6aPassed=$regression.phase6aPassed; phase5cPassed=$regression.phase5cPassed }
        } catch {
            if ($changed) {
                Set-ConfigTokenPath $oldToken
                Invoke-Service "install"
                Restart-ServiceBounded
                Assert-Service $oldToken
                Record "P6V-W4-ROLLBACK" "PASS" @{ oldPathRestored=$true; migrationFailed=$true }
            }
            throw
        }
    } else {
        if ((Get-Config).cloudflared.tokenFile -ne $newToken) { throw "P6V-W5 NEW_CONFIG_REQUIRED" }
        Assert-Service $newToken
        Assert-Listeners
        if (-not (Test-Path -LiteralPath $evidencePath)) { throw "P6V-W5 MIGRATION_EVIDENCE_MISSING" }
        $migrationEvidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
        $regression = Assert-RegressionEvidence
        if ($migrationEvidence.commit -ne $regression.commit -or $migrationEvidence.rollback -ne "PASS" -or $migrationEvidence.remote.humanAdmin -ne "PASS" -or $migrationEvidence.remote.phase6a -ne 14 -or $migrationEvidence.remote.phase5c -ne 21) { throw "P6V-W5 MIGRATION_EVIDENCE_INVALID" }
        if ($consumers.Count -ne 0) { throw "P6V-W5 OLD_CONSUMERS_REMAIN" }
        $oldApiToken = Join-Path $oldDirectory "cloudflare-api-token"
        foreach ($path in @($oldToken, $oldApiToken)) {
            Assert-PlainPath $path $false $false
            Remove-Item -LiteralPath $path -Force
        }
        if (@(Get-ChildItem -LiteralPath $oldDirectory -Force).Count -ne 0) { throw "P6V-W5 OLD_DIRECTORY_NOT_EMPTY" }
        Remove-Item -LiteralPath $oldDirectory
        Record "P6V-W5" "PASS" @{ oldConsumerCount=0; oldDirectoryRemoved=$true; cloudflareTokenRevoked=$false }
        $migrationEvidence.oldConsumerCount = 0
        $migrationEvidence.oldDirectoryRetired = $true
        $migrationEvidence.checks += "P6V-W5:PASS"
        [IO.File]::WriteAllText($evidencePath, ($migrationEvidence | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    }
} catch {
    if ($Action -eq "Verify" -and (Test-Path -LiteralPath $evidencePath)) {
        try {
            $failedEvidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
            if ($failedEvidence.verification -ne "PASS") {
                $failedEvidence | Add-Member -NotePropertyName verification -NotePropertyValue "FAIL" -Force
                [IO.File]::WriteAllText($evidencePath, ($failedEvidence | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
            }
        } catch { }
    }
    $code = if ($_.Exception.Message -match '^((P6V-[A-Z0-9-]+|VAULT_[A-Z_]+)( [A-Z_]+)?)$') { $_.Exception.Message } else { "P6V-W4 UNEXPECTED_FAILURE" }
    Record "P6V-ERROR" "FAIL" @{ code=$code }
    exit 1
}
