# FQGate 2.0.5 MP-0: shared-profile account-selection and isolation design review

Status: **MP-0 DESIGN_REVIEW_COMPLETE — 2026-10-16; DESIGN ONLY**.
Result: [shared-profile contract review](../plans/fqgate205-shared-profile-contract-review.md).
MP-1 implementation and real two-account acceptance remain separately authorized work.
Date: 2026-10-15. This task is not an authorization to deploy, reauthenticate
or implement profile-aware runtime behavior.

## Verified baseline and evidence limits

- PR #18/#19 merged; main baseline `3ddda01b77e2df747ae4ab75e2755b72d1c2caec`.
  Main Ubuntu/Windows CI: `38703955298` success.
- Approved/deployed Bridge runtime: `481db65097cd63ea0f9c28f39e526e341b700721`,
  **not** the main documentation/merge SHA. Do not redeploy to match docs.
- Exact installed FQGate 2.0.5, one server-pinned source, operator-confirmed
  real QR Live 8/8; following local 6/6 and Vault remote_machine 22/22 passed.
  Two earlier Live attempts failed; they do not become PASS retroactively.
- Native runtime previously exposed **two source-instance records**, only
  **one connected**. Distinct concurrently connected accounts, source-ID
  persistence across restart, L1/L2 independent state and actual two-account
  isolation are **unproven**.
- Publisher signature/anti-replay, complete v2 directory/power-loss rollback
  and native session epoch also remain unqualified. MP-0 must not relabel them.

Read `docs/plans/future-multi-profile-account-isolation.md`,
`docs/status/fqgate-2-0-5-qr-session-implementation-handoff.md`,
`src/bridge/qr/v2.ts`, `src/bridge/qr/registry.ts`, `src/bridge/service.ts`,
the existing v2 lookup/source resolver, and the request-context registry.
Use only the existing permanent Windows checkout if a native read-only
inspection is possible; preserve operator files and process identities.

## Deliverables — produce a concrete decision, not an implementation claim

1. **Read-only evidence census.** Trace actual QR selection, Bridge status,
   instrument lookup, caches/in-flight requests and permissions. Identify the
   source/account/worker/process observations each uses; distinguish
   `OBSERVED`, `FIXTURE_ONLY`, `BLOCKED` and `NOT_EXECUTED`. If available,
   use GET-only native observations to confirm current read-only state;
   never make an authentication POST or switch a saved-login preference.
2. **Single Bridge-owned selection contract.** Specify an operator-registered,
   opaque profile alias to pinned native source identity; server-side
   source/process/worker/account binding; expected stable/unstable fields;
   start and invalidation semantics; no arbitrary path/port/native source ID
   from clients. QR begin, QR poll, status and lookup must share selection.
   Keep legacy single-profile callers backward compatible and fail closed
   under missing/duplicate/ambiguous/stale selection; do not silently select
   the "first connected" account when more than one exists.
3. **Authority matrix.** Specify which profile-aware action would be permitted
   for `local`, `remote_human`, `remote_admin`, `remote_machine` in a
   **future** implementation. MP-0 adds no operation, route, remote profile
   selector or allowlist entry. A machine lookup remains read-only and must
   never imply QR, source CRUD or account-maintenance permission. Review
   Host/Access JWT/Origin/CSRF and confirmation binding separately.
4. **Isolation/threat matrix.** Enumerate negative cases for A/B cache,
   QR session ID/poll, completion, status, lookup, in-flight query, simultaneous
   begin/poll, source removal/reuse, account change, worker/process restart,
   ambiguous selection, missing alias, stale account pin and error/log leakage.
   Define the deterministic fixture inputs, expected denial/error outcomes
   and invariants for a subsequent implementation.
5. **Decision and incremental plan.** Add
   `docs/plans/fqgate205-shared-profile-contract-review.md`: alternatives
   (native multi-instance in one process vs process-per-profile fallback),
   evidence gaps, proposed private resolver interface, trust boundaries,
   migration behavior, explicit non-goals, machine-checkable acceptance matrix
   and a **separate** smallest MP-1 local-only fixture/prototype step.
   Update the existing future-multi-profile plan only if the evidence changes
   its decisions. Do not code real profile routing in MP-0.
