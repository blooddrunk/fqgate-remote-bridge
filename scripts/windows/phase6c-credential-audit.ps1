[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$DesiredStatePath,
    [Parameter(Mandatory=$true)][string]$ConfigPath,
    [ValidateSet("Pre","Post")][string]$Stage = "Pre"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$expectedRoot = "D:\code\research\fqgate-remote-bridge"
$evidencePath = "D:\code\research\fqgate-phase6c-audit-$($Stage.ToLowerInvariant()).json"
$writeNames = @("CLOUDFLARE_DNS_WRITE_TOKEN","CLOUDFLARE_B2_WRITE_TOKEN","CLOUDFLARE_B2_SCOPE_READ_TOKEN")
$allowedTargets = @("FQGateRemoteBridge/acceptance/v1/cloudflare-read","FQGateRemoteBridge/acceptance/v1/machine-client-id","FQGateRemoteBridge/acceptance/v1/machine-client-secret")
$snapshot = [ordered]@{
    checkout = @{ path=$root; clean=$false; commit="" }
    environment = @{ processWriteCleared=$false; persistentWriteAbsent=$false }
    vault = @{ allowedTargetNames=@(); unexpectedProjectTargets=-1 }
    service = @{ running=$false; protectedTokenFile=$false; noInlineToken=$false; noProvisioningCredential=$false }
    legacy = @{ directoryAbsent=$false; consumerCount=-1 }
    runtime = @{ fqgate=$false; bridge=$false; listenersExact=$false }
    readTransport = @{ getOnly=$false; mutationMethodCount=-1 }
    plan = @{ fingerprint=""; readOnly=$false; mutationMethodCount=-1; checks=@() }
    files = @{ externalInputs=$false; secretFree=$false; normalStartupNoWriteDependency=$false; noPersistentCredentialPath=$false }
}

function Test-Http([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Test-IsolatedBridgeStartup([string]$Config) {
    $port = 17284
    if (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -ne 0) { return $false }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start.Arguments = '"' + (Join-Path $root 'scripts\start-bridge.mjs') + '"'
    $start.WorkingDirectory = $root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['FQGATE_REMOTE_BRIDGE_CONFIG'] = $Config
    $start.EnvironmentVariables['BRIDGE_PORT'] = [string]$port
    foreach ($key in $writeNames) { $start.EnvironmentVariables.Remove($key) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { return $false }
        for ($attempt=0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            if (Test-Http "http://127.0.0.1:$port/api/v1/version") {
                $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
                return $listeners.Count -eq 1 -and $listeners[0].LocalAddress -eq '127.0.0.1' -and $listeners[0].OwningProcess -eq $process.Id
            }
            if ($process.HasExited) { return $false }
        }
        return $false
    } finally {
        if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit(10000) | Out-Null }
        $process.Dispose()
    }
}

function Invoke-Plan([string]$Token, [string]$Desired) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start.Arguments = '"' + (Join-Path $root 'dist\cli\main.js') + '" cloudflare plan --desired-state "' + $Desired + '" --json'
    $start.WorkingDirectory = $root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($key in $writeNames) { $start.EnvironmentVariables.Remove($key) }
    $start.EnvironmentVariables['CLOUDFLARE_API_TOKEN'] = $Token
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'P6C_PLAN_START_FAILED' }
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'P6C_PLAN_TIMEOUT' }
        $out = $outTask.GetAwaiter().GetResult()
        $err = $errTask.GetAwaiter().GetResult()
        if ($out.Length -gt 65536 -or $err.Length -gt 65536 -or $process.ExitCode -ne 0) { throw 'P6C_PLAN_FAILED' }
        return ($out | ConvertFrom-Json -ErrorAction Stop)
    } finally {
        $start.EnvironmentVariables.Remove('CLOUDFLARE_API_TOKEN')
        $process.Dispose()
    }
}

