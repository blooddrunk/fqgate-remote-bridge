# Phase 4.5 Closure + Phase 5 Foundation Task Package

Date: 2026-09-18

Status: **CLOSED — Phase 4.5 closure completed 2026-09-19**

Baseline: main at or after `82fefffc92269f4a68cbf7689caacf417b6cb936`.

## Objective

Do not start broad Phase 5 feature work on an unverified baseline.

The next executable milestone is:

1. restore a fully green cross-platform CI baseline;
2. maximize automatic Phase 4.5 live acceptance evidence;
3. reduce the remaining human work to steps that genuinely require the operator's authenticated Cloudflare browser session or explicit approval of a real update;
4. close Phase 4.5 only when its documented T1-T17 evidence is actually satisfied;
5. then prepare, but do not opportunistically over-expand, the Phase 5 remote-machine read-only API foundation.

Phase 4 remains CLOSED. Phase 4.5 implementation and closure evidence are
complete; Phase 5 foundation work remains a separate future task.

## Non-negotiable security boundary

Preserve all existing contracts:

- FQGate stays on IPv4 loopback, normally `127.0.0.1:17281`.
- Bridge stays on IPv4 loopback, normally `127.0.0.1:17282`.
- cloudflared may target Bridge only, never FQGate directly.
- no catch-all upstream proxy or arbitrary FQGate path execution.
- runtime upstream OpenAPI is descriptive, never an authorization source.
- ordinary `remote_human` permissions remain unchanged.
- `remote_admin` remains limited to the existing safe surface plus exactly:
  - `updates.check`
  - `updates.plan`
  - `updates.apply`
  - `openapi.refresh`
- remote `updates.apply` keeps exact Origin/intent checks and one-time, principal/AUD/operation/plan-bound confirmation.
- cloudflared install/update/service control, Tunnel-token operations, Cloudflare provisioning, Bridge self-update, arbitrary process control, trading, order/cancel/funds operations remain unavailable remotely.
- Phase 5 machine identity must not inherit human/admin/session/update privileges.

## Workstream A — restore a trustworthy green baseline

### A1. Windows CI regression

The current GitHub Actions baseline before commit `82fefff` failed only on Windows in `tests/phase4.test.ts` because tests instantiated `PosixTokenFileAcl` while executing on Windows. Ubuntu passed typecheck, lint, unit tests, build, Playwright E2E, and format.

The fix must preserve two separate concerns:

- platform-neutral `ProtectedTokenFileStore` behavior uses a deterministic fake ACL in cross-platform tests;
- the real `PosixTokenFileAcl` mode-bit behavior is tested only on non-Windows hosts.

Do not weaken production ACL checks to make CI pass.

### A2. Automated verification required

After syncing latest main, run and record:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Also verify the GitHub Actions matrix itself is green on both Ubuntu and Windows.

Acceptance:

- Ubuntu job: PASS.
- Windows job: PASS.
- no skipped Windows build/format/smoke steps due to an earlier unit-test failure.
- Phase 4.5 deterministic tests remain green.
- no production security boundary changed merely to satisfy CI.

If GitHub Actions is still red, inspect the exact failed job and logs and fix it before moving on. A local green run is not sufficient evidence for a cross-platform CI defect.

## Workstream B — automate Phase 4.5 live acceptance as far as safely possible

The source of truth remains:

- `docs/operations/windows-phase-4-5-acceptance.md`
- `docs/operations/windows-phase-4-5-acceptance-simple.md`
- `scripts/windows/phase45-acceptance.ps1`

### B1. Convert machine-verifiable NOT EVIDENCED checks into scripted checks

Audit every remaining T-item and classify it as one of:

- `AUTO_LOCAL`: can be proven from Windows loopback/service/process state;
- `AUTO_REMOTE_UNAUTH`: can be proven with unauthenticated bounded HTTP requests;
- `AUTO_REMOTE_AUTH`: can be proven automatically only after an authenticated operator session/cookie is supplied to the local acceptance harness without persisting or printing secrets;
- `MANUAL_HUMAN`: genuinely requires visual/user-presence confirmation;
- `MANUAL_APPROVAL`: requires the operator to explicitly approve a real state-changing apply.

Do not leave a check manual merely because implementation is inconvenient.

### B2. Preferred authenticated acceptance harness

