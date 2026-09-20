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
- Preserve all closed Phase 0/1/2/3/4/4.5 behavior while implementing Phase 5-A.

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

Phase 4.5A policy/authentication foundation, Phase 4.5B mobile work, and
Phase 4.5C's narrow remote-admin maintenance and one-time apply confirmation
are implemented and passed live Windows x64 + Cloudflare acceptance on
2026-09-19. Phase 4.5 is closed; Phase 5-A is closed at the zero-privilege
checkpoint, while Phase 5-B market-data APIs remain unimplemented.

For `local` and ordinary `remote_human` callers, the following remain
local-only. The implemented `remote_admin` context may invoke exactly these
four operations only after its independent JWT, Origin/intent, and (for
`updates.apply`) one-time confirmation checks pass:

- `updates.check`
- `updates.plan`
- `updates.apply`
- `openapi.refresh`

The 4.5A policy intentionally recognizes a verified `remote_admin` caller for
the same safe Phase 4 surface only. It does not grant any of the four
maintenance operations remotely.

## Active Phase 5-B contract / Phase 5-A closed baseline

Phase 5-A is closed. It established a distinct remote_machine identity/context
and proved real service-token authentication while granting zero existing
Bridge operations.

The active implementation task is now Phase 5-B: live FQGate contract census
plus the first minimal read-only market-data slice.

Read these active artifacts before changing code:

- docs/plans/phase-5-remote-machine-read-only-api.md
- docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md
- docs/prompts/phase-5-b-codex-goal.md
- docs/status/phase-5-a-implementation-handoff.md
- docs/operations/windows-phase-5-a-acceptance.md

The permanent Windows verification environment is under D:\\code\\research.
Agents must resolve and use the existing repository working tree there for
Windows/live census and acceptance rather than inventing a temporary checkout.
Automate every machine-verifiable check.

Phase 5-B must inspect the running target FQGate before selecting any market
operation. Runtime OpenAPI is evidence only; it never authorizes a route. The
task may implement at most two evidence-backed, explicitly read-only operations.
Their allowed contexts must be exactly local and remote_machine. Existing
remote_human/remote_admin permissions remain unchanged and remote_machine must
continue to be denied every old QR/session/update/admin/openapi-refresh
operation.

The Phase 5-A machine claim profile remains unchanged: service-token
application JWTs use type=app, a bounded non-empty common_name, empty sub, exact
machine AUD/issuer/time checks, and kind=machine. Human/admin claim validation
must not be relaxed.

The Phase 5-A closure evidence remains authoritative historical baseline. Do
not rewrite it to imply that market-data privileges existed in Phase 5-A.

For Phase 5-B, the existing machine Access application and Tunnel are reused;
Cloudflare provisioning remains Phase 6. The only expected human boundaries are
hidden service-token entry for real remote smoke and, only when required by the
live FQGate market contract, physical QR login approval. Both boundaries must
follow the exact steps in the Phase 5-B task package and automation must resume
immediately afterwards.

## Closed Phase 4.5 contract

The active closure task package is:

`docs/tasks/phase-4-5-closure-and-phase-5-foundation.md`

The Phase 4.5 implementation package remains historical/current evidence context:

`docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`

The active Codex closure handoff is:

`docs/prompts/phase-4-5-closure-and-phase-5-foundation-codex-goal.md`

The primary design note is:

`docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

The Codex handoff is:

`docs/prompts/phase-4-5-codex-goal.md`

The repeatable Windows/Cloudflare operator procedure is the Chinese
long-lived reference (including new-instance, multi-instance, reconfiguration,
and OpenWrt/daed/passwall2-compatible Posture-only guidance):

`docs/operations/windows-phase-4-5-remote-admin-setup.md`

The plain-language acceptance procedure is:

`docs/operations/windows-phase-4-5-acceptance-simple.md`

The bounded in-memory authenticated request companion is:

`scripts/windows/phase45-authenticated-acceptance.mjs`

It is invoked explicitly by
`scripts/windows/phase45-acceptance.ps1 -RunAuthenticatedBrowserMatrix`; it never persists or prints browser
credentials/assertions, QR/session material, confirmation grants, or calls
`updates.apply`.

The future multi-account/profile design is deliberately separate and
unimplemented:

`docs/plans/future-multi-profile-account-isolation.md`

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

The admin Access application must be human-only and must require stronger controls than Phase 4 ordinary human access. The current operator-approved live profile is the low-friction variant documented in `docs/operations/windows-phase-4-5-remote-admin-setup.md`:

- intended operator identity/group;
- MFA or equivalent independent Access MFA requirement;
- short admin session;
- Protect with Access;
- no Bypass policy;
- no Service Auth policy.

For the current live instance, WARP, client certificates, hostname mTLS, and device posture
are deliberately not required. This is an explicit operator-approved deployment-profile
change for OpenWrt/daed/passwall2 compatibility; it does not remove Bridge-side JWT,
Origin/intent, operation-registry, one-time apply, integrity, health, or rollback checks.
Do not silently apply this reduced profile to a future `remote_machine` context.

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

Status: implemented and live-accepted; Phase 4.5 is CLOSED.

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

Remote-admin browser control POSTs, including the existing QR session POSTs, must also receive explicit CSRF/origin protection with exact expected HTTPS admin Origin, no wildcard CORS, and a Bridge-owned custom intent/confirmation mechanism that cross-site forms cannot generate. Do not break local loopback CLI/browser maintenance semantics.

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
- remote-admin requests additionally require Bridge-side RS256 validation against the exact issuer and audience, using only the bounded cache derived from the configured Cloudflare team-domain cert endpoint;
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

Target Windows x64 + Cloudflare acceptance must additionally prove the approved admin MFA/edge policy, wrong-app denial, real admin JWT validation, remote-admin maintenance behavior, one-time apply confirmation, continued loopback-only listeners, raw-path denial, local-maintenance preservation, and real mobile-browser usability.

If there is no known-safe real update candidate for proving remote `updates.apply`, document the missing evidence and keep Phase 4.5 open rather than fabricating closure.

## Development sequence

Follow `docs/roadmap.md`.

- Phase 0: CLOSED
- Phase 1: CLOSED
- Phase 2: CLOSED
- Phase 3: CLOSED
- Phase 4: CLOSED
- Phase 4.5A: implemented
- Phase 4.5B: implemented
- Phase 4.5C: implemented and live accepted; Phase 4.5 CLOSED
- Phase 5-A: CLOSED — remote-machine identity/context with zero operation privileges
- Phase 5-B: ACTIVE — live contract census + first minimal read-only market slice
- Phase 5-C+: do not opportunistically implement

Phase 5-B is a separate privilege-expansion change. It must use the live permanent-Windows FQGate runtime as contract authority, add at most two evidence-backed read-only operations, and keep machine Host/AUD/context/tests independent from human/admin policy. Do not combine remote-admin and remote-machine privilege expansion.

## Documentation rule

When implementation changes the security boundary, request-context model, Cloudflare assumptions, admin JWT validation, confirmation model, mobile operator workflow, runtime topology, Windows/token behavior, or phase completion state, update the corresponding source-of-truth documentation in the same change.

Phase 4 historical docs remain historical; do not rewrite them to imply remote administration existed in Phase 4.
