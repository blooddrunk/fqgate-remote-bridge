# MP-5 — non-mutating Windows readiness triage and A/B evidence integrity

Authorized by [Issue #26](https://github.com/blooddrunk/fqgate-remote-bridge/issues/26)
after MP-4 PR #25 merged at `eedbc61546770669c795f83e242753ea0e9800ce`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; production integration **NO-GO**.

Reuse MP-2/MP-4 and QR Preflight. Make listener ownership/build, complete payload,
process record, WebView placement, scoped readiness and continuity blockers
independently reproducible. Distinguish ABSENT, UNREADABLE, MISMATCH, STALE,
UNKNOWN and OBSERVED. Observed GET samples must not imply experiment readiness.

Explicit A/B requires exactly two unique private alias/Source ID/number mappings,
reviewed array order A connected, B disconnected. Keep generic 1..16 parsing
compatible. Reject unknown account/epoch fields, Source recreation, native
worker PID/creation/restart drift, peer transitions and late/cancelled publication.
Display equality, timestamps and repeated GETs never establish account or epoch.

Produce bounded external reduced JSON with actual command/exit/UTC/source SHA,
actual running build where discoverable, tool hashes, per-gate conditions and
GET/zero mutation counters. Automatically hash existing permanent `dist/.output`
and private configuration/state/process records before/after inspection; report
unreadable files as unverified even when both attempts fail identically. Never
read browser storage contents or persist raw native/account/QR/credential data.

Run frozen install, typecheck, lint, all unit tests, build, format, Linux browser
E2E, prototype/diagnostic import audit, Windows MP-2/3/4, QR, identity/no-approval,
v2 fixtures, targeted MP-5 tests and real permanent-host GET-only diagnostics.
Require Ubuntu/Windows CI at exact final PR HEAD; disclose Windows browser skip.
Native readiness exit 1 is BLOCKED, never acceptance PASS.

No production adapter/permission/Cloudflare/single-connected-Source change,
MP-1 wiring, generic POST diagnostic, login executor, deployment, native/service
start/stop/restart, install/record/WebView repair, QR/phone/Saved Login/L2 action.
Complete all safe work first. Any subsequent mutation needs a separate reviewed
task and explicit approval using the concrete
[operator decision sheet](../operations/windows-fqgate205-mp5.md).

Deliver code/tests, this task, operations, engineering handoff, agent prompt,
external host/CI receipts and one implementation PR referencing #26.
