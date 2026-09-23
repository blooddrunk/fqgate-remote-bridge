[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet("Enroll","Status","Remove")][string]$Action,
    [Parameter(Mandatory=$true)][ValidateSet("CloudflareRead","MachineClientId","MachineClientSecret")][string]$Kind,
    [string]$ExpiresAt,
    [string]$DesiredStatePath = "D:\code\research\fqgate-phase6a-desired.json",
    [string]$ConfigPath = "D:\code\research\fqgate-acceptance-config.json"
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
try {
    Assert-AcceptanceWindows
    if ($Action -eq "Enroll") {
        $expiry = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse($ExpiresAt, [ref]$expiry)) { throw "VAULT_EXPIRY_INVALID" }
        $binding = Get-AcceptanceBinding $Kind $DesiredStatePath $ConfigPath
        $secret = Read-Host "Enter $Kind (hidden)" -AsSecureString
        try { Set-AcceptanceCredential $Kind $secret $expiry $binding }
        finally { if ($null -ne $secret) { $secret.Dispose() } }
    } elseif ($Action -eq "Remove") {
        Remove-AcceptanceCredential $Kind
    }
    $status = Get-AcceptanceCredentialStatus $Kind
    [pscustomobject]@{ action=$Action; kind=$Kind; present=$status.present; ownerMatch=$status.ownerMatch; expiry=$status.expiry; state=$status.state } | ConvertTo-Json -Compress
} catch {
    $code = Get-AcceptanceErrorCode $_.Exception
    [Console]::Error.WriteLine($code)
    exit 1
}
