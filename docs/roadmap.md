# Development Roadmap

This roadmap is ordered to reduce risk before Internet exposure. The repository has
closed the local lifecycle, upgrade center, and runtime API discovery milestones.
Later phases must remain separately scoped and everything proven here remains
loopback-only.

## Current state

- Phase 0: **CLOSED**
- Phase 1: **CLOSED**
- Phase 2: **CLOSED**
- Phase 3: **CLOSED**
- Phase 4+: planned only

The current local deployment remains:

```text
browser
  -> 127.0.0.1:17282  FQGate Remote Bridge / TanStack Dashboard
       -> explicit bridge operation registry
       -> FQGate adapters
            -> 127.0.0.1:17281  FQGate
```

Neither FQGate nor the bridge should gain LAN or public listeners in Phase 3.

---

## Phase 0 — Repository and contracts

Status: **fully closed**.

Delivered the repository structure, architecture/security contracts, upstream compatibility ledger, TypeScript workspace, configuration schema, structured logging conventions, CI baseline, and secret-safe defaults.

## Phase 1 — Local FQGate lifecycle manager

Status: **fully closed**.

Delivered safe FQGate installation/update primitives, official manifest handling, size/SHA-256 verification, process lifecycle, health probing, rollback, version/compatibility checks, and Windows x64 acceptance.

## Phase 2 — Local TanStack bridge API and QR login UI

Status: **fully closed**.

Delivered the loopback-only TanStack Start application, React 19/TanStack Query Dashboard, explicit operation registry, normalized errors, FQGate QR begin/poll adapters, ephemeral QR flow registry, Chinese operator UX, Windows launcher, automated tests, and real Windows QR acceptance.

The Phase 2 boundary remains a required baseline for all later work: no catch-all FQGate proxy, no trading operations, no wildcard CORS, no raw `/v1/market/*` fallback, and no browser exposure of upstream QR flow IDs or secrets.

---

## Phase 3 — Local upgrade center and runtime OpenAPI/docs foundation

Status: **CLOSED / implementation and target Windows acceptance recorded**.

Goal: finish the local operational control plane before any Tunnel is introduced. The implementation combines the Dashboard upgrade workflow with runtime FQGate OpenAPI discovery so upgrades are checked against the API surface actually provided by the installed candidate. The implementation and bounded target Windows x64 evidence are recorded in `docs/operations/windows-phase-3-acceptance.md`.

### 3A. FQGate upgrade center

Deliverables:

- Dashboard card showing installed version, compatibility, selected release source, last explicit update check, available version, and blocking reason;
- explicit **Check for update** action; no background timer and no update check merely because a page loaded;
- explicit install/upgrade plan with source, target version, size, SHA-256, compatibility status, restart/session impact, and confirmation step;
- one lifecycle transaction shared by CLI and Dashboard; do not duplicate download/activation logic in route files;
- fixed release-source registry:
  - `github` remains the default official source;
  - architecture reserves a `gitee` adapter, but it must not accept arbitrary URLs and must not be enabled until an exact trusted mirror/repository contract is documented;
- bounded download, manifest validation, size/SHA-256 verification, candidate `--version`, compatibility gates, health probe, known-good backup, and rollback;
- concurrency/idempotency protection for double-clicks, refreshes, restart recovery, and overlapping install/update attempts;
- operator-visible transaction/result history containing bounded non-secret metadata only.

### 3B. Runtime OpenAPI and API documentation foundation

Observed upstream facts are now part of the project contract:

```text
http://127.0.0.1:17281/docs
http://127.0.0.1:17281/openapi.json
```

The upstream Python SDK explicitly says complete parameters and response fields should follow the running `/openapi.json`.

Deliverables:

