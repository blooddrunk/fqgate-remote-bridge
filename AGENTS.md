# AGENTS.md

This file is the working contract for coding agents contributing to `fqgate-remote-bridge`.

## Source of truth

Before implementing anything, read in this order:

1. `README.md`
2. `docs/architecture.md`
3. `docs/security.md`
4. `docs/upstream-contracts.md`
5. `docs/roadmap.md`
6. the active phase task package under `docs/tasks/`
7. relevant design notes under `docs/plans/`
8. `docs/agent-guide.md`

If implementation ideas conflict with those documents, update the design explicitly before changing behavior.

## Project intent

The project securely exposes selected **read-only FQGate market-data capabilities and login/session operations** from an always-on Windows PC through a controlled local bridge. FQGate itself remains local-first and must never become Internet-facing.

It is an independent infrastructure/adapter project. It must not make `turtle-value-engine` or any other consumer depend exclusively on FQGate.

## Non-negotiable rules

- Keep FQGate bound to IPv4 loopback, normally `127.0.0.1:17281`.
- Keep the bridge bound to IPv4 loopback, normally `127.0.0.1:17282`.
- Never create a LAN/WAN listener or router port-forward for either service.
- Never create a generic catch-all reverse proxy to FQGate.
- New upstream FQGate endpoints are denied until explicitly implemented and registered.
- Runtime `/openapi.json` is a description/discovery source, never an authorization source.
- Do not expose trading, order, cancellation, fund-transfer, brokerage-control, or other state-changing financial endpoints.
- Do not request a Cloudflare Global API Key. Automated Tunnel/DNS/Access provisioning belongs to Phase 6.
- Do not commit Tunnel tokens, Access assertions/secrets, QR payloads, login/session material, remote-admin confirmation grants, or other credentials.
- Preserve all closed Phase 0/1/2/3/4 behavior while adding Phase 4.5.

## Completed baseline

Phase 0 through Phase 4 are closed.

The current application uses Node.js 22+, TypeScript, pnpm, React 19, TanStack Start/Router/Query, Vite, Tailwind CSS v4, and shadcn/ui. TanStack Start is a replaceable transport/UI shell: lifecycle, compatibility, OpenAPI discovery, remote-exposure policy, cloudflared lifecycle, QR policy, and FQGate protocol logic must stay framework-agnostic.

Phase 3 delivered the local update center and runtime OpenAPI/API Reference. Phase 4 delivered authenticated remote-human Dashboard/QR/status/reference access through Cloudflare Tunnel + Access while keeping FQGate and Bridge loopback-only.

Phase 4 remote-human operations remain:

- `bridge.version`
- `bridge.capabilities`
- `bridge.status`
- `session.qr.begin`
- `session.qr.poll`
- `updates.status`
- `openapi.catalog`

The following remain local-only until the separately reviewed Phase 4.5C remote-admin boundary is implemented and accepted:

- `updates.check`
- `updates.plan`
- `updates.apply`
- `openapi.refresh`

## Active Phase 4.5 contract

The active task package is:

`docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`

The primary design note is:

`docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

The Codex handoff is:

`docs/prompts/phase-4-5-codex-goal.md`

Phase 4.5 has two goals that must remain separable:

1. add a distinct, strongly authenticated `remote_admin` context for a very small existing maintenance surface; and
2. optimize the existing React/TanStack Dashboard for mobile screens without creating a second frontend.

Phase 4.5 must not implement Phase 5 market-data APIs or machine/service-token access.

### Phase 4.5A — policy/authentication foundation, no privilege expansion

Evolve the policy model so caller context and operation permission are orthogonal. Do not solve new contexts by adding combinatorial exposure enum names.

The model must be capable of representing:

- `local`
- `remote_human`
- `remote_admin`
- later `remote_machine`

Remote admin uses a hostname and Cloudflare Access application/audience distinct from the ordinary remote-human application.

For `remote_admin`, the Bridge must cryptographically validate `Cf-Access-Jwt-Assertion` using a maintained JWT/JWK library with:

- RS256 signature validation;
- exact issuer/team domain validation;
- exact admin application audience validation;
- temporal-claim validation;
- `kid`/key-rotation support;
- bounded cached JWK/cert retrieval only from the fixed endpoint derived from the configured Cloudflare team domain;
- no arbitrary JWK URL input;
- fail-closed behavior;
- no assertion/JWT logging or persistence.

The verified principal should be reduced to minimal identity metadata needed for authorization/confirmation binding.

The admin Access application must be human-only and must require stronger controls than Phase 4 ordinary human access:

- intended operator identity/group;
- MFA or equivalent independent Access MFA requirement;
- enforceable device posture;
- short admin session;
- Protect with Access;
- no Bypass policy;
- no Service Auth policy.

At the end of 4.5A, `remote_admin` gains **no maintenance privilege**. It may use only the same safe surface as current `remote_human`. All four maintenance operations remain remotely denied.

### Phase 4.5B — mobile Dashboard optimization

Reuse the existing React/TanStack application and current routes:

- `/`
- `/login`
- `/updates`
- `/api-reference`

Do not create `/mobile`, a second route tree, native app, duplicated client API, or authorization path.

Mobile work must include narrow-screen navigation, phone-friendly status layout, scan-friendly QR presentation, touch-friendly controls, bounded long content, mobile viewport/safe-area behavior, and keyboard/focus/accessibility preservation. Responsive rendering must never decide authorization.

Ordinary remote-human `/updates` remains read-only.

### Phase 4.5C — minimal remote-admin surface and second confirmation

Only after 4.5A and 4.5B are stable may `remote_admin` be granted these existing operations:

- `updates.check`
- `updates.plan`
- `updates.apply`
- `openapi.refresh`

No additional remote administrative surface is implied.

`updates.apply` additionally requires a short-lived, one-time, server-side confirmation grant bound to:

- verified admin principal;
- admin audience;
- exact operation ID;
- exact update plan/candidate identity.

The grant must be memory-only, bounded, cryptographically random, atomically single-use, short-lived, invalidated on restart, and denied on expiry/replay/principal mismatch/operation mismatch/plan mismatch. It must never be logged or placed in persistent browser storage.

The existing stale-plan, release-source, version, size, SHA-256, compatibility, health, rollback, and concurrency protections remain mandatory and additive.

Remote-admin browser control POSTs must also receive explicit CSRF/origin protection with exact expected HTTPS admin Origin, no wildcard CORS, and a Bridge-owned custom intent/confirmation mechanism that cross-site forms cannot generate. Do not break local loopback CLI/browser maintenance semantics.

### What stays local even for remote admin

Do not remotely expose:

- cloudflared install/update/service install/reconfigure/restart;
- Tunnel token creation/read/ACL modification;
- Cloudflare Tunnel/DNS/Access provisioning;
- arbitrary Windows process/service control;
- arbitrary FQGate paths;
- Bridge self-update;
- trading or financial state-changing operations.

Cloudflare provisioning remains Phase 6.

## Relationship to Phase 5

Phase 5 is a separate remote-machine read-only market-data milestone.

The Phase 4.5A policy model should make it possible to add `remote_machine` later, but Phase 4.5 must not add the machine API itself.

Phase 5 must use a separate machine/API hostname, separate Access application/policy/audience, and machine/service identity. It must not reuse remote-admin MFA/device policy or browser confirmation grants. A machine identity must never inherit QR/session/update/OpenAPI-refresh/admin permissions.

Generic JWT/JWK/context plumbing may be reused only if host/AUD/configuration/caller-type/operation allowlist/tests remain separate.

## Request-context rules

Preserve existing Phase 4 rules:

- loopback Host/origin accepted as local context;
- exactly configured ordinary remote hostname maps to remote-human;
- exactly configured admin hostname maps only to a candidate remote-admin context;
- unknown Host fails closed;
- `X-Forwarded-Host`, `Forwarded`, source IP, and similar metadata do not grant context;
- ordinary remote-human requests continue to require the expected Access assertion after Tunnel Protect with Access validation;
- remote-admin requests additionally require Bridge-side cryptographic validation;
- assertion/JWT values are never logged.

Apply the same boundary at the Bridge API handler and top-level TanStack/Nitro request entry so page/static routes cannot bypass the context gate.

## cloudflared rules

Phase 4.5 does not change the existing cloudflared security contract:

- remotely-managed Tunnel;
- origin only `http://127.0.0.1:17282`;
- never FQGate port `17281`;
- fixed official Cloudflare release source;
- explicit/manual install/update;
- token-file service invocation;
- repo-external protected token file;
- raw token absent from config/logs/UI/browser/tests/Git;
- PowerShell limited to Windows bootstrap/service/ACL integration;
- no Cloudflare API provisioning in this phase.

