# Post-Phase-5 FQGate 1.0.4 Dashboard qualification

Status: **CLOSED — local Dashboard qualification, permanent-Windows 1.0.4, real remote-human/admin/machine regressions and exact-runtime-commit CI passed on 2026-09-29**.

This is a new maintenance task based on the official 1.0.4 stable release. It is
separate from the closed Post-Phase-5 FQGate 1.0.2 qualification task. Phase 5,
Phase 6-A, and Phase 6-B1 remain closed; this task does not reopen them or add
market-data operations.

Read the design first:

`docs/plans/post-phase-5-fqgate-1-0-4-local-qualification.md`

Closure/Coding-agent handoff:

`docs/prompts/post-phase-5-fqgate-1-0-4-closure-codex-goal.md`

## Goals

1. Update the fixed FQGate release source to its current official repository,
   `fqgate/FQGate-releases`, while accepting the existing exact old-owner
   manifest URL as a temporary fixed compatibility alias for external configs.
2. Explain that `start-phase4.cmd -ConfigPath ...` starts the currently managed
   FQGate and does not update it; document the Dashboard and CLI update paths in
   README.
3. Add a local-only Dashboard action for a supported-but-unvalidated candidate.
   Keep the normal CLI `fqgate qualify` workflow.
4. Qualify and update the permanent Windows environment to the official stable
   1.0.4 artifact using the Dashboard when the existing FQGate process can be
   safely stopped by the lifecycle manager.

## Release identity

Observed in the official stable manifest on 2026-09-28:

```text
version: 1.0.4
publishedAt: 2026-09-24T18:52:55Z
file: FQGate-1.0.4-windows-x64-UNSIGNED.exe
size: 23201792
sha256: 6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290
```

Do not add this version to a static validation list before the qualification
transaction passes. Never manually copy the executable into the managed current
directory or widen the configured version range to bypass compatibility checks.

## Permanent Windows checkpoint — 2026-09-28

- The existing `127.0.0.1:17282` Dashboard's `updates.status` reports 1.0.1 and
  labels the release source with the old repository owner.
- Running the newly built current-checkout CLI with
  `D:\code\research\fqgate-acceptance-config.json` reads the managed executable
  at `C:\Users\xieyh\AppData\Local\FQGateRemoteBridge\fqgate\current\fqgate.exe`
  as FQGate 1.0.2, size 23,065,088, SHA-256
  `024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`.
- The same Windows CLI dry-run successfully reads the official 1.0.4 artifact
  and its expected size/hash above. Compatibility is `supported_unvalidated`, so
  preview correctly returns `action: blocked` without changing files.
- Lifecycle status is `unhealthy`: PID 54436 is `identity_mismatch` because its
  executable path cannot be verified against the managed path. FQGate health is
  HTTP 200 and `networkReady: true`, but `connected: false` and session is
  unknown.
- At this pre-install checkpoint, the Windows production build had passed with
  Node 24.15.0; no FQGate process had been terminated and no candidate had been
  installed. FQGate was then closed through its normal UI path, as recorded in
  the following upgrade checkpoint.

## Dashboard upgrade and local regression — 2026-09-28

The operator closed FQGate through its normal UI and stopped the prior Bridge.
The permanent checkout's `start-phase4.ps1` then started the managed 1.0.2
binary and the new Bridge on loopback. From `http://127.0.0.1:17282/updates`,
the operator-facing Dashboard checked the new official source, previewed the
1.0.4 candidate, and submitted the explicit “验证兼容并升级” confirmation.

Dashboard qualification transaction
`29cfd6a1-aa9f-408b-83f6-884a41025494` completed successfully at
`2026-09-28T03:08:29.975Z`. The resulting Windows CLI status reports:

```text
version: 1.0.4
path: C:\Users\xieyh\AppData\Local\FQGateRemoteBridge\fqgate\current\fqgate.exe
size: 23201792
sha256: 6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290
process: running; actualPath equals expectedPath
health: HTTP 200; networkReady=true; connected=true; session=connected
compatibility: validated
qualification: market.instruments.lookup / a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5
probe: market.instruments.lookup.exact-code-v1
```

The listener check still found exactly `127.0.0.1:17281` and
`127.0.0.1:17282`.

Permanent-Windows local regression results after the upgrade:

- Phase 5-A local acceptance: 8 PASS, the documented external Tunnel evidence
  check was SKIP, and there were no failures or pending checks.
- Direct Windows Node execution of the exact Phase 5-B census entry point:
  OpenAPI version 3.1.0, 90 operations, the approved lookup contract fingerprint
  unchanged, known code returned one normalized item, unknown code returned
  zero, and all emitted census checks passed.
