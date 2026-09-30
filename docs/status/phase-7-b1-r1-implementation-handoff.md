# Phase 7-B1-R1 implementation handoff

Status: **IN PROGRESS** — final permanent-Windows acceptance and exact-commit
Ubuntu/Windows CI are pending.

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

Final implementation commit, permanent-Windows results and exact GitHub Actions
run/job IDs will be recorded by the acceptance process in the repo-external
evidence file `D:\code\research\fqgate-phase7b1-acceptance-evidence.json`.
Phase 7-B2 recovery actuation and Phase 7-C notifications remain unauthorized.
