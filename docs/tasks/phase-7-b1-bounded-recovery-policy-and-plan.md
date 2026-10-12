# Phase 7-B1 — bounded recovery policy and dry-run plan

Status: **CLOSED**.

Closure note: the policy, local CLI, bounded history and deterministic tests are
implemented on `codex/phase-7-b1`. Permanent-Windows P7B1 acceptance and
exact-final-commit Ubuntu/Windows CI are recorded in the repo-external evidence
referenced by `docs/status/phase-7-b1-implementation-handoff.md`. The CLI leaves
unknown Bridge and tunnel identity forbidden until a separately reviewed
read-only identity proof exists.

## Goal

Define and implement the decision layer for bounded supervisor recovery without adding any recovery actuator yet.

Phase 7-B1 turns Phase 7-A observations and journal history into a deterministic, secret-free recovery plan. It must answer whether a recovery action would be allowed, suppressed, cooling down, exhausted, or forbidden, but it must not restart Bridge, FQGate, cloudflared, install startup integration, perform updates, trigger login, mutate Cloudflare, or send notifications.

## Required outcome

At closure:

1. a versioned Bridge-owned recovery-policy model consumes only normalized Phase 7-A state and bounded recovery history;
2. policy evaluation is deterministic and returns fixed-schema decisions with fixed reason codes;
3. every potentially recoverable component has an explicit allowlist of candidate actions;
4. cooldown, consecutive-failure threshold, stable-state reset window and attempt ceiling are explicit bounded configuration with safe defaults and hard validation limits;
5. dangerous or ambiguous states fail closed and produce no action;
6. the CLI exposes a local dry-run planning command only; there is no actuator reachable from Phase 7-B1;
7. recovery history is bounded, secret-free, stored outside the repository, and cannot be used to smuggle arbitrary payloads;
8. permanent-Windows acceptance and exact-final-commit Ubuntu/Windows CI prove that the existing runtime, listener and remote authorization surfaces remain unchanged.

## Initial policy boundary

The only action identifiers Phase 7-B1 may model are:

```text
bridge.restart
fqgate.restart
tunnel.restart
```

These are **plan identifiers only** in Phase 7-B1. No implementation may execute them.

The first policy should be conservative:

- `bridge=unavailable` may become a candidate for `bridge.restart` only after a configurable consecutive-failure threshold;
- `fqgate=stopped|unhealthy` may become a candidate for `fqgate.restart` only when the artifact is already qualified and no update/activation transaction is unresolved;
- `tunnel=stopped` may become a candidate for `tunnel.restart` only when the existing managed Windows service is installed and identity is unambiguous;
- `fqgate=incompatible`, unknown process identity, `session=login_required`, missing tunnel service, any probe failure that cannot be classified safely, or any unresolved update/activation state must be non-recoverable in B1;
- guest/login/session state must never trigger QR/login automation;
- no policy outcome may authorize update qualification/apply, Cloudflare provisioning, credential changes, arbitrary process/service control, or financial/state-changing operations.

## Decision schema

Use a small fixed schema, for example:

```text
schemaVersion
component
observedState
decision: no_action | eligible | suppressed | exhausted | forbidden
action?: bridge.restart | fqgate.restart | tunnel.restart
reason
notBefore?
attemptsInWindow
```

Exact names may follow repository conventions. Do not include raw health bodies, paths, PIDs, JWTs, credentials, exception stacks, market payloads or arbitrary strings.

## Recovery history and budgets

Persist only bounded decision/attempt metadata under the configured install/state directory outside Git.

Required properties:

- fixed schema and enum allowlists;
- bounded line/record size and bounded retention;
- cooldown window;
- maximum attempts per component in a bounded rolling or explicit reset window;
- stable-state observation window that resets or decays failure/attempt state only after deterministic criteria;
- monotonic decision semantics under repeated identical observations;
- single-writer protection compatible with the Phase 7-A watcher;
- safe handling of malformed prior history: fail closed, never infer permission from corruption.