For T4/T5/T9/T10/T11/T12/T14/T15, implement a bounded local acceptance harness if technically feasible.

Preferred model:

- the operator authenticates in a real browser;
- the harness obtains only a short-lived, in-memory authenticated context by an explicit operator action;
- no JWT, cookie, Access token, confirmation grant, QR payload, or full session ID is written to disk, stdout, test artifacts, GitHub Actions, or docs;
- the harness performs the request matrix and prints only test ID, PASS/FAIL, HTTP status/error code, redacted principal/app labels, and timestamp;
- negative tests must not trigger a real update.

If browser-cookie transfer cannot be implemented safely without exposing secrets, do not invent a workaround. Keep those exact items manual and document why.

### B3. Explicit request matrix

The acceptance harness/documentation must prove at least:

Ordinary hostname / ordinary authenticated human:

- safe Phase 4 operations succeed;
- `updates.check`, `updates.plan`, `updates.apply`, `openapi.refresh` fail server-side.

Admin hostname / authenticated admin:

- safe operations succeed;
- `updates.check`, `updates.plan`, `openapi.refresh` succeed;
- wrong-app / ordinary-human assertion cannot become admin;
- unknown/raw/unregistered routes fail.

Confirmation negative cases:

- apply without grant -> denied;
- expired grant -> denied;
- replay -> denied;
- wrong principal -> denied;
- operation mismatch -> denied;
- plan/candidate mismatch -> denied;
- concurrent/double redemption -> exactly one successful consumer.

For dangerous/side-effecting tests, use a controlled fake or non-executing prepare path unless the acceptance item specifically requires the one real approved apply.

### B4. Real mobile smoke

Automated Playwright viewport tests already prove layout regressions in the deterministic environment.

The only remaining real-device/browser smoke should be narrowly defined:

- real remote route loads through Cloudflare Access;
- `/`, `/login`, `/updates`, `/api-reference` are navigable;
- no page-level horizontal overflow;
- QR is fully visible/scan-friendly;
- controls are usable by touch;
- ordinary/admin authorization behavior matches desktop.

If this cannot be automated against the operator's authenticated Cloudflare session, document it as `MANUAL_HUMAN` with exact steps and expected observations.

## Workstream C — exact manual boundary

Human intervention is allowed only where user presence, MFA, or explicit authorization is intrinsically required.

### C1. Operator login / MFA

Required because Cloudflare Access MFA is a user-presence authentication event.

Steps:

1. On the target Windows machine, open a normal browser.
2. Visit the ordinary hostname and complete Access login.
3. Visit the admin hostname and complete the independent admin Access login + MFA.
4. Do not copy JWTs, cookies, redirect URLs, one-time codes, or browser storage to Codex.
5. Record only: hostname label, successful/failed login, timestamp, and whether MFA was required.

Boundary: Codex may validate server responses after authentication only through a secret-safe harness. It may not ask the user to paste credentials/tokens into chat or commit them.

### C2. Real remote-admin apply

Required because it is an intentional real state-changing maintenance action.

Preconditions before asking the operator to approve it:

- CI is fully green.
- T1-T12 and T14-T17 are PASS, except checks intrinsically coupled to the real apply.
- the candidate is known-safe and independently validated;
- exact source/version/size/SHA-256/compatibility/health expectations are displayed;
- current installation and rollback target are healthy;
- apply confirmation grant negative cases are already proven without causing a real update.

Operator steps:

1. Admin browser opens `/updates`.
2. Run check and plan.
3. Confirm the candidate identity shown matches the prevalidated candidate.
4. Explicitly request/confirm the one-time apply.
5. Wait for the UI to report the final transaction state.
6. Record only candidate version, shortened hash, final health, success/failure, rollback yes/no, and timestamp.

Expected PASS:

- exactly one authorized apply executes;
- candidate activation reaches healthy;
- final installed version matches the plan;
- no unexpected rollback is needed.

Failure boundary:

- if health/compatibility/integrity fails, existing rollback must run;
- record the bounded error code/result;
- do not mark T13 or Phase 4.5 closed.

## Workstream D — Phase 4.5 closure

Phase 4.5 can be changed to CLOSED only after:

