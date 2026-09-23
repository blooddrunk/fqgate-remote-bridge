# Post-Phase-6-A task — permanent Windows acceptance credential custody

Date: 2026-09-23
Status: **READY — task defined; implementation not started**

## Goal and boundary

Let an agent rerun the existing permanent-Windows Phase 6-A and Phase 5-C live
acceptance without asking the operator to type the same three credentials on
every run. The operator enrolls the Cloudflare read-only API token and existing
machine Access service-token Client ID/Client Secret once through hidden local
prompts. Later acceptance runs explicitly select the local vault and remain
fully automated until a credential expires or is revoked.

This is acceptance-only credential custody. It grants no Cloudflare mutation,
token creation/refresh/rotation, new Bridge operation, background schedule,
remote credential retrieval, or Phase 6-B authority. Preserve all closed
Phase 0–6-A behavior and the current prompt-based acceptance path.

## Observed permanent-Windows constraint

The existing `D:\code\research\fqgate-secrets` directory currently inherits
`Authenticated Users: Modify` and `Users: ReadAndExecute`. It is **not** an
approved place to write acceptance credentials or DPAPI blobs as-is. Do not
change that directory or its existing Tunnel-token files opportunistically:
first inventory the cloudflared service identity and file ACL requirements.

Use Windows Credential Manager generic credentials, scoped to the current
Windows user and persisted only on this computer, as the initial backend.
The repository at `D:\code\research\fqgate-remote-bridge` contains only code;
`D:\code\research\fqgate-secrets` remains available for a separately reviewed
file backend after its parent ACL and service compatibility are proven. No
plaintext `.env`, JSON, PowerShell history, command argument, evidence file or
Git path may carry these values.

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
   `Prompt` retains existing behavior;
   `Vault` reads only the fixed targets under the invoking Windows identity.
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
5. On the permanent Windows account, enroll the real three values through the
   hidden prompts and rerun full Phase 6-A acceptance with `Vault`. Store only
   bounded, secret-free external evidence and the exact commit/CI run IDs.

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
| P6V-CI1 | frozen install, typecheck, lint, tests, build, format and E2E where supported                                       |
| P6V-CI2 | Ubuntu/Windows CI passes on the exact implementation commit without real secrets                                    |

## Closure

Keep this task OPEN after implementation until real vault-backed acceptance,
secret-free evidence, owner/expiry checks, disposable-entry cleanup and
exact-commit CI all pass. If the storage backend, account identity or ACL
cannot be proved, retain the prompt path and report the exact blocked check.

Reference: [Microsoft Credential Manager generic credentials](https://learn.microsoft.com/en-us/windows/win32/secauthn/kinds-of-credentials),
[credential persistence](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala),
[Cloudflare service-token lifetime and rotation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
