# Interactive local enrollment companion. It has no credential arguments.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
$desiredPath = "D:\code\research\fqgate-phase6a-desired.json"
$configPath = "D:\code\research\fqgate-acceptance-config.json"

Write-Host "FQGate acceptance credential enrollment for the current Windows user."
Write-Host "Enter a local UTC cutoff within two years and no later than the remote credential expiry."
Write-Host "Credential values are never shown or written to this window."
try {
    foreach ($kind in @("CloudflareRead", "MachineClientId", "MachineClientSecret")) {
        $expiresAt = Read-Host "Local UTC cutoff for $kind (YYYY-MM-DDTHH:MM:SSZ)"
        $expiry = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse($expiresAt, [ref]$expiry)) { throw "VAULT_EXPIRY_INVALID" }
        if ($expiry -le [DateTimeOffset]::UtcNow -or $expiry -gt [DateTimeOffset]::UtcNow.AddYears(2)) { throw "VAULT_EXPIRY_INVALID" }
        $binding = Get-AcceptanceBinding $kind $desiredPath $configPath
        $secret = Read-Host "Enter $kind (hidden)" -AsSecureString
        try { Set-AcceptanceCredential $kind $secret $expiry $binding }
        finally { if ($null -ne $secret) { $secret.Dispose() } }
        $status = Get-AcceptanceCredentialStatus $kind
        [pscustomobject]@{ kind=$kind; state=$status.state; ownerMatch=$status.ownerMatch; expiry=$status.expiry } | ConvertTo-Json -Compress | Write-Host
        if ($status.state -ne "READY") { throw $status.state }
    }
    Write-Host "ENROLLMENT_READY: all three targets are present for this Windows user."
} catch {
    $code = if ($_.Exception.Message -match '^VAULT_[A-Z_]+$') { $_.Exception.Message } else { "VAULT_UNREADABLE" }
    Write-Host "ENROLLMENT_FAILED: $code"
} finally {
    Read-Host "Press Enter to close this window" | Out-Null
}
