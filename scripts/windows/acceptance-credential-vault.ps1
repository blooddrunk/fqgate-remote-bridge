# Fixed, current-user Windows Credential Manager store for acceptance only.
# Dot-source this file; no credential value is written to a stream.
if ($null -eq ("FQGateAcceptanceCredential" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security;
using System.Text;

public static class FQGateAcceptanceCredential {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public UInt32 Flags, Type;
        public string TargetName, Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist, AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias, UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredWriteW")]
    private static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredReadW")]
    private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredDeleteW")]
    private static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr credential);
    public static int LastError { get { return Marshal.GetLastWin32Error(); } }
    public static void Write(string target, SecureString secret, string comment, string ownerSid) {
        IntPtr blob = IntPtr.Zero;
        try {
            if (secret.Length > 1280) throw new InvalidOperationException("VAULT_INPUT_TOO_LARGE");
            blob = Marshal.SecureStringToCoTaskMemUnicode(secret);
            for (int i = 0; i < secret.Length; i++) {
                char character = (char)Marshal.ReadInt16(blob, i * 2);
                if (char.IsControl(character) || ((i == 0 || i == secret.Length - 1) && char.IsWhiteSpace(character)))
                    throw new InvalidOperationException("VAULT_INPUT_INVALID");
            }
            var c = new CREDENTIAL { Type = 1, TargetName = target, Comment = comment,
                CredentialBlobSize = checked((UInt32)(secret.Length * 2)), CredentialBlob = blob,
                Persist = 2, UserName = ownerSid };
            if (!CredWrite(ref c, 0)) throw new InvalidOperationException("VAULT_WRITE_FAILED");
        } finally { if (blob != IntPtr.Zero) Marshal.ZeroFreeCoTaskMemUnicode(blob); }
    }
    public static string[] Read(string target, bool includeSecret) {
        IntPtr pointer;
        if (!CredRead(target, 1, 0, out pointer)) {
            if (LastError == 1168) return null;
            throw new InvalidOperationException("VAULT_UNREADABLE");
        }
        try {
            var c = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
            if (c.CredentialBlobSize > 2560 || (c.CredentialBlobSize % 2) != 0)
                throw new InvalidOperationException("VAULT_UNREADABLE");
            string value = includeSecret ? Marshal.PtrToStringUni(c.CredentialBlob, checked((int)c.CredentialBlobSize / 2)) : null;
            return new [] { c.Comment, c.UserName, c.Persist.ToString(), value };
        } finally { CredFree(pointer); }
    }
    public static void Delete(string target) {
        if (!CredDelete(target, 1, 0) && LastError != 1168)
            throw new InvalidOperationException("VAULT_REMOVE_FAILED");
    }
}
'@
}

$script:AcceptanceTargets = @{
    CloudflareRead = "FQGateRemoteBridge/acceptance/v1/cloudflare-read"
    MachineClientId = "FQGateRemoteBridge/acceptance/v1/machine-client-id"
    MachineClientSecret = "FQGateRemoteBridge/acceptance/v1/machine-client-secret"
}
$script:AcceptanceBackend = @{
    Read = { param($target, $includeSecret) [FQGateAcceptanceCredential]::Read($target, $includeSecret) }
    Write = { param($target, $secret, $comment, $ownerSid) [FQGateAcceptanceCredential]::Write($target, $secret, $comment, $ownerSid) }
    Delete = { param($target) [FQGateAcceptanceCredential]::Delete($target) }
}

function Assert-AcceptanceWindows {
    if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") { throw "VAULT_WINDOWS_ONLY" }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "VAULT_WINDOWS_ONLY" }
}

function Get-AcceptanceErrorCode([System.Exception]$ErrorValue) {
    $current = $ErrorValue
    for ($depth = 0; $depth -lt 5 -and $null -ne $current; $depth++) {
        if ($current.Message -match '^VAULT_[A-Z_]+$') { return $current.Message }
        $current = $current.InnerException
    }
    return "VAULT_UNREADABLE"
}

function Get-AcceptanceOwnerSid {
    Assert-AcceptanceWindows
    return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}

function Get-AcceptanceTarget([string]$Kind) {
    if (-not $script:AcceptanceTargets.ContainsKey($Kind)) { throw "VAULT_KIND_INVALID" }
    return $script:AcceptanceTargets[$Kind]
}

