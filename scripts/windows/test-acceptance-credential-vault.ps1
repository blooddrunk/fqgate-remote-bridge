$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
$script:items = @{}
$script:AcceptanceBackend = @{
    Read = { param($target, $includeSecret) if ($script:items.ContainsKey($target)) { $script:items[$target] } else { $null } }
    Write = { param($target, $secret, $comment, $ownerSid) $script:items[$target] = @($comment, $ownerSid, "2", "test-only-placeholder") }
    Delete = { param($target) $script:items.Remove($target) | Out-Null }
}
function Assert([bool]$Value, [string]$Code) { if (-not $Value) { throw $Code } }
$binding = "a" * 64
$expiry = [DateTimeOffset]::UtcNow.AddHours(1)
$dummy = ConvertTo-SecureString "test-only-placeholder" -AsPlainText -Force
try {
    Assert ((Get-AcceptanceCredentialStatus "CloudflareRead").state -eq "VAULT_MISSING") "P6V-T2-MISSING"
    Set-AcceptanceCredential "CloudflareRead" $dummy $expiry $binding
    Set-AcceptanceCredential "MachineClientId" $dummy $expiry $binding
    Assert ((Get-AcceptanceCredentialStatus "CloudflareRead").state -eq "READY") "P6V-T3-READY"
    Assert ((Get-AcceptanceCredential "CloudflareRead" $binding) -eq "test-only-placeholder") "P6V-T3-READ"
    $wrongBinding = $false
    try { Get-AcceptanceCredential "CloudflareRead" ("b" * 64) | Out-Null } catch { $wrongBinding = $_.Exception.Message -eq "VAULT_BINDING_MISMATCH" }
    Assert $wrongBinding "P6V-T2-BINDING"
    $cloudflareTarget = Get-AcceptanceTarget "CloudflareRead"
    $machineTarget = Get-AcceptanceTarget "MachineClientId"
    $saved = $script:items[$cloudflareTarget]
    $script:items[$cloudflareTarget] = @($saved[0], "S-1-5-0", "2", $saved[3])
    Assert ((Get-AcceptanceCredentialStatus "CloudflareRead").state -eq "VAULT_WRONG_USER") "P6V-T2-OWNER"
    $script:items[$cloudflareTarget] = $saved
    $metadata = $saved[0] | ConvertFrom-Json
    $metadata.expiry = [DateTimeOffset]::UtcNow.AddSeconds(-1).ToString("o")
    $script:items[$cloudflareTarget] = @(($metadata | ConvertTo-Json -Compress), $saved[1], "2", $saved[3])
    Assert ((Get-AcceptanceCredentialStatus "CloudflareRead").state -eq "VAULT_EXPIRED") "P6V-T3-EXPIRED"
    $script:items[$cloudflareTarget] = $saved
    $script:AcceptanceBackend.Write = { throw "VAULT_WRITE_FAILED" }
    $failed = $false
    try { Set-AcceptanceCredential "CloudflareRead" $dummy $expiry $binding } catch { $failed = $_.Exception.Message -eq "VAULT_WRITE_FAILED" }
    Assert $failed "P6V-T3-REPLACE"
    Assert ($script:items.ContainsKey($machineTarget)) "P6V-T3-UNRELATED"
    $oversize = ConvertTo-SecureString ("x" * 1281) -AsPlainText -Force
    try {
        $rejected = $false
        try { Set-AcceptanceCredential "MachineClientSecret" $oversize $expiry $binding } catch { $rejected = $_.Exception.Message -eq "VAULT_INPUT_TOO_LARGE" }
        Assert $rejected "P6V-T3-SIZE"
    } finally { $oversize.Dispose() }
    Assert ($script:AcceptanceTargets.Count -eq 3) "P6V-T1-NAMESPACE"
    Assert ((Get-AcceptanceErrorCode ([Exception]::new("wrapper", [Exception]::new("VAULT_INPUT_INVALID")))) -eq "VAULT_INPUT_INVALID") "P6V-T4-BOUNDED-CODE"
    Assert ((Get-AcceptanceErrorCode ([Exception]::new("wrapper", [Exception]::new("VAULT_WRITE_FAILED_WIN32_87")))) -eq "VAULT_WRITE_FAILED_WIN32_87") "P6V-T4-WIN32-CODE"
    Assert ((Get-AcceptanceErrorCode ([Exception]::new("unexpected content"))) -eq "VAULT_UNREADABLE") "P6V-T4-ERROR-REDACTION"
    Write-Output '{"id":"P6V-FAKE-STORE","result":"PASS"}'
} finally { $dummy.Dispose() }
