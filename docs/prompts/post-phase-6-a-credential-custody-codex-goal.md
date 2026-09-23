# Codex goal — Post-Phase-6-A Windows credential custody and secret-directory retirement

Implement only `docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md` from latest `main`.

Read and obey, in this order: `AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/security.md`, `docs/roadmap.md`, the task package above,
`docs/status/phase-6-a-implementation-handoff.md`,
`docs/operations/windows-phase-6-a-acceptance.md`,
`docs/status/phase-5-c-implementation-handoff.md`,
`docs/operations/windows-phase-5-c-acceptance.md`,
`docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`,
`docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`, and
`docs/agent-guide.md`.

## Goal

Remove repeated secret entry from normal permanent-Windows acceptance without widening any
runtime privilege. Add a narrow current-user Windows Credential Manager backend for exactly
three acceptance credentials: the Cloudflare read-only API token, machine Access Client ID,
and machine Access Client Secret. Preserve the existing hidden-prompt path as an explicit
`Prompt` mode and add an explicit `Vault` mode with no silent fallback.

In the same task, migrate the existing cloudflared Tunnel token from
`D:\code\research\fqgate-secrets` to the protected service file
`C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token`, prove LocalSystem can restart
cloudflared and all remote paths still work, then retire the old secret files/directory only
after every consumer is proven gone. The Tunnel token remains a service-owned file and must
never enter the current-user Credential Manager.

## Hard boundaries

- Do not mutate Cloudflare resources. No POST/PUT/PATCH/DELETE provisioning, token creation,
  token retrieval, rotation, policy change, DNS change, Tunnel configuration change, or Phase 6-B.
- Never request or accept a Cloudflare Global API Key.
- Keep FQGate exactly on `127.0.0.1:17281`, Bridge exactly on `127.0.0.1:17282`, and Tunnel
  ingress exactly to the Bridge, never directly to FQGate.
- Preserve human/admin/machine Access hostname, AUD, JWT and operation-policy isolation.
- Preserve all closed Phase 0-6-A behavior and the Phase 5 machine allowlist.
- No secret may appear in Git, normal JSON config, CLI arguments, process listings, stdout/stderr,
  exception text, PowerShell history, CI logs, test snapshots, evidence, or generated docs.
- Do not place new acceptance secrets or encrypted acceptance blobs in the existing broad-ACL
  `D:\code\research\fqgate-secrets` directory.
- Do not delete or overwrite the old Tunnel-token path until the new path has survived restart,
  health, loopback and remote regression and rollback is prepared.

## Permanent Windows environment

Use the existing checkout only:

`D:\code\research\fqgate-remote-bridge`

Resolve and use that working tree. Inspect branch, HEAD and `git status` before changing it.
Preserve operator changes. Never create a second checkout or temporary clone to bypass local
state. Do not reset, clean, stash, or overwrite unrelated user work.

## Required implementation

1. Implement a small Windows-only acceptance credential provider with fixed namespaced targets
   for exactly the three acceptance credentials. No enumeration, export, arbitrary target lookup,
   cross-user fallback, or value-display command.
2. Enrollment must use hidden input (`Read-Host -AsSecureString` or an equivalently non-echoing
   local boundary) and the documented Windows Credential Manager API. Persist only for the same
   local user/machine, never enterprise roaming. Store only bounded non-secret metadata such as
   owner SID, kind, enrollment time and operator-supplied expiry. Reject empty, oversized,
   malformed or expired inputs without echoing them.
3. Add explicit `-CredentialSource Prompt|Vault` to Phase 6-A, Phase 5-C and the underlying
   authenticated Phase 5-A acceptance entry points. `Prompt` must retain existing behavior.
   `Vault` reads only the fixed targets under the invoking Windows identity. Missing, wrong-user,
   expired, revoked or unreadable credentials must fail closed with precise bounded error codes
   before unrelated network work. Never silently fall back from Vault to Prompt or another store.
4. Provide local `Enroll`, `Status` and `Remove` operations. `Status` reports only presence,
   owner match and expiry state. `Remove` removes only these three fixed entries and does not
   revoke remote credentials. A failed replacement of one entry must not destroy the other two.
5. Keep credential plaintext in memory only for the shortest practical lifetime and only in the
   bounded child environment that already needs it. Clear child environment and references in
   `finally`. CI and deterministic tests must use fake stores/fixtures, never real secrets.
6. Validate non-secret account/zone, machine hostname and AUD acceptance metadata before each
   vault-backed live run. Actual Cloudflare/Access calls still prove credential validity.