- Direct Windows Node execution of `phase5b-matrix.mjs --local`: all four
  bounded checks passed, including malformed/oversized input and raw-path
  denial.
- Direct Windows Node execution of `phase5c-matrix.mjs --local`: 6/6 PASS,
  including the two-route/five-schema machine document, lookup, malformed and
  oversized body limits, raw-path denial, and unknown/forwarded-host denial.

The aggregate `phase5b-acceptance.ps1` wrapper, when launched through this
WSL-hosted PowerShell session, reported its generic `P5B-CENSUS FAIL`: its
`& node.exe` invocation did not populate `$LASTEXITCODE`. The exact census and
matrix modules were then run as direct Windows Node processes and exited 0 with
all bounded checks passing. Rerun the aggregate wrapper from native Windows
PowerShell if that wrapper-level evidence is needed for closure.

This confirms the permanent Windows 1.0.4 update and local regression.

## Exact implementation-commit CI — 2026-09-28

Implementation commit `c03a3393597ad44dc00b0c1975ec4ab19d8b90b0` passed
GitHub Actions CI run `36372964583` with exact matching `head_sha`. Ubuntu job
`108772902641` passed the frozen install, typecheck, lint, tests, build, browser
E2E and format check. Windows job `108772902787` passed the frozen install,
typecheck, lint, tests, build, format check, Windows CLI smoke, loopback smoke
and acceptance-vault checks; browser E2E remains intentionally exercised by the
Ubuntu job in the current CI workflow.

At this 2026-09-28 checkpoint, real remote-human, remote-admin and
remote-machine regression closure was still pending. The later post-reset
restoration and final remote results are recorded in
`docs/status/post-phase-5-fqgate-1-0-4-implementation-handoff.md`. Closure
changed documentation only, so the exact runtime implementation commit and
CI run above remain authoritative. This maintenance task did not expand any
remote operation permissions or reopen Phase 5.

## Final closure — 2026-09-29

The permanent Windows checkout was restored after a Windows 11 reset and
again qualified the exact official 1.0.4 artifact through the managed
lifecycle. Native frozen install, typecheck, lint, unit/integration, build,
format and browser E2E gates passed. Native Phase 5-A/B/C local acceptance,
the headed ordinary/admin Access browser matrix, and the real Vault-backed
remote-machine matrix all passed. The final machine matrix was 22/22 and its
Windows wrapper 3/3; the browser helper exited 0 after its real Access/MFA
steps. FQGate remained connected and validated, with both services listening
only on their specified IPv4 loopback ports.

The exact artifact identity, bounded checks, external evidence paths,
runtime implementation commit and Ubuntu/Windows CI job IDs are in
`docs/status/post-phase-5-fqgate-1-0-4-implementation-handoff.md`. Phase
6-B2 and Phase 6-C remain separate, unauthorized future work.

## Implementation scope

- One registered route: `POST /api/v1/updates/qualify` (`updates.qualify`),
  allowed exactly for `local`.
- Accept only the exact `planId` from the in-memory blocked preview. Refresh the
  official release and installed baseline before applying; reject stale identity
  or anything other than a supported, unvalidated candidate.
- Reuse the existing lifecycle installation transaction and the fixed
  `market.instruments.lookup` qualification probe, including health, OpenAPI,
  semantic checks, artifact-bound evidence, and rollback.
- Keep remote-admin maintenance exactly `updates.check`, `updates.plan`,
  `updates.apply`, and `openapi.refresh`. Keep remote-human and remote-machine
  permissions unchanged.
- Keep FQGate and Bridge listeners bound to `127.0.0.1:17281` and
  `127.0.0.1:17282`.

## Acceptance criteria

- Automated tests cover the local-only route, exact plan binding, candidate and
  baseline drift, unsupported/pinned candidates, missing probes, and rollback.
- Frozen install, typecheck, lint, unit/integration, build, format, and browser
  checks pass.
- Existing Phase 4.5 admin, Phase 5 machine, and Phase 6-B1 behavior remains
  green.
- Permanent Windows Dashboard reports FQGate 1.0.4 and its official SHA-256;
  status and health are ready, and lookup evidence is bound to the active
  artifact.
- The existing real remote-human, remote-admin, and remote-machine regression
  procedures pass without expanding their operation matrices.
- Exact-commit Ubuntu and Windows CI passes before this task is marked closed.

If the lifecycle reports a process identity mismatch, stop and resolve it using
the existing process owner’s normal Windows exit path. Do not force-kill an
unidentified process or weaken managed-process identity checks.