- framework-agnostic `FqgateOpenApiService` (name may vary) that fetches only the fixed loopback `/openapi.json` endpoint;
- response timeout and maximum-size bounds;
- JSON/OpenAPI structure validation and normalized errors;
- short-TTL runtime cache plus deterministic schema fingerprint (for example SHA-256 over canonicalized JSON);
- an operator-facing local API documentation page using the **running FQGate schema as source of truth**;
- full upstream-reference view that can show every documented FQGate endpoint but does **not** imply authorization and does not provide a bypass around bridge policy;
- bridge/remote-contract view generated only from explicitly registered bridge operations/mappings;
- endpoint coverage/diff information: discovered upstream paths, bridge-approved mappings, unapproved/new paths, removed paths, and required-contract changes;
- reusable compatibility probe that verifies required paths/methods for bridge-owned FQGate adapters during install/upgrade activation.

The current implementation exposes `/updates` and `/api-reference`, keeps the
release source fixed to the official GitHub adapter, rejects stale plan
identities, and reuses the lifecycle `installPlan` transaction. Runtime OpenAPI
discovery remains reference-only and does not mutate the operation registry.

Important rule:

> Runtime OpenAPI describes what FQGate says it provides. The bridge registry decides what the bridge permits. Discovery never grants authorization.

The OpenAPI probe supplements endpoint-specific runtime contract tests; it does not replace them.

### Phase 3 non-goals

- Cloudflare Tunnel, Cloudflare Access, public/LAN listeners, DNS provisioning, or remote hostnames;
- generic `/* -> FQGate` proxying;
- remotely callable arbitrary paths merely because they appear in OpenAPI;
- MCP or WebSocket exposure;
- automatic/background FQGate updates;
- trading, brokerage, order, cancellation, transfer, or other financial state-changing capabilities.

### Phase 3 exit criteria

On the target Windows x64 host, an operator can:

1. inspect the installed FQGate version and explicitly check for a trusted update;
2. preview and explicitly confirm an installation/upgrade;
3. observe size/hash/version/compatibility/OpenAPI/health checks;
4. see automatic rollback after a deliberately invalid or incompatible candidate in the test harness;
5. open local runtime FQGate API documentation sourced from the currently running `/openapi.json`;
6. distinguish the full upstream API catalog from the bridge-approved API catalog;
7. prove that a newly discovered/unregistered FQGate endpoint remains unreachable through the bridge;
8. complete all of the above while both processes still listen on IPv4 loopback only.

Detailed task package:

`docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`

Design note:

`docs/plans/runtime-openapi-and-remote-docs.md`

Codex handoff:

`docs/prompts/phase-3-codex-goal.md`

---

## Phase 4 — Secure remote human access: cloudflared + Tunnel + Access

Goal: expose the already-proven local operator UI remotely without ever making FQGate itself Internet-facing.

This phase intentionally treats **Tunnel and human Access as one security milestone**. A remotely reachable QR/status UI must not be considered accepted while it is unauthenticated.

Deliverables:

- detect/install/update official `cloudflared`;
- adopt a pre-created remotely managed Tunnel token first;
- install/start/stop the Windows `cloudflared` service;
- route ingress only to the loopback bridge, never directly to FQGate;
- documented/manual Cloudflare Access human policy for the UI hostname;
- secret-safe tunnel credential storage;
- deployment diagnostics and Access-bypass checks;
- remote browser smoke test for status, QR login, upgrade status, and API reference pages;
- upstream full-reference docs may be visible to an authenticated human, but interactive execution must remain disabled unless an operation is explicitly bridge-approved.

Exit criteria:

- direct FQGate Internet access is absent;
- bridge still binds only to loopback;
- unauthenticated remote UI requests are denied by Access;
- an authenticated human can use the intended Dashboard and QR flow through Tunnel + Access;
- unknown/raw upstream paths remain unreachable.

---

## Phase 5 — Remote read-only HTTP API and filtered API docs

Goal: make selected market-data capabilities safely consumable by remote software.

Deliverables:

