$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "acceptance-credential-vault.ps1")
$ownerSid = Get-AcceptanceOwnerSid
$dummy = ConvertTo-SecureString "test-only-placeholder" -AsPlainText -Force
$targets = @("FQGateRemoteBridge/acceptance-test/v1/cloudflare-read", "FQGateRemoteBridge/acceptance-test/v1/machine-id", "FQGateRemoteBridge/acceptance-test/v1/machine-secret")
try {
    foreach ($target in $targets) {
        [FQGateAcceptanceCredential]::Write($target, $dummy, "disposable-test", $ownerSid)
        $read = [FQGateAcceptanceCredential]::Read($target, $false)
        if ($null -eq $read -or $read[1] -ne $ownerSid -or $read[2] -ne "2") { throw "P6V-W1 FAIL" }
    }
    Write-Output '{"id":"P6V-W1","result":"PASS","cleanup":"pending"}'
} finally {
    foreach ($target in $targets) { [FQGateAcceptanceCredential]::Delete($target) }
    $dummy.Dispose()
}
foreach ($target in $targets) { if ($null -ne [FQGateAcceptanceCredential]::Read($target, $false)) { throw "P6V-W1 CLEANUP_FAILED" } }
Write-Output '{"id":"P6V-W1-CLEANUP","result":"PASS"}'
