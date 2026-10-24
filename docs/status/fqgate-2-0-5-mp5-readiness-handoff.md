# MP-5 readiness triage and A/B evidence integrity handoff

2026-10-24, Asia/Taipei. Authorized by Issue #26 after MP-4 PR #25 merged at
`eedbc61546770669c795f83e242753ea0e9800ce`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; production integration **NO-GO**.

## Engineering behavior

The explicit Windows A/B diagnostic requires exactly two unique privately pinned
Sources in reviewed order A connected / B disconnected. The generic parser still
accepts 1..16 profiles; the independent AB_MAPPING gate blocks experiment claims
for every other shape. Existing unknown-field, worker/native creation, Source
recreation, peer drift, stale-time, timeout/cancellation and delayed publication
fences remain. Missing prerequisites are individually visible, and the aggregate
readiness is always BLOCKED. Native identity/epoch cannot be synthesized.

`source-readiness-mp5.ts` contains the diagnostic implementation; old entries
re-export it. The separate artifact name permits additive staging without
replacing existing permanent-host output. `readiness-evidence.ts` provides bounded
safe file reads, exact native-record classification and protected-output byte
comparison. The static import audit includes all four diagnostic entry/modules;
none is reachable from runtime composition or MP-1.

`fqgate205-mp5-triage.mjs` reuses MP-2/MP-4 and QR Preflight, then writes a bounded
external reduced receipt containing actual commands/exits/UTC, checkout SHA,
loaded tool hashes, actual running Bridge self-report if available, host gate
conditions, child gate reasons and request counters. It automatically compares
permanent dist/.output plus private config/mapping/state/record before/after.
Unreadable files are not considered unchanged. Conditions distinguish ABSENT,
UNREADABLE, MISMATCH, STALE and UNKNOWN. Process-record PID/creation is compared
at seven-decimal precision; it is not a native login epoch.

QR Preflight now counts GETs, suppresses Bridge GET when its listener is absent,
and checks for browser storage before hashing the immutable payload. The MP-2
wrapper applies the same exclusion before its existing identity helper. Browser
storage contents are never intentionally read to diagnose a placement failure.
No new simulation framework, native login runner, generic POST transport or
production route is added. v1/2.0.5 adapters, operation registry/permissions,
single-connected-source guard, Cloudflare and MP-1 remain unchanged.

## Evidence custody and delivery

External Linux evidence: `/home/jelinenaro/research/fqgate-mp5-evidence-20261024`.
External Windows evidence: `D:\code\research\fqgate-mp5-evidence`.
`quality.json`, native command logs/exit records, triage JSON/hash companions and
`delivery-receipt.json` bind final PR head, test counts, exact-head CI and host
observations outside Git, avoiding self-referential source hashes.

Initial Linux worktree was clean. Fetch/prune verified merged #25 and no open
PR. The prior MP-4 branch contains its pre-squash implementation commit, so it
cannot fast-forward to the squash merge. It was preserved; MP-5 branches from
latest origin/main. Permanent Windows checkout is reused in place. Its original
286 runtime/output/config files were snapshotted before source synchronization;
no destructive reset/clean, existing artifact overwrite or service start occurs.

Final automated and real-host result tables are populated after the fresh-source
Windows run. This interim engineering commit makes no acceptance claim. Both
exact-head CI jobs remain required; Windows browser E2E is skipped by unchanged
platform policy. Real readiness exit 1 is BLOCKED, independently of fixture PASS.

## Unresolved contract and subsequent decision

Native non-display account ID and monotonic login epoch remain UNPROVEN; equal
GETs/display names/process times cannot exclude hidden A→B→A. Saved Login
availability is not independent restore/storage proof, and an L2 flag is not a
concurrent-data isolation result. Supported independent port and full
credential/cache/WebView/mutex/IPC root remain UNKNOWN. No authentication,
phone confirmation, Source/account mutation, Saved Login restore, L2 experiment,
process/service start/stop/restart, installation repair or Cloudflare change ran.

The [operator decision sheet](../operations/windows-fqgate205-mp5.md) names the
exact host/files, repeat checks, proposed separately approved Bridge-only start,
expected observations, STOP conditions, impacts and rollback limits. Native
relocation/repair lacks a supported contract and therefore has no fabricated
repair command. Next milestone is separately reviewed host-prerequisite recovery
and upstream contract clarification; a native A/B experiment additionally requires
a separate bounded alias-aware runner and explicit account/phone authorization.
The clarification draft is NOT SENT. Engineering completion does not qualify
real multi-account isolation.
