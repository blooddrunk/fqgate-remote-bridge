# Development Roadmap

This roadmap is ordered to reduce risk before Internet exposure. The repository has closed the local lifecycle, local operator UI, upgrade center, runtime API discovery, and authenticated remote human access milestones while preserving loopback-only origin services and deny-by-default operation policy.

## Current state

- Phase 0: **CLOSED**
- Phase 1: **CLOSED**
- Phase 2: **CLOSED**
- Phase 3: **CLOSED**
- Phase 4: **CLOSED**
- Phase 4.5: **PLANNED**
- Phase 5+: planned only

Current deployed topology remains:

```text
remote human browser
  -> Cloudflare Access
  -> remotely-managed Cloudflare Tunnel
  -> cloudflared Windows service
  -> 127.0.0.1:17282 bridge
  -> explicit remote-human operation exposure policy
  -> FQGate adapters
  -> 127.0.0.1:17281 FQGate
```

There is never an intended `cloudflared -> FQGate` direct route.

---

## Phase 0 — Repository and contracts

Status: **CLOSED**.

Delivered repository structure, architecture/security contracts, compatibility ledger, TypeScript/config/logging/CI baseline, and secret-safe defaults.

## Phase 1 — Local FQGate lifecycle manager

Status: **CLOSED**.

Delivered trusted FQGate installation/update primitives, integrity checks, process lifecycle, health/compatibility validation, rollback, and Windows x64 acceptance.

## Phase 2 — Local TanStack bridge API and QR login UI

Status: **CLOSED**.

Delivered the loopback-only TanStack Start application, React 19/TanStack Query Dashboard, explicit operation registry, FQGate QR adapters, ephemeral QR registry, Chinese operator UX, Windows launcher, automated tests, and real Windows QR acceptance.

Security baseline retained by every later phase: no catch-all proxy, no trading/state-changing financial operation, no wildcard CORS, no raw `/v1/market/*` fallback, and no browser exposure of upstream QR flow IDs/secrets.

## Phase 3 — Local upgrade center and runtime OpenAPI/docs foundation

Status: **CLOSED**.

Delivered:

- local `/updates` explicit check/plan/apply workflow reusing the lifecycle transaction;
- fixed trusted GitHub release source, stale-plan rejection, concurrency protection, size/SHA/version/compatibility/health/rollback checks;
- fixed-target runtime `http://127.0.0.1:17281/openapi.json` discovery with bounded fetch, validation, cache, deterministic fingerprint, operation catalog/diff, and required-contract checks;
- candidate activation gating on health + runtime OpenAPI + required Bridge contracts + semantic probes;
- local `/api-reference` separating complete upstream reference, Bridge API, and compatibility/change views;
- deny-by-default behavior where discovery never authorizes a route;
- target Windows x64 acceptance recorded in `docs/operations/windows-phase-3-acceptance.md`.

Detailed closed task package:

`docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`

---

## Phase 4 — Secure remote human access: Cloudflare Tunnel + Access

Status: **CLOSED**.

Delivered selected authenticated remote human Dashboard/QR/status/reference access while preserving loopback-only FQGate/Bridge listeners and a server-side operation allowlist.

Remote-human allowed operations remain:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

The following remain local-only until the separately reviewed Phase 4.5C admin boundary is implemented and accepted:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Phase 4 uses a pre-created remotely-managed Tunnel, Cloudflare Access human policy, fixed loopback Bridge origin, protected token file, fixed-source cloudflared lifecycle, unknown-Host fail-closed handling, and assertion-presence defense-in-depth. The real Windows x64 + Cloudflare acceptance was completed on 2026-09-17.

Historical artifacts:

- `docs/plans/phase-4-secure-remote-human-access.md`
- `docs/tasks/phase-4-cloudflare-tunnel-access.md`
- `docs/prompts/phase-4-codex-goal.md`
- `docs/status/phase-4-implementation-handoff.md`
- `docs/operations/windows-phase-4-acceptance.md`

Phase 4 remains closed; future work must not retroactively expand its contract.

---

## Phase 4.5 — Remote administrator hardening + mobile Dashboard

Status: **PLANNED**.

Goal: introduce a separately authenticated and separately authorized remote-administrator context for a very small existing maintenance surface, and optimize the existing React/TanStack Dashboard for phone use, without weakening Phase 4 or implementing Phase 5 market-data APIs.

Detailed design:

`docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

Detailed task package:

`docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`

Codex handoff:

`docs/prompts/phase-4-5-codex-goal.md`

### 4.5A — Policy/authentication foundation, no privilege expansion

Refactor caller context and operation authorization into orthogonal policy dimensions so the project can represent:

```text
local
remote_human
remote_admin
later: remote_machine
```

without combinatorial exposure enums.

Add a distinct admin hostname and distinct Cloudflare Access application/audience. Remote-admin requests require stronger origin-side Cloudflare Access JWT verification with exact issuer/AUD/signature/time checks and bounded fixed-source JWK handling. The admin Access application must be human-only, require MFA, enforce device posture, use a short administrative session, enable Protect with Access, and contain no Bypass/Service Auth path.

At the end of 4.5A there is **no maintenance privilege expansion**: remote admin may use only the same safe surface as the current remote human. This checkpoint must land before any admin mutation becomes remotely callable.

### 4.5B — Mobile Dashboard optimization, no authorization changes

Keep one React 19/TanStack Start application and existing routes. Optimize Dashboard, QR login, update view, and API reference for ~360px+ viewports, touch targets, bounded long content, safe responsive navigation, mobile viewport/safe-area behavior, keyboard/focus usability, and phone/tablet Playwright coverage.

Responsive UI must never become an authorization mechanism. Ordinary remote-human update behavior remains read-only.

### 4.5C — Minimal remote-admin maintenance + second confirmation

Only after 4.5A/4.5B are stable, permit strongly authenticated remote admin to call exactly:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

`updates.apply` additionally requires a short-lived, one-time, server-side confirmation grant bound to verified admin principal, admin audience, operation, and exact update plan/candidate identity. Existing stale-plan/source/version/size/hash/compatibility/health/rollback checks remain mandatory and additive.

Remote-admin control POSTs also require explicit browser-origin/CSRF protections. cloudflared management, Tunnel-token operations, Cloudflare provisioning, arbitrary process/service control, raw FQGate routes, Bridge self-update, and market-data operations remain outside remote admin.

### Phase 4.5 exit criteria

Phase 4.5 may close only when:

1. Phase 4 remote-human behavior is preserved;
2. admin hostname/AUD/context is independently authenticated and authorized;
3. MFA + device posture + short-session admin Access policy is live;
4. Bridge validates real admin Access JWTs without logging them;
5. mobile Dashboard requirements and viewport tests pass;
6. only the four listed maintenance operations gain remote-admin permission;
7. remote `updates.apply` requires one-time principal/action/plan-bound confirmation and rejects expiry/replay/mismatch;
8. CSRF/origin defenses are tested;
9. all deterministic quality gates pass;
10. real Windows x64 + Cloudflare acceptance re-proves loopback-only listeners, ordinary-human denial, device-policy denial, admin flow, confirmation flow, raw-path denial, local maintenance, and mobile-browser smoke behavior;
11. one known-safe real remote-admin update apply is proven, or the phase remains open if no safe candidate is available.

Phase 4.5 non-goals include Phase 5 machine APIs/service tokens, Phase 6 provisioning, supervisor/notifications, automatic updates, MCP/WebSocket, final packaging, generic remote shell/process control, and any financial state-changing capability.

---

## Phase 5 — Remote read-only HTTP API and filtered API docs

Status: planned after the Phase 4.5 policy foundation.

Goal: make selected market-data capabilities safely consumable by remote software.

Deliverables:

- a distinct `remote_machine` caller context;
- a separate machine/API hostname and separate Cloudflare Access application/policy/audience;
- Cloudflare Access service-token or equivalent machine identity separate from human/admin policies;
- explicit read-only market-data operations in the Bridge registry;
- stable Bridge-owned request/response contracts;
- machine API smoke tests through Access + Tunnel;
- generated remote OpenAPI containing only approved public operations;
- interactive docs targeting only approved Bridge operations;
- compatibility gates tied to validated FQGate versions/contracts.

A Phase 5 machine identity must never inherit QR/session maintenance, update/admin operations, OpenAPI refresh, or browser confirmation grants. Runtime upstream OpenAPI still cannot authorize a route.

Phase 5 may reuse generic JWT/JWK/context infrastructure from Phase 4.5A only when hostname, Access app/audience, identity type, operation allowlist, configuration, and tests remain independent.

Exit criteria include authenticated machine access to approved read-only operations, deny-by-default treatment of new upstream paths, and no financial state-changing capabilities.

---

## Phase 6 — Automated Cloudflare provisioning and drift management

Goal: automate the manually proven Phase 4/4.5/5 setup safely.

Deliverables:

- scoped Cloudflare API token validation;
- account/zone validation;
- create/adopt named Tunnel;
- create/adopt DNS records;
- configure ingress/published applications and Access prerequisites where supported;
- plan/dry-run before mutation;
- drift detection;
- setup-time credentials removable after provisioning.

Never request a Global API Key.

## Phase 7 — Supervisor, recovery, audit trail, notifications

Goal: make the system dependable on an always-on Windows PC with bounded recovery, session/tunnel monitoring, redacted event journal, webhook notification provider, deduplication/cooldown, and recovery events.

## Phase 8 — Safe automatic updates

Goal: add conservative configurable update policy only after manual local and remote-admin update workflows are proven stable. Automatic updates remain off by default until explicitly configured.

## Phase 9 — MCP and realtime WebSocket compatibility

Goal: investigate and expose richer protocols only after the read-only HTTP security model is stable, with no generic transport tunnel around operation policy.

## Phase 10 — Packaging and operator UX

Goal: versioned Windows release artifact, install/uninstall/reconfigure flow, startup integration where proven, redacted diagnostics, configuration migration, release checksums, and troubleshooting documentation.

## Future / optional

- multiple FQGate hosts/failover;
- LAN-only deployment mode;
- alternative secure overlays such as Tailscale/Headscale;
- multiple notification providers;
- Prometheus/metrics exporter;
- consumer-specific adapters such as `turtle-value-engine` integration.

## Current development handoff

Phase 4 is closed. The next planned implementation package is Phase 4.5:

`docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`

The design source is:

`docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

The implementation handoff is:

`docs/prompts/phase-4-5-codex-goal.md`

Do not implement Phase 5 machine market-data APIs, service-token auth, automated Cloudflare provisioning, supervisor/notifications, automatic updates, MCP/WebSocket, or packaging inside the Phase 4.5 goal.
