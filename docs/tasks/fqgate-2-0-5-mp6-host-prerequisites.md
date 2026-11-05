# MP-6 — read-only host prerequisites and native contract clarification

Authorized by [Issue #28](https://github.com/blooddrunk/fqgate-remote-bridge/issues/28)
after MP-5 PR #27 merged at `97aea57884f1cb0dc8772506cb130f0aa6a1872b`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; production multi-account **NO-GO**.

## Authorized work

Inspect status, preserve operator changes and external artifacts, fetch/prune,
verify the merge and fast-forward safely. Read the entire issue and source of
truth before implementation. Reuse MP-5 and QR GET-only diagnostics on the
existing permanent Windows checkout when accessible. Do not replace its branch
or outputs if subsequent operator work diverged from main.

Inspect listener/process creation, existing startup/service/task metadata,
environment presence, exact artifact/build provenance, immutable payload and
WebView placement without reading browser storage. Keep ABSENT, UNREADABLE,
MISMATCH, STALE and UNKNOWN independent. Record schema/creation precision without
adopting a PID. Source A/B mappings are private; an intact mapping is not a live
observation or strong account identity. Diagnose only objectively reproduced,
narrow standalone diagnostic defects, with deterministic negative tests.

Produce external redacted receipts binding UTC, source SHA, exact command/exit,
duration, tool hashes, per-gate reasons, safe GET counts and protected-file
before/after comparisons. Distinguish engineering source, host checkout,
candidate artifact/source claims and actual running identity. Build only in
isolated outputs. Never overwrite existing `dist`, `.output`, private inputs or
external build/backup artifacts to make a check runnable. Unavailable checks
are NOT_EXECUTED, native failed prerequisites BLOCKED, fixtures FIXTURE_ONLY.

## Deliverables and acceptance

- [Operations and three separate decision sheets](../operations/windows-fqgate205-mp6.md).
- [Draft upstream inquiry, NOT SENT](../plans/fqgate205-mp6-upstream-inquiry-draft.md).
- [Engineering, host findings and handoff](../status/fqgate-2-0-5-mp6-host-handoff.md).
- Frozen install, typecheck, lint, full tests, format, isolated build, Linux E2E,
  production import audit, Windows MP-2/3/4/5/QR/identity/observation and MP-6
  fixtures; exact-final-PR-head Ubuntu/Windows CI where available. Windows
  browser E2E skip must remain disclosed.
- A focused PR for diagnostic code/tests/docs; final head/CI and original
  artifact comparisons remain in the external delivery receipt to avoid a
  self-referential source SHA.

## Exclusions and next boundary

Zero native/Bridge/cloudflared starts/stops/restarts, deployment/repair, record
or storage writes, QR/phone/account/Saved Login/L2 actions, POSTs, Cloudflare
changes, permission expansion or production MP-1 integration. Diagnostic Node/
PowerShell processes, inert fixture files, external receipts and isolated Linux
test servers are engineering tools, not permanent-host runtime actions.

Stage B is decision sheets only, **NOT_EXECUTED**. Any future repair/start needs
a fresh, separately scoped approval tied to actual host/version/build and
rollback limits. An unsupported storage/port contract remains BLOCKED. Even a
later visible single A/B login would measure only observed displacement; it
cannot itself prove strong identity, monotonic epoch, Saved Login/L2 isolation
or qualify production integration.