function Get-AcceptanceCredentialStatus([string]$Kind) {
    $target = Get-AcceptanceTarget $Kind
    $entry = & $script:AcceptanceBackend.Read $target $false
    if ($null -eq $entry) { return [pscustomobject]@{ kind=$Kind; present=$false; ownerMatch=$false; expiry=$null; state="VAULT_MISSING" } }
    $metadata = $null
    try { $metadata = $entry[0] | ConvertFrom-Json -ErrorAction Stop } catch { throw "VAULT_UNREADABLE" }
    $ownerMatch = $entry[1] -eq (Get-AcceptanceOwnerSid) -and $metadata.ownerSid -eq (Get-AcceptanceOwnerSid)
    $expiry = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$metadata.expiry, [ref]$expiry)) { throw "VAULT_UNREADABLE" }
    $state = if (-not $ownerMatch) { "VAULT_WRONG_USER" } elseif ($entry[2] -ne "2") { "VAULT_PERSISTENCE_INVALID" } elseif ($expiry -le [DateTimeOffset]::UtcNow) { "VAULT_EXPIRED" } else { "READY" }
    return [pscustomobject]@{ kind=$Kind; present=$true; ownerMatch=$ownerMatch; expiry=$expiry.ToString("o"); state=$state; binding=[string]$metadata.binding }
}

function Get-AcceptanceCredential([string]$Kind, [string]$ExpectedBinding) {
    $status = Get-AcceptanceCredentialStatus $Kind
    if ($status.state -ne "READY") { throw $status.state }
    if ($status.binding -ne $ExpectedBinding) { throw "VAULT_BINDING_MISMATCH" }
    $entry = & $script:AcceptanceBackend.Read (Get-AcceptanceTarget $Kind) $true
    if ($null -eq $entry -or [string]::IsNullOrWhiteSpace($entry[3])) { throw "VAULT_UNREADABLE" }
    return $entry[3]
}

function Set-AcceptanceCredential([string]$Kind, [Security.SecureString]$Secret, [DateTimeOffset]$Expiry, [string]$Binding) {
    $target = Get-AcceptanceTarget $Kind
    if ($null -eq $Secret -or $Secret.Length -lt 8) { throw "VAULT_INPUT_INVALID" }
    if ($Secret.Length -gt 1280) { throw "VAULT_INPUT_TOO_LARGE" }
    if ($Expiry -le [DateTimeOffset]::UtcNow -or $Expiry -gt [DateTimeOffset]::UtcNow.AddYears(2)) { throw "VAULT_EXPIRY_INVALID" }
    if ($Binding -notmatch '^[a-f0-9]{64}$') { throw "VAULT_BINDING_INVALID" }
    $ownerSid = Get-AcceptanceOwnerSid
    $comment = @{ kind=$Kind; ownerSid=$ownerSid; enrolled=[DateTimeOffset]::UtcNow.ToString("o"); expiry=$Expiry.ToString("o"); binding=$Binding } | ConvertTo-Json -Compress
    & $script:AcceptanceBackend.Write $target $Secret $comment $ownerSid
}

function Remove-AcceptanceCredential([string]$Kind) {
    & $script:AcceptanceBackend.Delete (Get-AcceptanceTarget $Kind)
}

function Get-AcceptanceBinding([string]$Kind, [string]$DesiredStatePath, [string]$ConfigPath) {
    if ($Kind -eq "CloudflareRead") {
        $desired = Get-Content -LiteralPath $DesiredStatePath -Raw | ConvertFrom-Json
        if ([string]$desired.account.id -notmatch '^[a-f0-9]{32}$' -or [string]$desired.zone.id -notmatch '^[a-f0-9]{32}$') { throw "VAULT_BINDING_INVALID" }
        $value = "cloudflare|$($desired.account.id)|$($desired.zone.id)"
    } else {
        $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
        if ([string]$config.remoteAccess.machineHostname -notmatch '^[a-z0-9.-]{1,253}$' -or [string]$config.remoteAccess.machineAccess.audience -notmatch '^[a-f0-9]{64}$') { throw "VAULT_BINDING_INVALID" }
        $value = "machine|$($config.remoteAccess.machineHostname)|$($config.remoteAccess.machineAccess.audience)"
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($value)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() }
    finally { [Array]::Clear($bytes, 0, $bytes.Length); $hash.Dispose() }
}
