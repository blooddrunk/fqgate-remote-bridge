# Phase 7-B1-R1 — integration and RecoveryStore decision hardening

Status: **CLOSED**. Phase 7-B1 remains CLOSED. The integration and persisted
decision hardening passed permanent-Windows acceptance and exact-final-commit
Ubuntu/Windows CI in PR #14; merging that PR remains a separate action.
The evidence locations and commit reconciliation are in
`docs/status/phase-7-b1-r1-implementation-handoff.md`.

## Goal

Reconstruct the intended FQGate 1.0.5 qualification and Phase 7-B1 planning
changes on a new branch from the latest `origin/main`, which already contains
the Phase 7-A squash merge. Preserve the existing loopback, operation-registry,
remote identity and no-actuator boundaries. Do not implement Phase 7-B2 or 7-C.

## Persisted decision contract

`RecoveryStore` accepts only evaluator-reachable decision shapes:

- `no_action` requires `reason: healthy`, a healthy component state, no
  `action`, no `notBefore`, and zero consecutive failures;
- `eligible` requires `reason: eligible`, the component's exact allowlisted
  action, a candidate state, at least two consecutive failures, and no
  `notBefore`;
- `suppressed` requires `reason: threshold` or `cooldown` and the component's
  exact allowlisted action. Threshold suppression has no `notBefore` and fewer
  than ten consecutive failures. Cooldown suppression alone carries a
  canonical UTC `notBefore` associated with a prior attempt;
- `exhausted` requires `reason: attempt_limit`, the component's exact
  allowlisted action, at least one prior attempt, and no `notBefore`;
- `forbidden` has no `action` or `notBefore` and uses only a policy reason that
  the evaluator can produce. `history_invalid` is a transient fail-closed CLI
  response and is never persisted.

The decision component, action, observed state, attempt count, and history entry
must agree. Global failure reasons must agree across all three decisions.
Where component-level global blocks overlap, persisted decisions must preserve
the evaluator's priority: incompatible FQGate state precedes missing Tunnel;
the unpersisted `login_required` session block is accepted only as a complete
three-component forbidden vector. `incompatible` may be a single FQGate
decision only for an unqualified candidate state.
Malformed or rejected persisted data must produce only action-free forbidden
decisions. It must not be used to compute eligibility and must not invoke an
actuator.

## Integration rules

- Start from the current `origin/main`; do not reset or force-update `main`.
- Retain the FQGate 1.0.5 CLI-only `qualify-current` runtime, tests and exact
  artifact checks from PR #12.
- Retain the Phase 7-B1 policy, recovery store, tests and permanent-Windows gate
  from PR #13.
- Do not replay Phase 7-A runtime or documentation changes already present in
  `main`; reconcile current documentation into one consistent state.
- No new Bridge route, operation, context permission, generic process/service
  execution path, update/apply path, Cloudflare write or notifier is reachable
  from `supervisor recovery-plan`.
- `bridge.restart`, `fqgate.restart`, and `tunnel.restart` remain data IDs.

## Required acceptance

- Deterministic fixtures cover every illegal decision/reason/action/`notBefore`
  combination, counter/history mismatch, corrupted store fail-closed behavior,
  and zero actuator calls.
- Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm build`, `pnpm format:check`, and `pnpm test:e2e`.
- Run `scripts/windows/phase7b1-acceptance.ps1` in the existing
  `D:\code\research\fqgate-remote-bridge` checkout against the repo-external
  configuration. Do not manufacture downtime or alter operator state.
- The final integration commit passes Ubuntu and Windows GitHub Actions.
- Open a clean PR from the integration branch to current `main`; do not
  force-merge either stacked PR over `main`.

Phase 7-B2 and Phase 7-C remain **NOT AUTHORIZED**. Any later actuator work
requires a separate reviewed task.