- GitHub Actions is green on Ubuntu and Windows;
- deterministic tests/Playwright are green;
- every T1-T17 item has PASS evidence;
- T13 includes a real authenticated remote-admin apply;
- docs contain no secret material;
- `README.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/security.md`, `docs/architecture.md`, `docs/agent-guide.md`, task/status/operations docs agree on closure state.

Do not close based on “implemented in code”, “local apply succeeded”, or “operator said login works”.

## Workstream E — Phase 5 foundation, only after D is complete

Phase 5 is remote-machine read-only market data.

The first Phase 5 implementation slice should be deliberately narrow.

### E1. Machine identity/context foundation

Add a distinct `remote_machine` context with:

- separate API hostname;
- separate Cloudflare Access application/audience;
- machine/service identity distinct from human/admin;
- exact Host -> audience mapping;
- fail-closed verification;
- no reuse of browser MFA assumptions or admin confirmation grants.

Shared generic JWT/JWK code is acceptable only if configuration, expected issuer/audience, caller type, and tests stay independent.

### E2. Zero privilege at first checkpoint

The first checkpoint should recognize a valid `remote_machine` context but grant **no market-data operations yet**.

Automated tests must prove:

- valid machine identity -> classified as `remote_machine`;
- missing/wrong-app/wrong-AUD/wrong-host identity -> denied;
- machine identity cannot access QR/session/update/OpenAPI-refresh/admin controls;
- ordinary human/admin identities cannot impersonate machine context;
- all existing Phase 4/4.5 matrices remain unchanged.

### E3. Then add the first read-only market operation slice

After identity/context tests are green, select the minimum useful FQGate read-only market-data set based on observed runtime contracts and existing consumer needs.

Before implementation, document for each chosen operation:

- Bridge-owned operation ID;
- stable public path/method;
- upstream FQGate mapping;
- request/response schema;
- timeout/body/result size bounds;
- FQGate compatibility requirement;
- logging/redaction policy;
- allowed context = `remote_machine` (and local only if explicitly desired);
- explicit proof that it cannot mutate trading/account state.

Do not expose every endpoint returned by upstream OpenAPI.

### E4. Generated remote OpenAPI

Generate machine-facing docs only from the explicit Bridge registry.

Required property:

`upstream discovery != authorization`.

New upstream endpoints must remain absent until a Bridge operation is explicitly implemented, reviewed, registered, and tested.

## Required files

At minimum update as needed:

- `AGENTS.md`
- `README.md`
- `docs/roadmap.md`
- `docs/agent-guide.md`
- `docs/status/phase-4-5-implementation-handoff.md`
- `docs/operations/windows-phase-4-5-acceptance.md`
- `docs/operations/windows-phase-4-5-acceptance-simple.md`
- `scripts/windows/phase45-acceptance.ps1`
- tests supporting portable CI and acceptance automation

Only after Phase 4.5 closes, create/activate Phase 5 implementation-specific design/task/status docs as necessary.

## Final deliverable / evidence format

At the end of the work package, report:

1. exact baseline SHA and final SHA;
2. GitHub Actions run ID and Ubuntu/Windows conclusions;
3. deterministic test counts;
4. Phase 4.5 T1-T17 table with evidence source for each item;
5. exact manual steps the operator actually had to perform;
6. any remaining blocker stated concretely with why it cannot be automated;
7. whether Phase 4.5 is CLOSED or still OPEN;
8. only if CLOSED, the exact Phase 5-A next task and files changed.

## Closure result — 2026-09-19

Phase 4.5 is **CLOSED**. The full T1–T17 evidence matrix is recorded in
`docs/operations/windows-phase-4-5-acceptance.md`. GitHub Actions run
`35421961651` passed both Ubuntu job `105841185906` and Windows job
`105841186010` for commit `5e665ce5035e079783485dd8689137ceb28ac968`.
Local verification passed typecheck, lint, 15 unit-test files/125 tests, build,
format check, and 13 Playwright E2E tests.

The exact manual boundaries were ordinary and admin Access login/MFA, explicit
approval of one known-safe remote-admin apply, and real phone/tablet smoke.
No secret-bearing evidence was committed. The next task is a separate Phase
5-A identity/context foundation: add `remote_machine` recognition with a
separate hostname/AUD/service identity and zero market-data privileges. No
Phase 5-A files were changed by this closure.

Never use vague statements such as “manual evidence incomplete” or “requires operator verification” without the exact procedure, expected result, and automation boundary.
