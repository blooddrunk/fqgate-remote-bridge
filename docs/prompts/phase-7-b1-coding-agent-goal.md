# Phase 7-B1 coding-agent goal

Implement the authorized Phase 7-B1 task in `docs/tasks/phase-7-b1-bounded-recovery-policy-and-plan.md`.

Work only in the existing repository and preserve all established security boundaries. Phase 7-B1 is a **decision/planning layer only**. It must not restart Bridge, FQGate or cloudflared; install a service/Scheduled Task; apply or qualify updates; trigger QR/login; mutate Cloudflare; send notifications; expose a new Bridge HTTP route; or expand remote-human/admin/machine permissions.

## Required implementation

- Add a deterministic, versioned recovery-policy model consuming only normalized Phase 7-A observations plus bounded recovery-history metadata.
- Model only these candidate action IDs: `bridge.restart`, `fqgate.restart`, `tunnel.restart`.
- Return a fixed-schema decision such as `no_action | eligible | suppressed | exhausted | forbidden` with fixed reason codes.
- Add hard-bounded config for consecutive-failure threshold, cooldown, attempt ceiling and stable-state reset, with conservative defaults and validation limits.
- Fail closed for incompatible FQGate, unknown/ambiguous identity, login-required, missing tunnel, unresolved FQGate update/activation transaction, corrupt history, or any unclassified condition.
- Add bounded, schema-allowlisted, repo-external recovery decision/history persistence with path/link/reparse protections and single-writer behavior compatible with Phase 7-A.
- Add a local-only CLI command `supervisor recovery-plan --config <file> --json` (or a repository-consistent equivalent). It must have no mutation switch and accept no caller-supplied command/path/service/action URL.
- Keep route/policy registries unchanged.

## Verification-first requirements

Prefer automated evidence over narrative claims.

Create/update deterministic tests that cover every policy state, thresholds, cooldown, exhaustion, stable reset, corrupt history, path safety, CLI option rejection, and explicit proof that no actuator/service restart/update/Cloudflare/notification path is reachable.

Create a permanent-Windows acceptance script with fixed IDs that automatically runs:

- frozen install;
- typecheck;
- lint;
- unit/integration tests;
- build;
- format check;
- Playwright E2E;
- live supervisor inspect;
- live recovery-plan on the healthy deployment and assert **no_action only**;
- history schema/size/path checks;
- exact loopback listener checks;
- before/after PID/start-time proof that Bridge/FQGate/cloudflared were not restarted;
- unchanged remote operation/authorization surface;
- Phase 7-A watch/journal regression.

Use only `D:\code\research\fqgate-remote-bridge`. Do not create a second permanent checkout. Write bounded secret-free evidence outside Git, e.g. `D:\code\research\fqgate-phase7b1-acceptance-evidence.json`.

Do not manufacture production downtime. Recovery-trigger cases must be deterministic fixtures.

If a truly unavoidable human boundary appears, do not summarize it with internal terminology. Record the exact failed check ID, exact reason automation cannot proceed safely, exact operator command/UI action, expected result, forbidden changes, and exact resume command. QR/login is not required merely to make B1 green.

Before claiming closure, run exact-final-commit Ubuntu and Windows CI and record the run/job IDs. Update roadmap, AGENTS.md, task/status/operations docs consistently. Phase 7-B2 actuation and Phase 7-C notifications remain unauthorized.
