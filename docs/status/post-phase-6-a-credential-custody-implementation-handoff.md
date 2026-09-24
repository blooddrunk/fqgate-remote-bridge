# Post-Phase-6-A credential custody handoff

Status: **OPEN**. All three real acceptance credentials are enrolled, and the
protected ProgramData token file passed its staging checks. The latest
new-path verification failed on the live FQGate market lookup, so the service
and external config were automatically restored to the old token path. The
old-directory retirement and exact-final-commit closure remain pending.

## Implemented

- Fixed three-target Windows Credential Manager provider with current-user SID,
  local-machine persistence, UTC expiry and non-secret deployment binding.
- Hidden Enroll, metadata-only Status and bounded Remove operations.
- Bounded machine Client Secret format validation before attempting a vault
  write, with modern and legacy Cloudflare service-token forms accepted.
- The third target's earlier `VAULT_WRITE_FAILED_WIN32_1734` was reproduced
  with a disposable value through the full setter. Its JSON metadata comment
  was 259 characters, exceeding Credential Manager's 256-character comment
  limit. The redundant kind field was removed; an explicit metadata length
  guard and disposable full-setter regression now cover this boundary.
- The first elevated migration found that Windows can leave `sc stop` pending
  after the CLI returns. The immediate start failed, leaving the running
  service on the new protected file and the external config on the old path.
  The migration now waits for the stopped state before starting and provides
  an explicit elevated rollback action. This attempt is not closure evidence;
  rollback and the full migration still need to pass.
- The rollback attempt exposed a separate CLI invocation fault: the
  `cloudflared service` CLI takes `--config` and does not consume the Bridge
  runtime's `FQGATE_REMOTE_BRIDGE_CONFIG` variable. Without `--config`, it
  selected the ProgramData default even while the external config named the
  old path. The migration now passes the external config explicitly for
  service commands and secure status. The service remained running on the
  protected new file while this was diagnosed; the old file was preserved.
- A later elevated migration reached the real authenticated human/admin
  browser matrix and automatically rolled back when two checks failed. A
  local, secret-free FQGate 1.0.2 probe reproduced the QR failure: pending
  poll data had `flow_id` and `status: waiting_for_scan` without `connected`.
  The QR adapter now accepts only that known pending-status shape as
  disconnected, with a regression test. The admin button check now waits for
  client hydration before deciding whether the control is present. The old
  service path was restored and verified; the full new-path matrix remains
  outstanding.
- After those fixes, the elevated human/admin matrix passed and the
  ordinary-account Vault run passed 14/14 Phase 6-A plus 21/21 remote-machine
  checks on the new path. The migration verifier counted the machine summary
  line as a 22nd test and rejected otherwise passing evidence. Its failure
  signaled the waiting elevated process, which automatically restored the old
  service and config. The verifier now separates 21 test records from the
  summary and checks both explicitly; a subsequent full new-path run is still
  required.
- On commit `9dba36a9c965acc807dc57cce1adc49d28a66898`, the next elevated
  run passed the human/admin browser matrix, and ordinary-account Vault
  verification passed Phase 6-A discovery/plan with zero drift or mutation.
  Phase 5-C passed 20/21 checks. `P5C-R3` returned `UPSTREAM_UNAVAILABLE` on
  the instrument lookup, so `P6V-W4` failed and automatically restored the
  running service and external config to the old token path. A direct local
  FQGate catalog lookup also timed out; FQGate health reported `connected=false`
  and normalized session `unknown`. A bounded local FQGate restart did not
  restore connectivity. No normalized `LOGIN_REQUIRED` result was observed,
  so QR intervention has not been requested. Both token files remain intact.
- A guided Windows PowerShell enrollment window for the three hidden prompts.
- Explicit Prompt/Vault source at Phase 6-A, Phase 5-C and Phase 5-A
  authenticated acceptance. Prompt remains the default. Vault failure does
  not fall back.
- ProgramData token-file migration command with old-path inventory, protected
  ACL checks, bounded service-controller reconfiguration, restart and rollback.
  The elevated account runs the human/admin browser matrix; the ordinary
  enrolled account runs Vault-backed Phase 6-A/5-C verification on the new
  service path while the elevated migration waits, then the elevated process
  rolls back automatically on failure or timeout before gated finalization.

## Local checks completed

| ID                                                               | Result                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| P6V-T1..T3 fake store                                            | PASS                                                   |
| P6V-W1 disposable Windows Credential Manager entries and cleanup | PASS                                                   |
| Windows frozen install, typecheck, lint, tests, build, format    | PASS                                                   |
| Windows Playwright E2E                                           | PASS, 13/13                                            |
| Windows CLI/production loopback smoke                            | PASS                                                   |
| PowerShell parser on eight affected scripts                      | PASS                                                   |
| Old-path consumer inventory                                      | PASS, 2 current consumers: service and external config |
| Non-elevated migration denial                                    | PASS, `P6V-W3 ELEVATION_REQUIRED`, no service change   |
| Real current-user vault metadata                                 | PASS, three `READY` entries with owner match           |
| Real new-path human/admin browser matrix                         | PASS                                                   |
| Real Vault Phase 6-A discovery/plan on new path                  | PASS, 14/14, zero drift/mutation                       |
| Real Vault Phase 5-C machine matrix on new path                  | FAIL, 20/21; `P5C-R3 UPSTREAM_UNAVAILABLE`            |
| Automatic rollback after failed verifier                        | PASS, old path active and service running              |
| Ubuntu/Windows Actions on `9dba36a`                              | PASS, run `35845939786`                                |

The running service still uses `D:\code\research\fqgate-secrets\tunnel-token`
and the old files remain intact. No Cloudflare mutation occurred. The Actions
run above has Windows job `107131992463` and Ubuntu job `107131992710`; it is
not final closure CI.

## Outstanding checks

- P6V-W2/W4: repeat real Vault-backed Phase 5-C after the local FQGate catalog
  lookup recovers, then complete one full new-path human/admin/machine run on a
  clean commit. The latest bounded failure is `P5C-R3 UPSTREAM_UNAVAILABLE`.
- P6V-W5: zero old-path consumers and explicit finalization.
- P6V-CI2: Ubuntu/Windows Actions on the exact final closure commit.

The partial, secret-free external evidence is
`D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json`.
It records the current OPEN state; do not infer closure from it or the
historical Phase 6-A evidence. Follow the exact commands in
`docs/operations/windows-post-phase-6-a-credential-custody.md`.
