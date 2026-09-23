# Permanent Windows acceptance credential custody

The three acceptance credentials belong to the invoking Windows user's
Credential Manager, under three fixed `FQGateRemoteBridge/acceptance/v1/` names.
The Tunnel token remains a LocalSystem service file. This workflow does not
change Cloudflare resources or revoke credentials.

Run these commands in the existing
`D:\code\research\fqgate-remote-bridge` checkout. Never paste a credential into
chat, a command, a file, or an argument.

## Enroll once or after expiry

Use an ordinary interactive PowerShell window as the account that runs
acceptance. Set each local cutoff in UTC to no later than the remote credential
expiry and within two years. Local storage does not extend remote validity.
Each command prompts through `Read-Host -AsSecureString`.
For a single guided window, run
`.\scripts\windows\enroll-acceptance-credentials.ps1`; it prompts for all
three expiries and then the three hidden values. It prints only metadata and
keeps the window open until Enter is pressed.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
.\scripts\windows\acceptance-credentials.ps1 -Action Enroll -Kind CloudflareRead -ExpiresAt '<UTC expiry>'
.\scripts\windows\acceptance-credentials.ps1 -Action Enroll -Kind MachineClientId -ExpiresAt '<UTC expiry>'
.\scripts\windows\acceptance-credentials.ps1 -Action Enroll -Kind MachineClientSecret -ExpiresAt '<UTC expiry>'
```

A successful command emits JSON with `state:"READY"`, `present:true`, and
`ownerMatch:true`. For metadata only, run `-Action Status -Kind <kind>`. To
remove one local entry, run `-Action Remove -Kind <kind>`; removal does not
revoke a Cloudflare token. `VAULT_MISSING`, `VAULT_EXPIRED`,
`VAULT_WRONG_USER`, `VAULT_BINDING_MISMATCH`, and `VAULT_UNREADABLE` require
correction or hidden re-enrollment. Vault mode never falls back to a prompt.
`VAULT_INPUT_TOO_LARGE` means the entered value exceeds Windows Credential
Manager's bounded generic credential blob; check that the input is the single
intended credential field, not a JSON export, JWT or Tunnel token.
`VAULT_INPUT_FORMAT_INVALID` for `MachineClientSecret` means the hidden value
does not match either a current `cfast_` service-token Client Secret (40
alphanumeric characters plus eight checksum characters after the prefix) or
the legacy 64-character hexadecimal form. Check for pasted whitespace or a
different field and retry in a fresh PowerShell process. The command reports
only the bounded error code; do not paste the value into chat or a log.

The binding compares the configured account/zone or machine hostname/AUD to
the values recorded at enrollment. If those non-secret targets change, enroll
again. A still-active token exposed by the old broad-ACL file should be
rotated separately by its Cloudflare owner; deleting the local file does not
revoke it.

## Acceptance

```powershell
.\scripts\windows\phase6a-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json `
  -CredentialSource Vault -RunQualityGates -RunPhase5CRemoteRegression
```

Use `-CredentialSource Prompt` for the original hidden-input flow. The Phase
5-C and Phase 5-A authenticated entry points accept the same selector.
Linux/WSL processes cannot read this user vault directly; use the Windows
PowerShell entry point.

## Tunnel token migration

Inventory first, without reading token contents:

```powershell
.\scripts\windows\post-phase6a-token-migration.ps1 -Action Inventory
```

Migration needs elevation because it changes a LocalSystem service and a
protected ProgramData path. The script detects a non-elevated account and
returns `P6V-W3 ELEVATION_REQUIRED` before mutation. In an elevated PowerShell
window, run:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
.\scripts\windows\post-phase6a-token-migration.ps1 -Action Migrate
```

That command checks path types and reparse points, stages the existing bytes
under `C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token`, protects and
verifies its ACL, reconfigures only the local cloudflared service token-file
argument through the Bridge service controller, exercises rollback, restarts
on the new path, and runs human/admin and Vault-backed Phase 6-A/5-C
regressions. The human/admin browser matrix requires the operator to finish
the existing Access login and MFA in the browser, then press Enter in its
terminal. No assertion or browser storage is saved. A failure restores the
old service path and restarts it; both token copies are retained.

Only after `P6V-W4 PASS`, the external evidence records 14/14 Phase 6-A and
21/21 Phase 5-C checks at the same commit, and inventory reports zero old
consumers, run in the elevated window:

```powershell
.\scripts\windows\post-phase6a-token-migration.ps1 -Action Finalize
```

Finalization removes the old Tunnel-token file and broad-ACL
`cloudflare-api-token` file, then removes the old directory only if empty. The
new service must already be running securely. The secret-free evidence path is
`D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json`.

If a market check returns exact `LOGIN_REQUIRED`, open
`http://127.0.0.1:17282/login`, complete physical QR approval, and rerun the
same acceptance or migration command. Other failures are not QR prompts.