Multiple published hostnames may share the same Tunnel only when each hostname has its own intended Access application/policy and all still point to the same Bridge loopback origin.

## Architecture constraints

Keep separate, testable modules/interfaces for:

- FQGate release source / compatibility / lifecycle;
- FQGate API adapters;
- runtime FQGate OpenAPI discovery;
- bridge request-context classification;
- Access JWT/JWK verification;
- bridge operation/policy registry;
- remote-admin confirmation service;
- QR flow registry;
- TanStack Start route/UI transport;
- cloudflared release/lifecycle/service management;
- secret/token storage abstraction;
- Cloudflare provisioning (Phase 6, not Phase 4.5);
- supervisor and notification providers (later phases).

Route files and React components must remain thin. They must not own authorization, JWT verification, confirmation authority, Tunnel-token handling, Windows service lifecycle, upstream parsing, or update transactions.

## Testing expectations

Normal CI must not require real FQGate login or Cloudflare credentials. Use deterministic fixtures/fakes.

Phase 4.5 automated coverage should include at least:

- local / remote-human / remote-admin Host/context classification;
- unknown Host denial;
- forwarded-host spoofing denial;
- invalid duplicate human/admin host configuration;
- remote-admin assertion missing denial;
- valid admin JWT with deterministic fake JWK;
- bad signature / wrong issuer / wrong audience / expired / not-yet-valid / unknown `kid` denial;
- JWK fetch/cache/failure/key-rotation behavior;
- assertion/JWT redaction;
- complete context x operation matrix;
- current Phase 4 remote-human regressions;
- confirmation issuance, TTL cleanup, replay, concurrent double consume, principal mismatch, operation mismatch, plan mismatch;
- exact admin Origin/CSRF rules;
- no wildcard CORS;
- mobile viewport coverage at 360x800, 390x844, 430x932, 768x1024 and desktop regression;
- direct forbidden-operation tests independent of UI visibility.

Target Windows x64 + Cloudflare acceptance must additionally prove admin MFA/device policy, wrong-app denial, real admin JWT validation, remote-admin maintenance behavior, one-time apply confirmation, continued loopback-only listeners, raw-path denial, local-maintenance preservation, and real mobile-browser usability.

If there is no known-safe real update candidate for proving remote `updates.apply`, document the missing evidence and keep Phase 4.5 open rather than fabricating closure.

## Development sequence

Follow `docs/roadmap.md`.

- Phase 0: CLOSED
- Phase 1: CLOSED
- Phase 2: CLOSED
- Phase 3: CLOSED
- Phase 4: CLOSED
- Phase 4.5A: next implementation checkpoint
- Phase 4.5B: after 4.5A
- Phase 4.5C: after 4.5A/4.5B
- Phase 5+: do not opportunistically implement

If Phase 5 becomes urgent, it may start only after the 4.5A policy foundation is stable, and must remain a separate change with separate machine Host/AUD/context/tests. Do not combine remote-admin and remote-machine privilege expansion.

## Documentation rule

When implementation changes the security boundary, request-context model, Cloudflare assumptions, admin JWT validation, confirmation model, mobile operator workflow, runtime topology, Windows/token behavior, or phase completion state, update the corresponding source-of-truth documentation in the same change.

Phase 4 historical docs remain historical; do not rewrite them to imply remote administration existed in Phase 4.
