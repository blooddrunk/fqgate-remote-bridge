# Phase 7-B1 implementation handoff

Status: **implementation in progress; closure not yet claimed**.

The branch starts from FQGate 1.0.5 qualification commit `60ac0f64db2ce44f7629495e1a95af01a104c4d0`, which contains the Phase 7-A closure and the authorized B1 task. The B1 implementation adds a pure versioned recovery policy, fixed candidate action identifiers, bounded config, repo-external history and local-only `supervisor recovery-plan` command. Restart actions remain identifiers only. Existing Bridge routes and remote permissions are unchanged.

The policy defaults to three consecutive failures, five-minute cooldown, two attempts and a ten-minute healthy reset. Config validation accepts only bounded fields. Corrupt history, unresolved transaction, incompatible FQGate, login-required, missing tunnel, unknown state and ambiguous identity do not yield eligibility. The CLI currently cannot prove Bridge or tunnel identity and therefore forbids their restart eligibility. Phase 7-B2 must review identity proof and actuation separately.

Deterministic tests cover healthy, suppressed, eligible, exhausted and forbidden decisions, fake-clock thresholds/reset, history bounds/path safety, CLI option rejection and no actuator calls. The permanent-Windows gate is `scripts/windows/phase7b1-acceptance.ps1`; its procedure is `docs/operations/windows-phase-7-b1-acceptance.md`.

Closure evidence pending:

- exact implementation commit;
- permanent-Windows P7B1-01..P7B1-15 results and external evidence path;
- exact-final-commit Ubuntu and Windows CI run/job IDs.

First permanent-Windows attempt on 2026-09-30 stopped at `P7B1-02-BASELINE` with
`listener-17282`; a read-only listener query found neither `127.0.0.1:17281` nor
`127.0.0.1:17282` listening. The healthy runtime prerequisite cannot be inferred or
created by B1 planning. In a separate native Windows PowerShell window, the operator
may run:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
.\scripts\windows\start-dashboard.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -SkipInstall -SkipBuild -NoBrowser
```

Leave it running. Expected result: exactly one IPv4 loopback listener on each port.
Do not install/update FQGate, change Cloudflare, or perform QR login to force a pass.
Resume with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\code\research\fqgate-remote-bridge\scripts\windows\phase7b1-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

No live closure is claimed from the first attempt.
The next attempt confirmed both listeners but found that the LocalSystem cloudflared
process did not expose `Get-Process.StartTime` to this user. The acceptance script now
uses read-only `Win32_Process.CreationDate` for all three before/after identities.
The subsequent run passed baseline and frozen install, then stopped at
`P7B1-04-TYPECHECK`: a nested `pnpm` call resolved the unrelated globally installed
12.6.0 when the outer command used Corepack. The gate now invokes the installed
`pnpm.cmd` directly from the repository; its project-aware version switch reports
the pinned 11.23.0, including nested script invocations.

Phase 7-B2 actuation/startup integration and Phase 7-C notifications remain unauthorized.