- explicit read-only market-data operations added to the bridge policy registry;
- stable public paths and normalized request/response contracts;
- Cloudflare Access service-token or equivalent machine policy separate from human UI policy;
- optional defense-in-depth Access JWT verification if practical;
- machine API smoke tests through Access + Tunnel;
- generated **remote OpenAPI** containing only bridge-approved public operations;
- remote interactive docs whose `Try it out` targets only the bridge-approved remote API;
- upstream-reference docs remain clearly labeled as reference-only and may list endpoints not remotely available;
- compatibility gates tie each public operation to validated FQGate versions/contracts.

Exit criteria:

- unauthenticated API calls are rejected;
- an authenticated service identity can use the approved read-only API;
- a path newly added by upstream FQGate is visible in reference/diff views but is not callable until explicitly registered;
- no trading/state-changing financial operation exists.

---

## Phase 6 — Automated Cloudflare provisioning and drift management

Goal: turn the manually proven remote setup into a guided, idempotent setup flow.

Deliverables:

- scoped Cloudflare API token validation;
- account/zone validation;
- create/adopt named Tunnel;
- create/adopt DNS records;
- configure ingress and Access-related prerequisites where APIs permit;
- plan/dry-run before mutation;
- configuration drift detection;
- provisioning credentials treated as setup-time credentials and removable after setup;
- runtime retains only the minimum Tunnel/Access secrets required.

Exit criteria:

A clean supported Windows host plus an appropriately scoped Cloudflare token and operator-selected hostname can produce the same secured topology proven manually in Phase 4/5.

---

## Phase 7 — Supervisor, recovery, audit trail, and notifications

Goal: make the system dependable on an always-on Windows PC.

Deliverables:

- supervisor state machine for bridge, FQGate, session, tunnel, and updates;
- bounded restart/recovery policy;
- login/session expiration detection;
- tunnel health monitoring;
- local event journal with redaction;
- generic webhook notification interface and one initial provider;
- deduplication/cooldown plus recovery notifications.

Events should include FQGate crash/recovery, incompatibility, login-required/recovered, Tunnel disconnect/recovery, bridge degradation/recovery, and update success/rollback/failure.

---

## Phase 8 — Safe automatic updates

Goal: reduce routine maintenance only after manual update behavior has proven stable across real upstream releases.

Deliverables:

- conservative configurable policy for FQGate and `cloudflared`;
- staged download and activation;
- OpenAPI + endpoint contract compatibility probes;
- rollback on activation failure;
- maintenance window, pin/freeze, and update history;
- automatic updates remain off by default until explicit policy is selected.

---

## Phase 9 — MCP and realtime WebSocket compatibility

Goal: expose richer protocols only after the read-only HTTP security model is stable.

Deliverables:

- remote MCP protocol investigation and contract tests;
- Access machine-auth integration;
- long-lived request/stream timeout behavior;
- selected WebSocket market stream proxying;
- reconnect/backpressure tests;
- no generic transport tunnel that bypasses route/operation policy.

---

## Phase 10 — Packaging and operator UX

Goal: make deployment maintainable without a developer workstation.

Deliverables:

- versioned Windows release artifact;
- install/uninstall/reconfigure flow;
- startup/task/service integration where proven appropriate;
- diagnostics bundle with redaction;
- configuration migration;
- release checksums;
- operator and troubleshooting documentation.

---

## Future / optional

Not required for the first useful remote release:

- multiple FQGate hosts/failover;
- LAN-only mode without Cloudflare;
- alternative secure overlays such as Tailscale/Headscale;
- multiple notification providers;
- Prometheus/metrics exporter;
- consumer-specific adapter packages such as `turtle-value-engine` integration.

These should be added only when real use justifies the extra operational surface.

## Current development handoff

The Phase 3 handoff is complete; no Phase 4+ implementation should begin until
a new phase is explicitly opened and scoped.

Use:

`docs/prompts/phase-3-codex-goal.md`

Do not begin Cloudflare/Tunnel/Access, remote market-data APIs, MCP, WebSocket, supervisor, or automatic-update implementation until the Phase 3 local upgrade + runtime OpenAPI closure criteria are satisfied and documented.
