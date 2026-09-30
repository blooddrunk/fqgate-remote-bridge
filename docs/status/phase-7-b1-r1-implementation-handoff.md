# Phase 7-B1-R1 implementation handoff

Status: **CLOSED** — permanent-Windows P7B1-01..P7B1-15 and exact-final-commit
Ubuntu/Windows CI passed. Integration PR #14 remains open pending merge.

The integration branch starts from current `origin/main`, commit
`225485fbdfd6fb0ec8bef39a9068b04920777566`, where Phase 7-A is already
squash-merged. It reconstructs the final intended FQGate 1.0.5 local
`qualify-current` path and Phase 7-B1 planning implementation without replaying
the equivalent Phase 7-A runtime or documentation changes. PRs #12 and #13
remain unmerged; this integration does not rewrite `main` or mechanically
replay their stacked history.

The integration preserves the existing loopback listeners, Bridge operation
registry, request contexts and remote permissions. Recovery action IDs remain
plan data only. No route, actuator, automatic update, Cloudflare write or
notification capability is added.

R1 adds strict validation for persisted recovery decisions, reasons, action
identifiers, `notBefore` values, history counters and global decision vectors.
The deterministic matrix rejects invalid combinations and tests corrupted
history fail-closed behavior with zero actuator calls. The permanent-Windows
acceptance script repeats the project quality gates, a healthy-only live plan,
history checks, watch/journal regression, route/policy tree comparison and
loopback process-identity checks.

## Acceptance evidence

The existing permanent checkout `D:\code\research\fqgate-remote-bridge`
passed all fifteen gates. The full quality chain includes 326 deterministic
unit/integration tests and 15 Playwright tests. Live observation returned
`bridge=ready`, `fqgate=ready`, `session=connected`, `tunnel=running`.
All three plan decisions were `no_action / healthy`, with no action field.
History validation and Phase 7-A watch/journal regression passed. Bridge,
FQGate and cloudflared PIDs and creation times were identical before and after
acceptance; both application listeners remained IPv4 loopback only.

The first non-elevated attempt stopped at `P7B1-10-INSPECT` because Windows
withheld the elevated FQGate process image path. After the operator approved
UAC, the same gate passed from native elevated PowerShell. No process was
restarted, adopted or stopped to obtain a healthy state.

The exact final integration commit and P7B1 gate results are recorded in
`D:\code\research\fqgate-phase7b1-acceptance-evidence.json`.
The final commit, Windows evidence digest, and successful GitHub Actions run
and Ubuntu/Windows job IDs are recorded separately in
`D:\code\research\fqgate-phase7b1-r1-closure-evidence.json` and in
[PR #14](https://github.com/blooddrunk/fqgate-remote-bridge/pull/14).
These repo-external receipts bind acceptance to the final commit without a
further documentation commit changing that identity.

## Stacked commit reconciliation

The stack was reconstructed by final content rather than cherry-picking its
history. Phase 7-A runtime, tests and acceptance script match the already
squash-merged main tree. All qualification runtime/tests outside the R1
recovery changes match PR #13's final tree. The only source/test/script deltas
from that tree are `recovery.ts`, `recovery-store.ts`, their two test files,
and the B1 Windows acceptance gate.

| Original commit | Disposition in the integration                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `daf0523`       | Retained explicit local `qualify-current` runtime and tests.                                                   |
| `cf7153d`       | Retained qualification drift gates and historical live evidence; reconciled Phase 7-A closure text with main.  |
| `464fd9d`       | Retained hash verification before candidate execution.                                                         |
| `7d87373`       | Retained deterministic wrong-hash/zero-execution regression.                                                   |
| `92f3a8f`       | Retained bounded B1 task; consolidated authorization prose.                                                    |
| `255cf42`       | Retained B1 coding-agent goal.                                                                                 |
| `35f7b2b`       | Folded repeated Phase 7-A closure/B1 authorization into current status; no duplicate Phase 7-A implementation. |
| `c8fcddd`       | Superseded intermediate B1 activation wording with closed B1/R1 status.                                        |
| `e4b112d`       | Folded repeated Phase 7-A closure into the historical handoff.                                                 |
| `d1474bd`       | Retained the B1/B2 split and explicit B2 prohibition.                                                          |
| `06a287e`       | Consolidated the active agent contract into current AGENTS/agent guide.                                        |
| `61e5e6f`       | Retained historical live 1.0.5/Phase 7-A evidence; reconciled repeated closure prose.                          |
| `2917ebd`       | Retained the qualification review-hardening explanation.                                                       |
| `268191a`       | Retained final formatted qualification sources; omitted a separate style-only commit.                          |
| `4de49b7`       | Retained final formatted B1 goal; omitted a separate style-only commit.                                        |
| `60ac0f6`       | Retained final formatted qualification handoff; omitted a separate style-only commit.                          |
| `169bd6f`       | Retained B1 implementation/config/tests, then added R1 validation.                                             |
| `ae4bc44`       | Retained CIM creation-time identity checks in the Windows gate.                                                |
| `1b21aae`       | Retained the project-pinned Windows pnpm invocation.                                                           |
| `3b5fa29`       | Retained action-free behavior for healthy deployments with an unknown session label.                           |
| `8a70a01`       | Retained original B1 closure as historical evidence; added separate current R1 evidence.                       |

PRs #12 and #13 remain unmerged. No force-update of main was used.
Phase 7-B2 recovery actuation and Phase 7-C notifications remain **NOT AUTHORIZED**.
A separate B2 task may be authorized only after PR #14 merges.
