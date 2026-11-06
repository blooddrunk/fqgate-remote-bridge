# MP-7 implementation and evidence handoff

2026-11-06 Asia/Taipei. [Issue #30](https://github.com/blooddrunk/fqgate-remote-bridge/issues/30).
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED; production multi-account NO-GO.**

## Delivered behavior

The standalone `scripts/observe-fqgate-releases.mjs` composes only the independent
`src/fqgate/diagnostics/release-observer.ts`, existing metadata parser and GET
transport. It does not construct application/config/lifecycle or accept arbitrary
URLs. Both official latest Release pointers, immutable v2 chain and legacy root
are reconciled. Strict optional baselines flag observed rollback/equivocation and
future stable changes; no state is persisted or trusted automatically.

The import audit now also forbids production reachability of this observer.
Existing operation/context matrices, exact 2.0.5 runtime/hash/client/fingerprint
and v1 range are unchanged. New negative fixtures cover future 2.0.8, corrupt
metadata, source/channel disagreement, replay/regression, redirects, failures,
limits and report redaction. Existing lookup regressions add 2.0.7/8 denial,
503 and an upstream trading-path fingerprint case. A characterization test
explicitly records the account-display sampling gap in current lookup; passing
that test is not an isolation guarantee. Existing A/B diagnostic/QR/race suites
separately reject observed account, worker and Source drift.

[Contract matrix](../plans/fqgate-mp7-contract-matrix.md) documents release notes,
actual metadata/package bytes, historical native evidence, unmerged branch claims,
source discrepancies and UNKNOWNs. [Operations](../operations/fqgate-mp7-observation.md)
provides repeat commands and exact deferred boundaries. [MP-8 goal](../prompts/fqgate-mp8-codex-goal.md)
proposes separately authorized per-operation exact-version candidate qualification.

## Source synchronization and custody

First commands were `git status --short` (clean) and `git fetch origin --prune`.
PR #29 is merged at `3e06422260a81255de1e5ff8b623a00f52cf5454`, latest main at
initial synchronization; no open PR then. Independent branch
`codex/fqgate-mp7-release-investigation`, worktree
`/home/jelinenaro/research/fqgate-mp7` starts at that SHA. Original Linux MP-6
checkout is preserved. No reset/clean/force-push or permanent-host fetch/switch.

Windows local branch is accessible and clean at c06fbcf. Its objects were fetched
read-only into the engineering Git database as `preserved/fqgate206`; Windows
refs/worktree/output unchanged. All five 2.0.6/recovery commits, source profiles,
identity/listener changes, QR binding, selected status and method routing were
reviewed. No branch changes replayed. Current build provenance remains the
historical 303-entry candidate claim/partial cross-platform reconstruction from
MP-6; no running artifact is attested.

External Linux receipts:
`/home/jelinenaro/research/fqgate-mp7-evidence-20261106`.
External Windows inert verification:
`D:\code\research\fqgate-mp7-evidence-20261106\validation`.
Full argv/UTC/cwd/exits/duration/log hashes, source/tool hashes, public metadata,
quarantined ZIP and protected inventories remain outside Git. Final delivery
receipt binds final source/PR/head CI; this file does not pretend to contain its
own final commit hash. Public [release receipt](../compatibility/fqgate-mp7-observation.json)
is a pinned observation, not a runtime authority or credential.

## Observed upstream state

Latest application **2.0.7**, `2026-10-31T03:03:54Z`; Agent **2.0.7**,
`2026-10-31T03:53:09Z`. Exact official Windows ZIP 32,181,584 bytes,
`6a6a43aea7380cd5e3c5c6f6e271140d78bb3a978a8711e2d0a4f64dfe253dcf`.
Release repository snapshot `3434783820aa2623bb0b74d1f3643ef6941aa5ec`, stable
sequence 10 / refresh 11; legacy root **1.0.5**. Timestamped receipts preserve
the actual observations; future executions must recheck.

Actual ZIP audit PASS: 10 entries / 68,296,393 uncompressed bytes, published
size/SHA, CRC/path/entry bounds and two x64 PE headers. Both PE certificate tables
are empty; no publisher/envelope signature verified. Embedded legacy schema
info.version 1.0.2 cannot satisfy the v2 lookup/QR contract. No executable,
updater, DLL, bundled JS, subscription or native authentication command ran.

## Validation

| Check                                                     | Actual result                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, typecheck, lint                           | PASS / exit 0                                                                                                                |
| Full unit suite                                           | 878 PASS / 39 files; includes 45 new observer cases                                                                          |
| Isolated CLI + SSR build                                  | PASS / exit 0; independent worktree outputs only                                                                             |
| Format and production import/permission audit             | PASS / exit 0; zero observer/prototype/diagnostic paths from production; runtime gate/registry/config sources unchanged      |
| Linux Chromium E2E                                        | 19 PASS / exit 0; isolated test server and fake upstream only                                                                |
| Native Windows MP-2/MP-3                                  | 14/14 + 14/14 PASS                                                                                                           |
| Native Windows MP-4/5 CLI boundary                        | 12/12 PASS                                                                                                                   |
| Native Windows MP-6 metadata/redaction                    | 11/11 PASS                                                                                                                   |
| Native Windows v2 / QR preflight / identity / no-approval | 40 + 28/28 + 5/5 + 1/1 PASS                                                                                                  |
| Windows credential fake store                             | PASS; real credential-store smoke NOT_EXECUTED locally because it writes test Vault entries; hosted CI runs it in isolation  |
| Observer real public GET and baseline repeat              | PASS / exit 0; 2.0.7, UNCHANGED_UNAUTHENTICATED                                                                              |
| Actual 2.0.7 package audit                                | Structural/size/SHA PASS; signature false; runtime qualification BLOCKED                                                     |
| Preserved 2.0.6 candidate/config/manifest comparison      | 303/303 match, manifest/config match existing plan, source claim c06fbcf; not a reproducible-build or running identity claim |
| Existing outputs/config protected inventory               | 591 entries identical before/after; digest 0892fb6d78741fafc70861bb6a0819ceae94b4bbbb0a8a05ff02b827d821df31                  |
| Native fixed artifacts/records/candidate manifest/plan    | Separate 10-entry before/after comparison; absent entries retained as ABSENT                                                 |
| Windows browser E2E                                       | NOT_EXECUTED, skipped by unchanged CI policy; Linux browser E2E runs                                                         |
| Exact final-head Ubuntu/Windows CI                        | Bound in PR checks and external delivery receipt after commit/push; no earlier green SHA substituted                         |

Linux Node 24.19.0 / pnpm 11.23.0, native Windows Node/PowerShell 5.1 fixture
execution, hosted matrix Node 22. Early Linux pnpm launcher selection, duplicate
TypeScript property and lint imports were corrected; initial failures remain in
external logs. An extra redundant no-approval wrapper assertion incorrectly
expected a redacted internal error string; removing that assertion restored the
wrapper while the existing native no-approval test itself passed 1/1. This was
a harness failure, not a host acceptance attempt. The packaged legacy-schema
fingerprint failure is retained as evidence against using it as a v2 contract.
No fixture/native/CI success is reported as real Windows host or account acceptance.

## Independent remaining gates

- RELEASE_OBSERVED / CONTRACT_REVIEWED are static/read-only findings, not native readiness.
- HOST_BLOCKED: last MP-6 listener observation absent; MP-7 does not claim a new
  host census or attempt repair/start. Current runtime identity UNKNOWN.
- 2.0.7 runtime OpenAPI/Source semantics/lookup/QR/local/remote acceptance:
  **NOT_EXECUTED**. Main still denies 2.0.6/7/8.
- Publisher trust/bootstrap/replay/expiry and complete native/session rollback:
  **BLOCKED/UNPROVEN**, independently of a matching ZIP hash.
- Native strong account identity, per-Source monotonic epoch, Saved Login/L2,
  independent full storage/IPC/ports and sustained subscription isolation:
  **UNKNOWN/UNPROVEN / LIVE_UNQUALIFIED**.
- Real QR/phone/MFA/login, second account, state/record/config writes, upstream
  inquiry sending, runtime deployment and production integration: **NOT_EXECUTED**.
- MP-8 admission design and operator decision sheets are proposals, not approval.
  Their prerequisites/steps/STOP/rollback limits are in the operations document.
