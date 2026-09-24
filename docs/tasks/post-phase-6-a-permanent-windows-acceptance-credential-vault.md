# Post-Phase-6-A task — Windows credential custody and secret-directory retirement

Date: 2026-09-23
Status: **CLOSED — permanent-Windows live Vault, migration, retirement and CI passed on 2026-09-24**

Codex handoff: `docs/prompts/post-phase-6-a-credential-custody-codex-goal.md`

## Goal and boundary

Let an agent rerun the existing permanent-Windows Phase 6-A and Phase 5-C live
acceptance without asking the operator to type the same three credentials on
every run. The operator enrolls the Cloudflare read-only API token and existing
machine Access service-token Client ID/Client Secret once through hidden local
prompts. Later acceptance runs explicitly select the local vault and remain
fully automated until a credential expires or is revoked.

The task also moves the existing cloudflared runtime Tunnel token into a
protected service-owned file under the project's Windows default path, then
retires the old `fqgate-secrets` directory after its consumers are gone. The
two stores remain separate: acceptance credentials belong to the current
Windows user's Credential Manager; the Tunnel service continues to use
`--token-file` under `LocalSystem`. This task grants no Cloudflare mutation,
token creation/refresh/rotation, new Bridge operation, background schedule,
remote credential retrieval, or Phase 6-B authority. Preserve all closed
Phase 0–6-A behavior and the current prompt-based acceptance path.

## Observed permanent-Windows constraint at task definition

At task definition, `D:\code\research\fqgate-secrets` inherited
`Authenticated Users: Modify` and `Users: ReadAndExecute`. The
`cloudflare-api-token` file inherited those broad rights. The old
`tunnel-token` file had its own restricted ACL, but the running cloudflared
service referenced its path inside this directory. Do not remove the directory
or either file before inventory, service reconfiguration, rollback preparation
and live validation.

At task definition time, `C:\ProgramData\FQGateRemoteBridge\secrets` did not
exist on the permanent Windows host. Create and protect the destination
directory before placing any token bytes there; reject links/reparse points
and unexpected pre-existing objects.

Use Windows Credential Manager generic credentials, scoped to the current
Windows user and persisted only on this computer, as the initial backend.
The repository at `D:\code\research\fqgate-remote-bridge` must contain no
credential material.
The new Tunnel-token destination is the existing project default
`C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token`, with a protected
parent directory and file ACL verified for the service identity and the
operator account only as needed. Never put the Tunnel token into the
current-user Credential Manager: the `LocalSystem` service must start without
that user signing in. No plaintext `.env`, JSON, PowerShell history, command
argument, evidence file or Git path may carry these values.

Microsoft documents that generic credentials can be read by processes running
as their owning user; the vault therefore protects against accidental file/Git
exposure, **not** compromise of that Windows user or an administrator. Keep the
Cloudflare API token least-privilege and time-bounded. The Access service token
has its own expiration/rotation lifecycle; local storage never extends it.

## Required behavior

1. Provide a small Windows-only acceptance credential provider with fixed,
   namespaced target names for exactly: Cloudflare read API token, machine
   Client ID and machine Client Secret. No target enumeration, value display,
   generic secret proxy, export or cross-user fallback.
2. Enrollment uses `Read-Host -AsSecureString` on the permanent Windows host.
   Write to Credential Manager through its documented API with local-machine
   persistence for the **same user**, never enterprise roaming persistence.
   Record only non-secret kind, owner SID, enrollment time and operator-supplied
   expiry metadata. The Cloudflare API token requires a finite expiry and must
   not remain cached indefinitely; reject empty, oversized, malformed or
   expired input without echoing it.
3. Add explicit `-CredentialSource Prompt|Vault` to the existing Phase 6-A,
   Phase 5-C and underlying Phase 5-A authenticated acceptance entry points.
   `Prompt` retains existing behavior. `Vault` reads only the fixed targets
   under the invoking Windows identity.
   Missing, wrong-user, expired or unreadable entries fail with bounded codes
   before network calls. No silent fallback to a different credential source.
   Vault mode is Windows-only; a Linux/WSL process must invoke the bounded
   Windows acceptance entry point rather than reading Windows credentials.
4. Keep secrets only in the acceptance process and bounded child-process
   environment for the shortest practical lifetime. Clear references and child
   environment in `finally`. Never pass values as arguments, stdout/stderr,
   exception text, logs, CI output, plan, desired state or evidence. Preserve
   the existing no-credential CI fixtures.
5. Provide local `Enroll`, `Status` and `Remove` actions. `Status` reports only
   presence/expiry and owner match. `Remove` deletes only the three namespaced
   entries; it does not revoke Cloudflare resources. Enrollment replaces one
   entry at a time so a failed update cannot silently lose the other entries.
6. Before each run, validate the configured account/zone, machine hostname and
   AUD against non-secret acceptance metadata. The Cloudflare API and Access
   tests still prove actual credential validity. Expired/revoked credentials
   produce a precise re-enrollment instruction, never an automatic token
   refresh or policy change.
