[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet("Inventory","Migrate","Finalize")][string]$Action,
    [string]$ConfigPath = "D:\code\research\fqgate-acceptance-config.json",
    [string]$DesiredStatePath = "D:\code\research\fqgate-phase6a-desired.json",
    [string]$TunnelIngressConfigPath = "D:\code\research\fqgate-machine-tunnel-ingress-evidence.json"
)
$ErrorActionPreference = "Stop"
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
    $env:FQGATE_REMOTE_BRIDGE_CONFIG = $ConfigPath
    try {
        & node.exe (Join-Path $root "dist\cli\main.js") cloudflared service $command --json | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "P6V-W4 SERVICE_COMMAND_FAILED" }
    } finally { Remove-Item Env:\FQGATE_REMOTE_BRIDGE_CONFIG -ErrorAction SilentlyContinue }
}
function Assert-Service([string]$path) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if ($null -eq $service -or $service.State -ne "Running" -or $service.StartName -ne "LocalSystem" -or -not $service.PathName.Contains($path)) { throw "P6V-W4 SERVICE_STATE_INVALID" }
    $env:FQGATE_REMOTE_BRIDGE_CONFIG = $ConfigPath
    try {
        $status = & node.exe (Join-Path $root "dist\cli\main.js") cloudflared status --json | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $status.tokenFile.state -ne "secure") { throw "P6V-W3 TOKEN_FILE_NOT_SECURE" }
    } finally { Remove-Item Env:\FQGATE_REMOTE_BRIDGE_CONFIG -ErrorAction SilentlyContinue }
}
function Assert-Listeners {
    foreach ($port in @(17281,17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") { throw "P6V-W4 LOOPBACK_INVALID" }
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
    Assert-Admin
    if ($Action -eq "Migrate") {
        if ((Get-Config).cloudflared.tokenFile -ne $oldToken) { throw "P6V-W3 OLD_CONFIG_REQUIRED" }
        Assert-PlainPath "C:\ProgramData" $true $false
        Assert-PlainPath "C:\ProgramData\FQGateRemoteBridge" $true $true
        Assert-PlainPath $newDirectory $true $true
        if (Test-Path -LiteralPath $newToken) { throw "P6V-W3 NEW_PATH_ALREADY_EXISTS" }
        Assert-PlainPath $oldDirectory $true $false
        Assert-PlainPath $oldToken $false $false
        New-Item -ItemType Directory -Path $newDirectory -Force | Out-Null
        foreach ($path in @("C:\ProgramData\FQGateRemoteBridge", $newDirectory)) {
            & icacls.exe $path /inheritance:r /grant:r 'NT AUTHORITY\SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "P6V-W3 ACL_SET_FAILED" }
            Assert-Acl $path
        }
        Copy-Item -LiteralPath $oldToken -Destination $newToken -ErrorAction Stop
        & icacls.exe $newToken /inheritance:r /grant:r 'NT AUTHORITY\SYSTEM:(R)' 'BUILTIN\Administrators:(F)' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "P6V-W3 ACL_SET_FAILED" }
        Assert-Acl $newToken
        Record "P6V-W3" "PASS" @{ path=$newToken; serviceIdentity="LocalSystem"; acl="protected" }
        # Credential preflight occurs before the first service command.
        . (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
        foreach ($kind in @("CloudflareRead", "MachineClientId", "MachineClientSecret")) {
            $binding = Get-AcceptanceBinding $kind $DesiredStatePath $ConfigPath
            $value = Get-AcceptanceCredential $kind $binding
            $value = $null
        }
        $changed = $false
        try {
            $changed = $true
            Set-ConfigTokenPath $newToken
            Invoke-Service "install"
            Invoke-Service "restart"
            Assert-Service $newToken
            # Exercise the actual rollback path, then switch back to the new file.
            Set-ConfigTokenPath $oldToken
            Invoke-Service "install"
            Invoke-Service "restart"
            Assert-Service $oldToken
            Record "P6V-W4-ROLLBACK" "PASS" @{ oldPathRestored=$true }
            Set-ConfigTokenPath $newToken
            Invoke-Service "install"
            Invoke-Service "restart"
            Assert-Service $newToken
            Assert-Listeners
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase45-acceptance.ps1") -ConfigPath $ConfigPath -RunAuthenticatedBrowserMatrix
            if ($LASTEXITCODE -ne 0) { throw "P6V-W4 HUMAN_ADMIN_REGRESSION_FAILED" }
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase6a-acceptance.ps1") -DesiredStatePath $DesiredStatePath -ConfigPath $ConfigPath -TunnelIngressConfigPath $TunnelIngressConfigPath -CredentialSource Vault -RunQualityGates -RunPhase5CRemoteRegression
            if ($LASTEXITCODE -ne 0) { throw "P6V-W4 REMOTE_REGRESSION_FAILED" }
            $regression = Assert-RegressionEvidence
            Record "P6V-W4" "PASS" @{ path=$newToken; rollback="PASS"; regression="human-admin-machine"; phase6aPassed=$regression.phase6aPassed; phase5cPassed=$regression.phase5cPassed }
            $credentialStatus = @("CloudflareRead", "MachineClientId", "MachineClientSecret") | ForEach-Object { $s=Get-AcceptanceCredentialStatus $_; [pscustomobject]@{ kind=$_.ToString(); ownerMatch=$s.ownerMatch; expiry=$s.expiry; state=$s.state } }
            $evidenceJson = [pscustomobject]@{ schemaVersion=1; task="post-phase6a-credential-custody"; commit=$regression.commit; checks=@("P6V-W1:PASS","P6V-W2:PASS","P6V-W3:PASS","P6V-W4:PASS","P6V-W4-ROLLBACK:PASS"); credentials=$credentialStatus; service=@{ name=$serviceName; identity="LocalSystem"; tokenFile=$newToken }; acl="protected"; rollback="PASS"; remote=@{ humanAdmin="PASS"; phase6a=14; phase5c=21 }; oldConsumerCount=@(Get-Consumers).Count; oldDirectoryRetired=$false } | ConvertTo-Json -Depth 8
            [IO.File]::WriteAllText($evidencePath, $evidenceJson, [Text.UTF8Encoding]::new($false))
        } catch {
            if ($changed) {
                Set-ConfigTokenPath $oldToken
                Invoke-Service "install"
                Invoke-Service "restart"
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
        if ($migrationEvidence.commit -ne $regression.commit -or $migrationEvidence.rollback -ne "PASS" -or $migrationEvidence.remote.humanAdmin -ne "PASS") { throw "P6V-W5 MIGRATION_EVIDENCE_INVALID" }
        if ($consumers.Count -ne 0) { throw "P6V-W5 OLD_CONSUMERS_REMAIN" }
        . (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
        $cloudflareBinding = Get-AcceptanceBinding "CloudflareRead" $DesiredStatePath $ConfigPath
        $enrolledToken = Get-AcceptanceCredential "CloudflareRead" $cloudflareBinding
        $enrolledToken = $null
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
    $code = if ($_.Exception.Message -match '^((P6V-[A-Z0-9-]+|VAULT_[A-Z_]+)( [A-Z_]+)?)$') { $_.Exception.Message } else { "P6V-W4 UNEXPECTED_FAILURE" }
    Record "P6V-ERROR" "FAIL" @{ code=$code }
    exit 1
}
