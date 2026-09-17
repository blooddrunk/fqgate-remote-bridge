# Development Roadmap

This roadmap is ordered to reduce risk before Internet exposure. The repository has closed the local lifecycle, local operator UI, upgrade center, runtime API discovery, and authenticated remote human access milestones while preserving loopback-only origin services and deny-by-default operation policy.

## Current state

- Phase 0: **CLOSED**
- Phase 1: **CLOSED**
- Phase 2: **CLOSED**
- Phase 3: **CLOSED**
- Phase 4: **CLOSED**
- Phase 5+: planned only

Current local deployment:

```text
browser
  -> 127.0.0.1:17282  FQGate Remote Bridge / TanStack Dashboard
       -> explicit bridge operation registry
       -> lifecycle/update/OpenAPI/QR services
            -> 127.0.0.1:17281  FQGate
```

Phase 4 target adds outbound-only Cloudflare connectivity without changing either loopback listener:

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

Goal: expose selected human-facing Dashboard/QR/status/reference capabilities remotely without exposing FQGate, without changing the bridge's loopback bind, and without turning Phase 3 local maintenance into remotely callable administration.

### 4A. Explicit local vs remote-human request context

Evolve operation exposure from the Phase 3 all-local model.

Remote-human allowed operations for Phase 4:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

Operations that remain local-only:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Requirements:

- authorization enforced by the bridge operation policy, not UI hiding alone;
- loopback Host forms classify local requests;
- exactly configured remote hostname classifies candidate remote-human requests;
- unknown Host fails closed;
- forwarding headers such as `X-Forwarded-Host` do not grant context;
- remote-human requests require the expected Cloudflare Access assertion after Cloudflare validation;
- Access assertion contents are never logged.

### 4B. Remotely-managed Tunnel and cloudflared Windows service

Deliverables:

- framework-agnostic cloudflared release/lifecycle manager;
- fixed official Cloudflare distribution source only, no arbitrary binary URL;
- artifact/release identity and published integrity verification;
- explicit/manual install/update only;
- Windows service install/start/stop/restart/status;
- origin fixed to `http://127.0.0.1:17282` and never FQGate;
- reconnect/diagnostics behavior suitable for an always-on Windows host.

Phase 4 adopts a **pre-created remotely-managed Tunnel token**. Automated creation/adoption of Cloudflare resources through the API remains Phase 6.

### 4C. Tunnel token secret handling

Preferred service runtime:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Requirements:

- supported cloudflared version with `--token-file`;
- token outside repository and ordinary application JSON;
- restrictive Windows ACL for the service identity;
- raw token absent from service command line, logs, diagnostics, UI, tests, and browser storage;
- inability to secure/read the secret is a blocking setup error.

### 4D. Cloudflare Access human policy

The operator manually creates/configures the self-hosted Access application and human Allow policy.

The Tunnel published application must use Cloudflare's **Protect with Access** origin setting so cloudflared validates the Access JWT before forwarding requests to the bridge.

The bridge retains its own operation authorization after Access succeeds. Cloudflare identity never implies permission to call local-only operations.

### 4E. Remote operator UX

Authenticated remote humans may use:

- Dashboard/status;
- QR begin/poll;
- read-only update status;
- reference-only API catalog.

Remote UI must omit/disable update check/plan/apply and OpenAPI refresh, with clear local-maintenance messaging. No market-data API is added in this phase.

### Phase 4 implementation checkpoint

The current implementation has delivered the framework-agnostic and local
pieces of this package:

- request Host/context classification and server-side operation exposure gate;
- exact local/remote-human matrix with Access assertion-presence defense in depth;
- remote-safe React UI using the existing TanStack shell;
- fixed-source cloudflared release parser/downloader, candidate identity checks,
  protected token-file abstraction, and Windows `sc.exe` service adapter;
- explicit `cloudflared` CLI lifecycle/status commands and Phase 4 acceptance
  script mode;
- deterministic Phase 4 tests alongside the Phase 2/3 regression suite.

The operator completed the real Windows x64 + Cloudflare Tunnel/Access
acceptance on 2026-09-17. The bounded evidence is recorded in
`docs/operations/windows-phase-4-acceptance.md` and
`docs/status/phase-4-implementation-handoff.md`; Phase 4 is **CLOSED**.
Future remote-administrator hardening and mobile Dashboard UI work are
planning items only and do not reopen or expand this phase.

### Phase 4 exit criteria

On the target Windows x64 host with real Cloudflare resources:

1. FQGate remains exactly on loopback and bridge remains exactly on loopback;
2. cloudflared runs as a Windows service and routes only to the bridge;
3. service/process metadata contains no raw Tunnel token and token-file protection is verified;
4. unauthenticated public requests are challenged/denied by Access;
5. authenticated human Dashboard/status works remotely;
6. QR begin/poll works remotely when safe to test;
7. remote update check/plan/apply and OpenAPI refresh are denied;
8. raw/unregistered FQGate paths remain unreachable remotely;
9. local-only maintenance remains usable through loopback;
10. restarting cloudflared reconnects without changing origin listeners.

The historical closure rule was that implementation alone could not close the
phase when real Cloudflare acceptance was unavailable. The current repository
records that live acceptance as complete.

Detailed design:

`docs/plans/phase-4-secure-remote-human-access.md`

Detailed task package:

`docs/tasks/phase-4-cloudflare-tunnel-access.md`

Codex handoff:

`docs/prompts/phase-4-codex-goal.md`

### Phase 4 non-goals

- remote machine/read-only market-data API;
- Cloudflare Access service-token machine auth;
- automated Tunnel/DNS/Access provisioning;
- supervisor/notifications;
- automatic background updates;
- MCP/WebSocket;
- trading or financial state mutation.

### Deferred future plan candidates

These items are intentionally not implemented in Phase 4:

- separately design a remote-administrator policy with stronger authentication,
  device restrictions, and explicit second confirmation; and
- optimize the existing Dashboard UI for mobile screens while preserving the
  current React/TanStack shell and server-side operation policy.

---

## Phase 5 — Remote read-only HTTP API and filtered API docs

Goal: make selected market-data capabilities safely consumable by remote software.

Deliverables:

- explicit read-only market-data operations in the bridge policy registry;
- stable Bridge-owned request/response contracts;
- Cloudflare Access service-token or equivalent machine policy separate from human UI policy;
- machine API smoke tests through Access + Tunnel;
- generated remote OpenAPI containing only approved public operations;
- interactive docs target only approved Bridge operations;
- compatibility gates tied to validated FQGate versions/contracts.

Exit criteria include authenticated machine access to approved read-only operations, deny-by-default treatment of new upstream paths, and no financial state-changing capabilities.

## Phase 6 — Automated Cloudflare provisioning and drift management

Goal: automate the manually proven Phase 4/5 setup safely.

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

Goal: add conservative configurable update policy only after manual FQGate/cloudflared updates are proven stable. Automatic updates remain off by default until explicitly configured.

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

Phase 4 is closed; there is no active Phase 4 coding task. Future work must
start from a new task package and preserve the closed boundary.

Use:

`docs/prompts/phase-4-codex-goal.md`

Phase 5 remote machine market-data APIs, service-token auth, automated
Cloudflare provisioning, supervisor/notifications, automatic-update policy,
MCP, WebSocket, and final packaging remain future roadmap work; closing Phase 4
does not authorize implementing them without a separate task package.