7. Preserve the exact permanent Windows checkout, loopback listeners, Bridge
   origin, read-only Cloudflare transport and operation policy. An agent may
   run the acceptance with `Vault` but may not display stored values or run a
   background job under a broader service account.
8. Inventory every reference to the old Tunnel-token path, including the
   installed service command and repo-external acceptance/runtime configs.
   Stage the same token bytes at the new path without printing, parsing or
   placing them in command arguments. Set and verify protected directory and
   file ACLs before changing the service. The new file must pass the Bridge's
   existing `tokenFile.state=secure` check for `LocalSystem`; a missing,
   unreadable or broad-ACL file fails closed.
9. Reconfigure the existing service to the new `--token-file` path using the
   bounded local service controller. Preserve its prior non-secret command
   shape and old token file for rollback. Restart once, then prove service
   health, exact Bridge-only ingress, both loopback listeners and the existing
   human/admin/machine remote regression. If any step fails, restore the old
   service path and restart; keep both files until the old path is working.
10. Only after the new service survives a restart and the live regressions pass,
    confirm no service, config or script refers to `fqgate-secrets`. Retire the
    old Tunnel-token file and the broadly readable `cloudflare-api-token` file
    through an explicit finalization action, then remove the directory only if
    empty. Verify the Cloudflare API token has been enrolled or is intentionally
    discarded before deleting its old copy. This local cleanup does not revoke
    or rotate any Cloudflare token. If the broadly readable API token remains
    active, report that deleting its local file does not invalidate it and
    provide a separate operator rotation instruction. Preserve a bounded
    non-secret rollback record; never back up raw token bytes into Git, logs
    or evidence.

## Implementation sequence

1. Inspect the current Windows identity, Credential Manager availability and
   existing acceptance process boundaries without reading or printing secrets.
2. Implement a narrow credential-store interface and Windows backend; use a
   fake store for deterministic tests. Integrate the source selection once at
   the Phase 6-A/Phase 5-C hidden-input boundaries.
3. Add local enrollment/status/removal commands and a short operator runbook.
   The only mandatory human action is the one-time hidden enrollment or later
   re-enrollment when a credential expires or rotates.
4. Verify fake-store tests and full repository gates, then perform a permanent
   Windows smoke test using disposable test entries. Remove those entries.
5. On the permanent Windows account, enroll the real three acceptance values
   through hidden prompts and rerun full Phase 6-A acceptance with `Vault`.
6. Stage the existing Tunnel token at the protected ProgramData path, update
   non-secret config and service references, and run the restart/remote matrix
   with automatic rollback on failure. Only then finalize deletion of the old
   copies and empty directory. Store bounded, secret-free external evidence
   and the exact commit/CI run IDs.

## Acceptance IDs

| ID      | Required evidence                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| P6V-T1  | fixed three-target namespace; no enumeration, value display or export                                               |
| P6V-T2  | owner-user/local-machine persistence; wrong user and unavailable vault fail closed                                  |
| P6V-T3  | hidden enrollment, bounded input, expiry, replacement and removal behavior                                          |
| P6V-T4  | no credential in arguments, process output, errors, config, Git, evidence or CI                                     |
| P6V-T5  | prompt mode unchanged; explicit vault mode, no silent fallback                                                      |
| P6V-T6  | Cloudflare and Access invalid/expired cases request re-enrollment, no API mutation                                  |
| P6V-W1  | permanent Windows disposable-entry smoke and cleanup                                                                |
| P6V-W2  | real vault-backed run passes all 14 existing Phase 6-A checks and the Phase 5-C 21-check matrix on one clean commit |
| P6V-W3  | protected ProgramData file and parent ACL; LocalSystem read; no broad user read/write; token value never printed    |
| P6V-W4  | service restart and human/admin/machine remote checks pass on the new file path; rollback tested on a safe failure  |
| P6V-W5  | old path has zero consumers; old files and empty directory removed only after explicit finalization                 |
| P6V-CI1 | frozen install, typecheck, lint, tests, build, format and E2E where supported                                       |
| P6V-CI2 | Ubuntu/Windows CI passes on the exact implementation commit without real secrets                                    |

## Closure

Closure evidence is recorded in
`docs/status/post-phase-6-a-credential-custody-implementation-handoff.md` and
the secret-free external file
`D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json`.
All three credentials were `READY` for the invoking Windows user; Vault-backed
Phase 6-A passed 14/14, Phase 5-C passed 21/21, human/admin browser regression
passed, and the protected LocalSystem token path survived restart. The old
directory was removed after zero-consumer inventory and rollback proof.

Reference: [Microsoft Credential Manager generic credentials](https://learn.microsoft.com/en-us/windows/win32/secauthn/kinds-of-credentials),
[credential persistence](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala),
[Cloudflare service-token lifetime and rotation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/),
[Tunnel token scope](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/),
[cloudflared `--token-file`](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/).
