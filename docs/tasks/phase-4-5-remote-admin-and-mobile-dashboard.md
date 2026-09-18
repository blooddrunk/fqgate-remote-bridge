# Phase 4.5 Task Package — Remote Administrator Hardening and Mobile Dashboard

Date: 2026-09-17

Status: **IN PROGRESS / 4.5A, 4.5B, and 4.5C implemented; live acceptance open**

Primary design: `docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

This task package is the implementation contract for the next phase after CLOSED Phase 4. It must preserve the Phase 4 security boundary while introducing a separate, stronger remote-administrator context and improving the existing Dashboard for mobile use. It must not implement Phase 5 market-data APIs.

## Mandatory invariants

Throughout this phase:

- FQGate stays on IPv4 loopback, normally `127.0.0.1:17281`.
- Bridge stays on IPv4 loopback, normally `127.0.0.1:17282`.
- cloudflared points only to the Bridge loopback origin.
- no catch-all proxy, arbitrary upstream path, LAN/WAN listener, router port-forward, wildcard CORS, or raw upstream execution path is added.
- Bridge operation policy remains the authorization boundary after Cloudflare Access.
- Phase 4 `remote_human` behavior is preserved.
- trading and financial state-changing capabilities remain forbidden.
- no Phase 5 service-token/machine market-data API is implemented here.
- no Cloudflare API provisioning is implemented here.
- secrets/assertions/QR/session/confirmation values are never logged or committed.

## Work package 4.5A — policy and remote-admin authentication foundation

Status: **IMPLEMENTED**; the four maintenance operations remain remotely
denied until 4.5C.

Goal: create an explicit `remote_admin` request context and stronger origin-side authentication without granting any new remote maintenance privilege yet.

Tasks:

1. Refactor request/operation policy so caller context and operation permissions are orthogonal rather than encoded as growing combination enums.
2. Preserve exact Phase 4 behavior for `local` and `remote_human`.
3. Add optional, disabled-by-default admin configuration for:
   - distinct admin hostname;
   - Cloudflare Access team domain/issuer metadata;
   - exact admin application audience.
4. Reject duplicate human/admin hostnames and invalid/ambiguous host forms.
5. Add framework-agnostic Cloudflare Access JWT verifier for `remote_admin`:
   - RS256 signature validation;
   - exact issuer/team domain;
   - exact admin audience;
   - time-claim validation;
   - `kid`/key rotation handling;
   - fixed derived JWKS/certs endpoint, no arbitrary JWKS URL;
   - bounded fetch/cache/timeout/size;
   - fail closed;
   - no token logging/persistence.
6. Reduce verified identity to a minimal internal principal representation suitable for later confirmation binding.
7. Apply request-context gating consistently to Bridge API and top-level page/static entry, preserving unknown-Host denial.
8. At this checkpoint, allow `remote_admin` only the same safe operations as `remote_human`. Keep all four current maintenance operations remotely forbidden.
9. Document the required independent Cloudflare Access admin application:
   - separate hostname/AUD;
   - human-only policy;
   - MFA requirement;
   - device posture requirement;
   - short admin session;
   - Protect with Access;
   - no Bypass/Service Auth path.

4.5A acceptance:

- deterministic JWT fixtures prove valid/wrong issuer/wrong audience/expired/not-yet-valid/bad-signature/unknown-key behavior;
- Phase 4 remote-human tests remain green;
- remote admin is recognized only with valid admin JWT;
- `updates.check`, `updates.plan`, `updates.apply`, `openapi.refresh` still fail for both remote contexts;
- no market data or service-token behavior exists.

## Work package 4.5B — mobile Dashboard optimization

Status: **IMPLEMENTED**.

Goal: make the existing React/TanStack UI usable on narrow screens without adding a second frontend or changing authorization.

Routes in scope:

- `/`
- `/login`
- `/updates`
- `/api-reference`

Tasks:

1. Keep one responsive React/TanStack route tree; do not add `/mobile`, a native app, PWA-only fork, or duplicated client API.
2. Make navigation responsive and touch-friendly using the existing component stack.
3. Ensure no document-level horizontal overflow at ~360 CSS px width.
4. Reflow status cards and operator summaries for phones while retaining desktop layout.
5. Keep QR content fully visible and scan-friendly.
6. Use approximately 44x44 CSS-pixel touch targets where practical; avoid hover-only interactions.
7. Bound/wrap/scroll long IDs, hashes, URLs, code, tables, and API-reference content inside their own containers.
8. Preserve clear local/remote-human/admin context messaging.
9. Keep ordinary remote `/updates` read-only; responsive code must not expose a working maintenance path.
10. Preserve accessibility basics: semantic labels, focus behavior, keyboard use, dialog/drawer focus containment, mobile viewport/safe-area behavior.
11. Add Playwright viewport coverage for 360x800, 390x844, 430x932, 768x1024, plus desktop regression.

4.5B acceptance:

- all existing pages work at target viewports;
- no page-level horizontal overflow;
- QR and primary controls remain usable;
- mobile layout does not alter server-side authorization;
- direct forbidden-operation tests remain green;
- desktop regression remains acceptable.

## Work package 4.5C — narrow remote-admin operation surface and second confirmation

Status: **IMPLEMENTED IN CODE**; live Windows x64 + Cloudflare acceptance
remains open.

Goal: only after 4.5A and 4.5B are stable, allow the strongly authenticated admin context to perform the existing maintenance workflow.

Only these existing operations may gain `remote_admin` permission:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Do not add cloudflared remote control, arbitrary process/service control, Tunnel-token operations, Cloudflare provisioning, market-data operations, or new FQGate execution paths.

Tasks:

1. Extend operation metadata to express admin-allowed contexts and confirmation requirement explicitly.
2. Permit remote admin `updates.check`, `updates.plan`, and `openapi.refresh` after strong admin authentication.
3. Require a separate one-time server confirmation grant for remote `updates.apply`.
4. Implement a framework-agnostic in-memory confirmation registry/service with:
   - cryptographically random opaque grant/challenge IDs;
   - short TTL;
   - bounded count and cleanup;
   - atomic one-time consume;
   - binding to verified admin principal;
   - binding to admin AUD;
   - binding to operation ID;
   - binding to exact update plan/candidate identity;
   - replay/expiry/mismatch denial;
   - restart invalidation;
   - no persistent browser storage/logging.
5. Keep existing stale-plan/candidate/integrity/compatibility/health/rollback checks unchanged and additive to confirmation.
6. Add explicit browser CSRF protections for remote-admin control POSTs:
   - exact admin HTTPS Origin contract;
   - no wildcard CORS;
   - Bridge-owned custom intent/confirmation header or equivalent cross-site-form-resistant mechanism;
   - apply additionally requires the one-time confirmation grant;
   - local loopback behavior remains valid.
7. Add admin UI to the existing responsive `/updates` page:
   - check/plan controls;
   - exact candidate/source/version/size/hash/current-context review;
   - explicit confirmation interaction for apply;
   - progress/result/rollback status;
   - clear admin-context indicator.
8. Keep ordinary remote-human hostname incapable of these operations server-side.

4.5C deterministic acceptance:

- complete context x operation matrix tests;
- ordinary remote-human direct-call denial;
- remote-machine placeholder/unknown context cannot inherit admin rights;
- confirmation expiry/replay/race/principal mismatch/operation mismatch/plan mismatch tests;
- exact Origin/CSRF tests;
- logs/errors/snapshots contain no JWT or confirmation secret;
- current Phase 2/3/4 regression suite remains green.

## Live Windows + Cloudflare acceptance

Phase 4.5 cannot be CLOSED without live evidence because it expands remote administrative authority.

Create `docs/operations/windows-phase-4-5-acceptance.md` and record bounded evidence proving at minimum:

1. FQGate and Bridge remain loopback-only.
2. Human/admin public hostnames route only to Bridge, never FQGate.
3. Ordinary Phase 4 human access still works.
4. Ordinary human Access identity cannot call any of the four admin operations.
5. Unauthenticated admin access is denied/challenged.
6. Device-noncompliant admin access is denied.
7. Intended compliant device + MFA reaches admin Dashboard.
8. Bridge cryptographically validates the real admin assertion for exact issuer/AUD without logging it.
9. Wrong-app/ordinary-human assertion cannot become admin.
10. Remote admin check/plan/OpenAPI refresh work.
11. Apply without grant, expired grant, replayed grant, wrong-principal grant, and stale/mismatched-plan grant all fail.
12. One known-safe real apply is completed via the admin flow and existing activation/health/compatibility/rollback invariants remain intact. If there is no safe candidate, leave 4.5C open rather than fabricating evidence.
13. cloudflared/Tunnel-token/control-plane operations remain unavailable remotely.
14. Raw/unregistered FQGate paths remain unreachable.
15. Local loopback maintenance continues to work.
16. Real mobile-browser smoke test passes for Dashboard, QR, updates, and reference.

Never record raw JWTs, cookies, Tunnel tokens, QR payloads, credentials, or full session identifiers.

## Relationship to Phase 5

Phase 5 remains a separate remote-machine read-only market-data phase.

After 4.5A, the request-policy model must be ready to add a fourth caller context:

```text
remote_machine
```

Phase 5 must use a separate hostname, separate Access application/policy, separate audience, and machine/service identity. It must not reuse admin MFA/device policy or admin confirmation grants. A service token must never authorize QR/session maintenance, update operations, OpenAPI refresh, or admin UI.

Shared generic JWT/JWKS/context infrastructure is allowed, but privilege sets, configuration, tests, and host/AUD mappings must remain separate.

Recommended order:

```text
4.5A -> 4.5B -> 4.5C -> Phase 5
```

If Phase 5 must start earlier, it may start after 4.5A is merged; keep 4.5C and Phase 5 in separate changes and do not combine remote-admin and remote-machine privilege expansion.

## Quality gates

Every implementation subphase must pass:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Normal CI must not require live Cloudflare credentials, live FQGate login, or real Tunnel tokens.

## Required documentation updates during implementation

When behavior is implemented, update the corresponding source-of-truth docs in the same change:

- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/roadmap.md`
- `docs/agent-guide.md`
- `config/example.json` for non-secret config shape
- `docs/operations/windows-phase-4-5-acceptance.md`
- `docs/status/phase-4-5-implementation-handoff.md`

Update `docs/upstream-contracts.md` only when an observed FQGate/Cloudflare contract materially changes.

## Explicit non-goals

Do not opportunistically implement:

- Phase 5 market-data APIs/service-token auth;
- Phase 6 Cloudflare provisioning/drift remediation;
- supervisor/notifications;
- automatic background updates;
- MCP/WebSocket;
- final Windows packaging;
- Bridge self-update;
- arbitrary remote shell/service/process control;
- remote cloudflared install/update/reconfigure/restart;
- trading or financial state mutation.

## Closure rule

Phase 4.5 status remains OPEN until 4.5A, 4.5B, and 4.5C are implemented, deterministic quality gates pass, and real Windows + Cloudflare admin/MFA/device/confirmation/mobile acceptance is recorded. Implementation alone is not sufficient to close the phase.