6. **Optional inert fixtures.** Only if they clarify a specific uncertainty,
   add deterministic tests over purely synthetic profile/source snapshots
   with no running Bridge/FQGate integration, no native mutation and no
   new production code path. Prefer avoiding scaffolding without a testable
   invariant. Every fixture must document its assumption and blind spots.

## Safe execution and automated verification

Start by safely syncing latest `origin/main` in the existing checkout:
inspect `git status`, branch and refs first; fetch, then only fast-forward
a clean checkout. Never use `reset --hard`, `clean -fd`, force-push or
discard uncommitted/operator work. A dirty/diverged tree is a recorded
blocker; do not silently create a second Windows checkout.

For native evidence use only reviewed GET-only read paths. The existing
`scripts/windows/fqgate205-qr-acceptance.ps1 -Mode Preflight` is read-only,
but its running-build-matches-checkout gate may legitimately fail when
main contains later docs; do not "repair" it by deploying a new Bridge.
Record actual checkout SHA and separately observed running SHA.
Avoid full raw snapshots in Git and evidence receipts.

Automate (when local tools are available) `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
`pnpm format:check`, and Linux `pnpm test:e2e`; run the Windows
fixture/CLI checks via existing CI, with final exact-head Ubuntu/Windows
CI results. Document any environment-limited step with the exact command,
exit code, missing prerequisite and safe next action. A green CI proves
source/test behavior only, not two-account native or real remote isolation.

Keep receipts secret-safe and outside Git under an operator-approved
existing private directory. Include checkout SHA, live runtime SHA,
source/fixture hashes, timestamp, command/exit code, case IDs,
PASS/BLOCKED/NOT_EXECUTED, non-secret error category and reproducible
read-only rerun command. Never store account/source native IDs,
raw upstream responses, QR images, tokens, configuration, profile data
or credential material.

## Explicit human boundary — future only, not part of MP-0

**No human login, QR begin, phone/MFA confirmation, second-source mutation,
Bridge restart, service/Cloudflare write or elevation is required or
authorized in MP-0.** When a future MP-1+ task actually needs two accounts,
it must stop and ask for a separate, targeted authorization naming:
the two chosen non-secret Bridge aliases, possible replacement/logout of
the currently connected account, exact one-attempt begin route, maximum
poll TTL, rollback/stop criteria and the verified automation resume command.

Proposed later operator procedure (do not execute now):
(a) automation runs a no-mutation preflight and prints observed source
count/selected alias and current session state;
(b) operator explicitly approves possible session replacement, opens
`http://127.0.0.1:17282/login`, confirms a local readiness page and
scans the QR with their own phone only if that future implementation
proves the chosen alias; (c) automation performs identity-bound
same-source and cross-profile negative regressions and reports whether
both distinct accounts actually remain connected. If preflight fails,
readiness is not confirmed, the target drifts, or timeout occurs,
stop without automatic retry and record exactly which step failed.
No claim of two-account PASS based on static fixtures or a single login.

## Completion contract

Mark **MP-0 DESIGN_REVIEW_COMPLETE** only if the exact-current-source
contract document and negative-case matrix exist, all safety boundaries
are traceable to code, required automated checks have explicit outcomes,
and the next MP-1 handoff clearly separates fixture-only from real
two-account validation. If an upstream fact cannot be established
without account mutation, mark that individual gate
`NOT_EXECUTED_REQUIRES_SEPARATE_APPROVAL`; do not treat the review
as failed simply because it correctly preserves that boundary.

No Issues or planning-only PRs. Use one focused change; if code
fixtures are added, a single code-review PR is acceptable. Never
expand FQGate `supportedRange`, remote permissions, Cloudflare writes,
Phase 7-B2/C actuators, or publisher-qualification assertions.