Phase 7-B1 records **plans/decisions only**. Actual attempt records belong to a later actuator phase unless a synthetic deterministic fixture is explicitly marked as test-only.

## CLI surface

Add one local-only command such as:

```text
fqgate-remote-bridge supervisor recovery-plan --config <file> --json
```

It may perform the same bounded observation used by `supervisor inspect`, read bounded supervisor history, evaluate policy and return the fixed decision schema.

It must not:

- expose a Bridge HTTP route;
- accept caller-supplied executable paths, service names, commands, URLs or action identifiers;
- contain `--apply`, `--execute`, `--force` or equivalent mutation switches;
- change production state.

## Automated tests

Cover at least:

- every normalized Phase 7-A state and each policy decision;
- consecutive-failure threshold;
- cooldown suppression;
- attempt ceiling/exhaustion;
- stable-state reset behavior;
- incompatible/login-required/missing/unknown states fail closed;
- unresolved FQGate transaction blocks FQGate recovery eligibility;
- deterministic repeated input;
- corrupt or oversized recovery history;
- path/link/reparse safety consistent with Phase 7-A state storage;
- CLI rejects mutation-like/unknown options;
- proof that no recovery actuator, child-process restart path, service restart call, update path, Cloudflare apply path or notification provider is reachable from the B1 command;
- existing Phase 7-A journal, authorization, redaction, lifecycle and update regressions.

Use fake clocks and deterministic fixtures. Do not sleep in unit tests and do not manufacture production outages.

## Permanent-Windows acceptance

Use only:

`D:\code\research\fqgate-remote-bridge`

Automate, in one script with fixed check IDs:

1. clean checkout and frozen install;
2. typecheck, lint, unit/integration tests, build, format and Playwright E2E;
3. live `supervisor inspect`;
4. live `supervisor recovery-plan` proving a healthy deployment returns only `no_action`;
5. bounded history schema/size/path checks;
6. exact listeners on `127.0.0.1:17281` and `127.0.0.1:17282`;
7. proof that no process/service PID/start time changed during the acceptance run;
8. proof Bridge remote operation and authorization registries are unchanged;
9. Phase 7-A watch/journal regression;
10. exact-final-commit Ubuntu + Windows CI.

Do not stop or restart a healthy production component to create recovery evidence. Threshold/cooldown/exhaustion/forbidden cases must be proved with deterministic fixtures.

Write bounded evidence outside Git, for example:

`D:\code\research\fqgate-phase7b1-acceptance-evidence.json`

## Human intervention boundary

No routine human action is required for B1.

The only acceptable manual boundary is an environmental prerequisite that cannot safely be queried without operator action. If encountered, record:

- exact failed check ID;
- exact normalized condition;
- why automation cannot safely resolve it;
- exact operator command/UI step;
- expected result;
- forbidden changes;
- exact resume command.

Do not use phrases such as "manual evidence incomplete" as a substitute for those details.

## Exit criteria

Phase 7-B1 closes only when the policy/plan layer is deterministic, bounded and fail-closed; healthy live Windows produces no action; no actuator exists; permanent-Windows automated acceptance passes; and the exact final commit passes Ubuntu + Windows CI.

After B1 closure, Phase 7-B2 recovery actuation remains unauthorized until separately reviewed.

## R1 integration addendum

The later clean integration task is
`docs/tasks/phase-7-b1-r1-integration-hardening.md`. It does not reopen or widen
the closed B1 scope. It requires `RecoveryStore` to reject impossible persisted
decision combinations, including any action on `no_action`/`forbidden`, a
missing or wrong component action on `eligible`/`suppressed`/`exhausted`, and a
`notBefore` outside `suppressed` + `cooldown`. `suppressed` retains its B1
candidate action identifier for both threshold and cooldown decisions;
`exhausted` retains the candidate action for `attempt_limit`. These identifiers
remain plan data only. `history_invalid` is an action-free transient CLI result,
not a persisted reason.