7. Inventory every consumer of `D:\code\research\fqgate-secrets`, including the installed
   cloudflared service command, repo-external acceptance/runtime configs and scripts. Record only
   non-secret paths/metadata.
8. Create `C:\ProgramData\FQGateRemoteBridge\secrets` only after verifying the destination
   is not a link/reparse point or unexpected existing object. Apply and machine-verify a protected
   parent/file ACL suitable for LocalSystem and only the operator access required by the existing
   lifecycle flow. The resulting file must satisfy the Bridge's existing `tokenFile.state=secure`
   check.
9. Stage the existing Tunnel token at the new path without printing, parsing, logging, hashing
   into evidence, or passing the token as a command argument. Reconfigure only the local service
   token-file path through the bounded service controller. Preserve the old file/path for rollback.
10. Restart cloudflared once on the new path and automatically prove service state, Bridge/FQGate
    loopback listeners, exact Bridge-only ingress and existing human/admin/machine remote behavior.
    On any migration failure, automatically restore the old service path and restart it. Keep both
    token files until the old path is proven working again.
11. Add an explicit finalization action. Only after the new path survives restart and all live
    regressions pass may finalization prove zero consumers of `fqgate-secrets`, remove the old
    Tunnel token, remove the broad-ACL `cloudflare-api-token` file, and remove the directory only
    if empty. Local deletion is not remote revocation; report that distinction without exposing
    credential values.

## Automatic verification is mandatory

Do every machine-verifiable check yourself. Do not hand routine verification back to the operator.
At minimum:

- deterministic credential-provider tests with a fake store, including fixed target namespace,
  wrong user, missing/expired entries, replacement failure, removal and output-redaction cases;
- Windows script tests proving Prompt remains unchanged, Vault is explicit, no silent fallback,
  Linux/WSL cannot directly read the Windows vault, and secrets never enter arguments/output;
- disposable Credential Manager entry smoke test on permanent Windows, including cleanup;
- automatic ACL/reparse-point/service-identity checks for the ProgramData directory and token file;
- an automatic safe rollback-path test that does not break the accepted production topology;
- frozen install, typecheck, lint, all tests, build, format check and Playwright E2E where supported;
- existing Windows CLI and loopback smoke checks;
- a real vault-backed Phase 6-A run that passes the existing 14-check acceptance with zero
  unresolved manual/conflict/blocked results;
- the existing Phase 5-C authenticated remote-machine 21-check matrix;
- service restart plus remote human/admin/machine regressions on the new Tunnel-token path;
- a machine-generated zero-consumer proof for the old secret directory before finalization;
- final Ubuntu and Windows GitHub Actions on the exact final implementation commit.

Use bounded, secret-free evidence. Suggested external path:
`D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json`.
Evidence must include exact commit, check IDs/results, owner/expiry status without values,
service path/identity, ACL verdicts, rollback result, old-path consumer count, regression counts
and final CI run/job IDs. It must never include credential contents or recoverable derivatives.

## Human intervention boundaries

Human intervention is allowed only when it is inherently impossible or unsafe to automate:

1. One-time enrollment/re-enrollment of the three real acceptance credentials through hidden local
   prompts. Never ask the operator to paste them into chat, a file, command argument or visible shell.
2. If Windows requires elevation to create/protect ProgramData or reconfigure the LocalSystem
   service, detect that condition first. Provide the exact elevated command to run, explain exactly
   why elevation is required, state the expected machine-readable success output, and give the exact
   command that resumes automated verification. Do not ask the operator to manually inspect ACLs.
3. Only if the existing FQGate flow returns exact normalized `LOGIN_REQUIRED`, instruct the operator
   to open `http://127.0.0.1:17282/login`, complete the physical QR approval, then rerun the exact
   same acceptance command.
4. If any other property truly cannot be verified automatically, emit `MANUAL_REQUIRED` with the
   exact UI/file/service path, exact field, expected value, why automation cannot prove it, and the
   exact resume command. Never write vague text such as "evidence incomplete".

## Closure rule

Do not claim this task closed while any required check is skipped, manual, blocked, failed, or
only described in prose. If credential storage, owner identity, ACL, service restart, rollback or
remote availability cannot be proven, leave Prompt mode available, keep the old Tunnel-token path
in service, preserve rollback material, and record the exact blocked check.

After implementation, update all relevant source-of-truth docs and create/update a concise
implementation handoff containing exact automatic check IDs/results, evidence path, final commit
and Ubuntu/Windows Actions run/job IDs. Phase 6-B remains unauthorized.

Return a final concise report with: files changed, security-boundary impact, automatic validation
performed, any human-only step still required with exact command, evidence location, final commit,
CI run IDs, and whether the old secret directory was actually retired.