try {
    if ($root -ne $expectedRoot -or -not (Test-Path -LiteralPath (Join-Path $root '.git'))) { throw 'P6C_PERMANENT_CHECKOUT_REQUIRED' }
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'safe.directory'
    $env:GIT_CONFIG_VALUE_0 = 'D:/code/research/fqgate-remote-bridge'
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $snapshot.checkout.commit = (& $git -C $root rev-parse HEAD).Trim()
    $snapshot.checkout.clean = @(& $git -C $root status --porcelain | Where-Object { $_ }).Count -eq 0
    $desired = (Resolve-Path -LiteralPath $DesiredStatePath).Path
    $config = (Resolve-Path -LiteralPath $ConfigPath).Path
    $snapshot.files.externalInputs = @($desired,$config | Where-Object { $_.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) }).Count -eq 0
    $configText = Get-Content -LiteralPath $config -Raw
    $desiredText = Get-Content -LiteralPath $desired -Raw
    $snapshot.files.secretFree = $configText.Length -le 65536 -and $desiredText.Length -le 65536 -and
        ($configText + $desiredText) -notmatch '(?i)("(?:apiToken|clientSecret|tunnelToken|jwt|cookie)"\s*:|cfast_|eyJ[A-Za-z0-9_-]{20,})'
    $configValue = $configText | ConvertFrom-Json -ErrorAction Stop
    $snapshot.files.noPersistentCredentialPath = $configValue.cloudflared.tokenFile -eq 'C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token' -and
        ($configText + $desiredText) -notmatch '(?i)(fqgate-secrets|CLOUDFLARE_DNS_WRITE_TOKEN|CLOUDFLARE_B2_WRITE_TOKEN|CLOUDFLARE_B2_SCOPE_READ_TOKEN)'
    $snapshot.files.noPersistentCredentialPath = $snapshot.files.noPersistentCredentialPath -and
        @(Get-ChildItem -LiteralPath $root -Force -File -Filter '.env*' -ErrorAction Stop).Count -eq 0
    $sourceFiles = @(& $git -C $root ls-files -- src scripts config)
    foreach ($relative in $sourceFiles) {
        $sourcePath = Join-Path $root $relative
        if ((Get-Item -LiteralPath $sourcePath).Length -gt 1MB -or
            (Select-String -LiteralPath $sourcePath -Pattern 'cfast_[A-Za-z0-9]{48}|eyJ[A-Za-z0-9_-]{80,}' -Quiet)) {
            $snapshot.files.secretFree = $false
        }
    }
    $startupFiles = @('scripts\start-bridge.mjs','scripts\windows\start-dashboard.ps1','scripts\windows\start-phase4.ps1','scripts\windows\acceptance.ps1','scripts\windows\phase45-acceptance.ps1','scripts\windows\phase5a-acceptance.ps1','scripts\windows\phase5b-acceptance.ps1','scripts\windows\phase5c-acceptance.ps1','scripts\windows\phase6a-acceptance.ps1')
    $snapshot.files.normalStartupNoWriteDependency = $true
    foreach ($name in $startupFiles) {
        $path = Join-Path $root $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Content -LiteralPath $path -Raw) -match '(?i)CLOUDFLARE_(DNS_WRITE|B2_WRITE|B2_SCOPE_READ)_TOKEN|Read-Host.*(?:DNS|B2).*write') {
            $snapshot.files.normalStartupNoWriteDependency = $false
        }
    }

    $persistentNames = @([Environment]::GetEnvironmentVariables('User').Keys) + @([Environment]::GetEnvironmentVariables('Machine').Keys)
    $snapshot.environment.persistentWriteAbsent = @($persistentNames | Where-Object { $_ -in $writeNames -or $_ -match '(?i)^CLOUDFLARE_.*(?:WRITE|SCOPE_READ).*TOKEN$' }).Count -eq 0
    foreach ($key in $writeNames) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
    $snapshot.environment.processWriteCleared = @($writeNames | Where-Object { [Environment]::GetEnvironmentVariable($_,'Process') }).Count -eq 0

    # CredEnumerate returns metadata. The blob pointer is never dereferenced.
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FQGatePhase6CVaultNames {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Credential { public uint Flags, Type; public string TargetName, Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint BlobSize; public IntPtr Blob; public uint Persist, AttributeCount; public IntPtr Attributes; public string TargetAlias, UserName; }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="CredEnumerateW")]
  static extern bool Enumerate(string filter, uint flags, out uint count, out IntPtr credentials);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr pointer);
  public static string[] Names() {
    uint count; IntPtr array;
    if (!Enumerate(null, 0, out count, out array)) {
      if (Marshal.GetLastWin32Error() == 1168) return new string[0];
      throw new InvalidOperationException("P6C_VAULT_ENUMERATE_FAILED");
    }
    try {
      if (count > 4096) throw new InvalidOperationException("P6C_VAULT_COUNT_UNBOUNDED");
      string[] names = new string[checked((int)count)];
      for (int i=0; i<count; i++) {
        IntPtr item = Marshal.ReadIntPtr(array, i * IntPtr.Size);
        names[i] = ((Credential)Marshal.PtrToStructure(item, typeof(Credential))).TargetName;
      }
      return names;
    } finally { CredFree(array); }
  }
}
'@
    $vaultNames = @([FQGatePhase6CVaultNames]::Names())
    $snapshot.vault.allowedTargetNames = @($allowedTargets | Where-Object { $_ -in $vaultNames })
    $snapshot.vault.unexpectedProjectTargets = @($vaultNames | Where-Object { $_ -match '(?i)FQGateRemoteBridge|cloudflare.*(?:write|provision)|phase6b[12]' -and $_ -notin $allowedTargets }).Count

    $service = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $configValue.cloudflared.serviceName) -ErrorAction Stop
    $command = [string]$service.PathName
    $tokenPath = [string]$configValue.cloudflared.tokenFile
    $snapshot.service.running = $null -ne $service -and $service.State -eq 'Running' -and $service.StartName -eq 'LocalSystem'
    $snapshot.service.noInlineToken = $command -match '--token-file' -and $command -notmatch '(?i)(?:--token\s|eyJ[A-Za-z0-9_-]{20,}|cfast_|CLOUDFLARE_(?:DNS_WRITE|B2_WRITE|B2_SCOPE_READ)_TOKEN)'
    $snapshot.service.noProvisioningCredential = $command -notmatch '(?i)(?:DNS_WRITE|B2_WRITE|B2_SCOPE_READ|api[_-]?token|fqgate-secrets)'
    $custodyPath = 'D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json'
    $custody = Get-Content -LiteralPath $custodyPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $historicallyProtected = $custody.verification -eq 'PASS' -and $custody.acl -eq 'protected' -and
        $custody.service.tokenFile -eq $tokenPath -and $custody.service.identity -eq 'LocalSystem' -and
        $custody.oldDirectoryRetired -eq $true -and 'P6V-W3:PASS' -in @($custody.checks)
    $snapshot.service.protectedTokenFile = $historicallyProtected -and $tokenPath -eq 'C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token' -and $command.Contains($tokenPath)
    # The standard operator cannot traverse the protected secrets directory.
    # If elevated, also recheck the live ACL without reading token bytes.
    try {
        $tokenItem = Get-Item -LiteralPath $tokenPath -Force -ErrorAction Stop
        $acl = Get-Acl -LiteralPath $tokenPath -ErrorAction Stop
        $sids = @($acl.Access | Where-Object AccessControlType -eq 'Allow' | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
        $snapshot.service.protectedTokenFile = $snapshot.service.protectedTokenFile -and
            -not $tokenItem.PSIsContainer -and ($tokenItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and
            $acl.AreAccessRulesProtected -and $sids.Count -gt 0 -and
            @($sids | Where-Object { $_ -notin @('S-1-5-18','S-1-5-32-544') }).Count -eq 0
    } catch [System.UnauthorizedAccessException] { }
    $snapshot.legacy.directoryAbsent = -not (Test-Path -LiteralPath 'D:\code\research\fqgate-secrets')
    $consumerFiles = @($config,$desired) + @($startupFiles | ForEach-Object { Join-Path $root $_ })
    $snapshot.legacy.consumerCount = @($consumerFiles | Where-Object { (Get-Item -LiteralPath $_).Length -gt 1MB -or (Select-String -LiteralPath $_ -Pattern 'fqgate-secrets' -SimpleMatch -Quiet) }).Count + [int]$command.Contains('fqgate-secrets')

    $snapshot.runtime.fqgate = Test-Http 'http://127.0.0.1:17281/v1/market/health'
    $snapshot.runtime.bridge = (Test-Http 'http://127.0.0.1:17282/api/v1/updates/status') -and
        (Test-IsolatedBridgeStartup $config)
    $snapshot.runtime.listenersExact = $true
    foreach ($port in @(17281,17282)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { $snapshot.runtime.listenersExact = $false }
    }
    $readSource = Get-Content -LiteralPath (Join-Path $root 'src\cloudflare\transport.ts') -Raw
    $snapshot.readTransport.getOnly = $readSource -match 'method:\s*["'']GET["'']' -and $readSource -notmatch 'method:\s*["''](?:POST|PUT|PATCH|DELETE)["'']'
    $snapshot.readTransport.mutationMethodCount = if ($snapshot.readTransport.getOnly) { 0 } else { 1 }
    . (Join-Path $PSScriptRoot 'acceptance-credential-vault.ps1')
    $binding = Get-AcceptanceBinding 'CloudflareRead' $desired $config
    $readToken = Get-AcceptanceCredential 'CloudflareRead' $binding
    try { $plan = Invoke-Plan $readToken $desired } finally { $readToken = $null }
    $snapshot.plan.fingerprint = [string]$plan.fingerprint
    $snapshot.plan.readOnly = $plan.readOnly -eq $true
    $snapshot.plan.mutationMethodCount = @($plan.mutationMethods).Count
    $snapshot.plan.checks = @($plan.checks | ForEach-Object { [string]$_.classification })
} catch {
    $code = [string]$_.Exception.Message
    if ($code -notmatch '^P6C_[A-Z0-9_]{1,80}$' -and $code -notmatch '^VAULT_[A-Z0-9_]{1,80}$') { $code = 'P6C_AUDIT_COLLECTION_FAILED' }
    Write-Host ("P6C-AUDIT-COLLECTION FAIL code={0} line={1} type={2}" -f $code,$_.InvocationInfo.ScriptLineNumber,$_.Exception.GetType().Name)
} finally {
    foreach ($key in @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
}
$node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$json = $snapshot | ConvertTo-Json -Depth 8 -Compress
$evidenceText = $json | & $node (Join-Path $PSScriptRoot 'phase6c-audit-policy.mjs')
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($evidenceText)) { throw 'P6C_AUDIT_POLICY_FAILED' }
$evidence = $evidenceText | ConvertFrom-Json -ErrorAction Stop
[IO.File]::WriteAllText($evidencePath,$evidenceText,[Text.UTF8Encoding]::new($false))
Write-Host ("P6C-AUDIT-{0} {1} passed={2} failed={3} fingerprint={4} evidence={5}" -f $Stage,$(if ($evidence.summary.failed -eq 0) { 'PASS' } else { 'FAIL' }),$evidence.summary.passed,$evidence.summary.failed,$evidence.planFingerprint,$evidencePath)
if ($evidence.summary.failed -ne 0) { exit 1 }
