# Post-Phase-6-A credential custody handoff

Status: **CLOSED on 2026-09-24**. The permanent Windows checkout completed real
Vault-backed acceptance, protected Tunnel-token migration, rollback exercise,
human/admin/machine regression and retirement of the old secret directory.
Phase 6-B remains unauthorized.

## Delivered boundary

- Exactly three fixed Windows Credential Manager targets hold the Cloudflare
  read-only API token and machine Access Client ID/Secret for the invoking
  Windows user. Enrollment uses hidden input; Status exposes only owner/expiry
  metadata. `Prompt` remains available; `Vault` has no fallback or enumeration.
- The `LocalSystem` cloudflared service uses
  `C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token` with protected
  parent/file ACLs. The Tunnel token did not enter the user vault.
- The old `D:\code\research\fqgate-secrets` directory was removed after an
  automated zero-consumer inventory. Deleting its local `cloudflare-api-token`
  file did **not** revoke the remote Cloudflare token. No Cloudflare resource or
  credential was created, refreshed, rotated or mutated by this task.

## Permanent Windows evidence

The secret-free evidence file is
`D:\code\research\fqgate-post-phase6a-credential-custody-evidence.json`.
Live implementation commit: `a671a310bf93093bc80b4f54b529593bd565bbc4`.
The evidence records all three vault entries as `READY` with owner match and
UTC expiry metadata; it contains no values or recoverable derivatives.

| Check           | Result                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P6V-T1..T6      | PASS — fixed namespace, fake-store denial/replacement/expiry tests, explicit Prompt/Vault paths and bounded secret handling |
| P6V-W1          | PASS — disposable Windows Credential Manager entries, full setter and cleanup                                               |
| P6V-W2          | PASS — real Vault-backed Phase 6-A 14/14 and Phase 5-C remote machine 21/21 on one clean commit                             |
| P6V-W3          | PASS — ProgramData path/reparse and protected ACL checks; LocalSystem token-file use                                        |
| P6V-W4-ROLLBACK | PASS — old service/config path restored and restarted during exercise and failed attempts                                   |
| P6V-W4          | PASS — service on new file, loopback listeners, human/admin browser matrix and machine matrix                               |
| P6V-W5          | PASS — zero old-path consumers; old Tunnel token, local Cloudflare API-token file and empty directory removed               |
| P6V-CI1         | PASS — frozen install, typecheck, lint, tests, build, format, Playwright and Windows CLI/loopback checks                    |

The final service is Running as `LocalSystem` from the protected new file.
FQGate and Bridge listen only on `127.0.0.1:17281` and
`127.0.0.1:17282`. The temporary `UPSTREAM_UNAVAILABLE` result during an
earlier attempt resolved when FQGate's market session reconnected; the final
`P5C-R3` lookup returned HTTP 200. The verifier evidence-field fault found
after a fully passing matrix was fixed and rerun to `P6V-W4 PASS`.

The implementation commit passed [Ubuntu and Windows CI](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/35952868937): run
`35952868937`, Ubuntu job `107484942314`, Windows job `107484942359`.
The exact final documentation commit and its Ubuntu/Windows run/job IDs are
recorded in the external evidence file after CI completes; this avoids
putting a future CI run ID into the commit that triggers that run.

No human-only action remains. For future expiry or rotation, use hidden local
enrollment in `docs/operations/windows-post-phase-6-a-credential-custody.md`.
