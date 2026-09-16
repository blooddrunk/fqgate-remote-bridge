# Phase 2 Task Package — TanStack Local Bridge and QR Login UI

Status: **implementation complete; real Windows QR acceptance pending**

Target executor: Codex Goal / coding agent  
Scope owner: `fqgate-remote-bridge`  
Baseline: 2026-09-16

## 1. Objective

Build the first local HTTP/UI bridge in front of the already-closed Phase 0/1 FQGate lifecycle layer.

Phase 2 must remain **local-only**. It must not add Cloudflare, public exposure, tunnel management, Access, Windows service deployment, MCP, WebSocket proxying, notifications, or trading features.

At completion, on a supported Windows x64 host, a browser on that same host should be able to:

1. open the bridge UI over loopback;
2. see bridge version/capabilities and normalized FQGate lifecycle/session status;
3. see whether FQGate is compatible, running, network-ready, and connected;
4. start an FQGate QR login flow through the bridge;
5. display the QR image without persisting it;
6. poll the flow until waiting/confirmation/success/expired state;
7. observe the main status recover to `connected` after successful login;
8. never interact with the FQGate desktop UI for the normal QR flow.

The bridge must expose only an explicit, auditable local API surface. It is **not** a reverse proxy.

## 2. Architecture decision for Phase 2

Phase 2 intentionally changes the originally planned frontend/backend stack.

Use:

- React 19
- TanStack Start as the full-stack framework
- TanStack Router through Start
- TanStack Query for browser/server-state polling, mutation state, invalidation, and cache ownership
- Vite-based TanStack Start build
- Tailwind CSS v4
- shadcn/ui as the primary UI component source/design-system layer
- Lucide icons where useful
- Node.js 22+ / TypeScript / pnpm

### 2.1 TanStack Start replaces Fastify for this phase

Do **not** run a separate Fastify backend next to TanStack Start.

TanStack Start server routes are the Phase 2 HTTP/API transport. Existing Phase 0/1 TypeScript lifecycle and FQGate modules remain the underlying service/core layer.

The intended dependency direction is:

```text
React UI / TanStack Query
        |
TanStack Start app + server routes
        |
bridge operation/policy layer
        |
FQGate adapters + Phase 0/1 lifecycle
        |
127.0.0.1:17281
        |
FQGate
```

Framework route files must remain thin. FQGate protocol logic, compatibility policy, QR normalization, lifecycle logic, and security decisions must not be embedded in React components or route files.

### 2.2 Keep one package

Keep the repository as a **single package** for Phase 2.

Do not introduce a pnpm monorepo merely because the application now has server and browser code. TanStack Start already provides the full-stack build boundary, and the project still ships as one local Windows application.

Reconsider a monorepo only if a later phase creates genuinely independent deployable units or reusable packages.

### 2.3 TanStack Start maturity risk

TanStack Start is currently pre-v1/RC. Treat the framework as a replaceable transport shell:

- keep `src/fqgate/**` and core bridge operations framework-agnostic;
- keep route handlers thin;
- avoid leaking Start-specific request/context types into core services;
- pin exact resolved dependencies in `pnpm-lock.yaml`;
- record the exact Start/Router/Query versions in the Phase 2 completion report;
- do not use experimental React Server Components in Phase 2.

## 3. UI decision

Use **shadcn/ui as the only baseline component system** in Phase 2.

The UI should look modern and intentional, but this is an operator/security dashboard rather than a marketing site.

Target visual direction:

- clean responsive dashboard;
- bento-style status cards;
- restrained gradients/ambient backgrounds using Tailwind/CSS;
- strong light/dark theme support;
- clear state badges and hierarchy;
- excellent loading/error/empty states;
- accessible keyboard/focus/contrast behavior;
- minimal animation.

Useful shadcn components may include Button, Card, Badge, Alert, Tooltip, Skeleton, Separator, Dialog/Sheet, Tabs, and Sonner where justified. Add only components actually used.

### 3.1 Aceternity UI / Magic UI

Do **not** make Aceternity UI or Magic UI a Phase 2 baseline dependency.

They are useful sources of visual ideas and may be revisited after the functional Phase 2 UI is stable. Do not add paid registries, registry tokens, large animation dependencies, shaders, canvas/WebGL effects, or decorative packages merely to make the dashboard look impressive.

If implementation strongly benefits from one free source-copied decorative component, it may be proposed in the PR with its dependencies and source clearly audited, but the default is **not to add it**.

## 4. Source of truth

Before implementation, read in order:

1. `AGENTS.md`
2. `README.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/status/phase-0-1-completion.md`
8. this task package

Phase 0/1 is closed. Do not regress its checksum, compatibility, lifecycle, process-identity, health-envelope, rollback, or Windows safety behavior while adding the web layer.

## 5. Explicit scope

### In scope

- TanStack Start/React 19 application foundation inside the existing package
- TanStack Router file-based UI and server routes
- TanStack Query integration
- Tailwind v4 + shadcn/ui
- loopback-only production bridge listener
- bridge version/capabilities/status API
- explicit operation/route registry
- normalized bridge error envelope
- security headers appropriate for a local UI
- FQGate QR begin/poll adapter
- bridge-owned ephemeral QR-flow registry
- responsive status dashboard
- QR login page/flow
- unit/integration/browser tests
- production-build smoke tests
- real Windows x64 Phase 2 acceptance procedure
- documentation updates

### Out of scope

Do not implement:

- Cloudflare Tunnel or `cloudflared`
- Cloudflare Access
- DNS or public hostnames
- any LAN/public bind mode
- remote machine authentication
- selected market-data forwarding APIs beyond Phase 2 status/login needs
- MCP
- WebSocket stream
- SMS login
- notifier integrations
- supervisor daemon
- Windows service installation
- permanent Task Scheduler setup
- automatic FQGate update policy beyond the Phase 0/1 manager
- `turtle-value-engine` integration
- trading/order/cancel/fund-transfer/account-control endpoints

## 6. Repository/build evolution

Preserve the existing lifecycle CLI.

A reasonable target shape is:

```text
src/
  bridge/
    operations/
    policy/
    errors/
    qr/
  fqgate/
    ...existing Phase 0/1 modules...
  cli/
    ...existing CLI...
  routes/
    __root.tsx
    index.tsx
    login.tsx
    api/v1/version.ts
    api/v1/capabilities.ts
    api/v1/status.ts
    api/v1/session/qr/begin.ts
    api/v1/session/qr/poll.ts
  components/
    ui/
    dashboard/
    login/
  lib/
    query/
    api/
  router.tsx
  styles.css
scripts/
  start-bridge.mjs
```

Exact paths may vary with current TanStack Start conventions. Keep framework-independent operations outside route files.

Required commands should converge on equivalents of:

```text
pnpm dev
pnpm build
pnpm build:cli
pnpm build:bridge
pnpm start
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm format:check
```

`pnpm build` must build everything needed for both the existing CLI and the local bridge production runtime.

Do not silently break `scripts/windows/acceptance.ps1` or the existing lifecycle CLI while changing build output. Adapt scripts/tests when necessary.

## 7. Loopback runtime boundary

The bridge production server must bind to IPv4 loopback only:

```text
127.0.0.1
```

Recommended default Phase 2 port:

```text
17282
```

The port may be configurable, but the host must not be configurable to `0.0.0.0`, a LAN address, or public address in Phase 2.

If the TanStack Start/Nitro runtime uses environment variables such as `HOST`/`PORT`, provide a deterministic project-owned launcher that forces/validates loopback binding before importing/starting the production server. Do not rely on an undocumented runtime default.

Tests must prove that intended configuration cannot produce a public/LAN bind.

## 8. Bridge operation registry

Create an explicit registry/policy model independent of TanStack route files.

Each remotely-relevant operation must have metadata equivalent to:

```text
operation id
public method/path
classification
read-only/session-maintenance intent
timeout
maximum request-body size
sensitivity/logging policy
required FQGate compatibility
```

Initial operation IDs should cover concepts equivalent to:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
```

The registry is the authority for intended bridge operations even though TanStack Router performs HTTP path matching.

Requirements:

- no wildcard/catch-all upstream proxy operation;
- no operation accepting arbitrary upstream paths;
- no raw `/v1/market/*` forwarding route;
- unknown `/api/*` paths return 404/405 rather than proxying;
- adding a future route requires a new explicit registry entry and test.

## 9. Phase 2 HTTP API

Use stable bridge-owned paths rather than exposing upstream FQGate paths directly.

Recommended surface:

```http
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

Names may change slightly if there is a strong consistency reason, but document the final contract.

### 9.1 Version

Return bridge version/build metadata only. Do not expose filesystem paths unnecessarily.

### 9.2 Capabilities

Return explicit capabilities such as:

```text
status
qr_login
```

Also expose enough compatibility metadata to tell a client when QR login is disabled because the running FQGate version is not validated.

Do not advertise market-data proxy/MCP/WebSocket capabilities that Phase 2 has not implemented.

### 9.3 Aggregate status

Return a normalized document that keeps separate concepts separate, including at least:

```text
bridge runtime state
bridge version
FQGate lifecycle/process state
FQGate version/compatibility
health availability/validity
network readiness
session state
login method when safe/useful
last checked timestamp
```

Do not return raw FQGate response bodies.

## 10. Error contract

Introduce a stable bridge HTTP error envelope, for example:

```json
{
  "error": {
    "code": "QR_FLOW_EXPIRED",
    "message": "The QR login flow expired. Start a new login flow.",
    "requestId": "..."
  }
}
```

The exact shape may differ, but it must be stable and tested.

Requirements:

- map existing internal `BridgeError` categories deliberately;
- never expose stack traces in normal API responses;
- never expose raw upstream bodies;
- upstream messages must remain redacted/bounded;
- use meaningful HTTP status codes;
- include request correlation without logging sensitive QR/session values.

At minimum distinguish concepts such as:

```text
BRIDGE_NOT_READY
FQGATE_NOT_INSTALLED
FQGATE_NOT_RUNNING
FQGATE_INCOMPATIBLE
FQGATE_UNHEALTHY
UPSTREAM_UNAVAILABLE
UPSTREAM_RESPONSE_INVALID
QR_FLOW_INVALID
QR_FLOW_EXPIRED
QR_FLOW_REPLACED
REQUEST_INVALID
```

## 11. FQGate QR compatibility adapter

Implement QR logic behind a dedicated adapter, not directly in UI/server route files.

Observed upstream begin call:

```http
POST /v1/market/session/qr/begin
Content-Type: application/json

{
  "cache_credentials": false
}
```

Observed successful data includes:

```text
flow_id
qr_image_base64
qr_media_type
status
```

Observed statuses include:

```text
waiting_for_scan
waiting_for_confirmation
```

Observed poll call:

```http
POST /v1/market/session/qr/poll
Content-Type: application/json

{
  "flow_id": <number>
}
```

Successful completion includes `connected` and `login_method`.

Observed upstream errors `1003` and `3014` must be translated to explicit bridge QR-flow semantics. Do not expose those undocumented numeric assumptions as the browser contract.

Validate all upstream envelopes and endpoint-specific data at runtime.

## 12. Bridge-owned ephemeral QR flow

Do not expose the upstream numeric `flow_id` as the primary browser/session identifier.

Create a bridge-owned opaque random `sessionId` and keep the upstream `flow_id` only in server memory.

Recommended behavior:

1. browser calls bridge QR begin;
2. bridge calls FQGate begin;
3. bridge creates cryptographically random opaque `sessionId`;
4. server memory maps `sessionId -> upstream flow_id + created/expires metadata`;
5. begin response returns `sessionId`, image media type/base64, normalized status, and expiry metadata;
6. browser polls with bridge `sessionId`;
7. bridge resolves upstream flow internally;
8. expired/replaced/successful flows are removed promptly.

Security requirements:

- no QR image or upstream flow id in logs;
- no QR image/session id in URLs/query strings;
- no browser localStorage/sessionStorage/IndexedDB persistence;
- no filesystem persistence;
- QR image stays in memory only;
- bounded TTL;
- bounded number of active flow records;
- starting a new upstream flow must make stale replaced flows deterministic locally;
- process restart may invalidate active QR flows; UI must handle this cleanly.

Use `crypto.randomUUID()` or stronger equivalent for opaque IDs.

## 13. TanStack Query behavior

Use TanStack Query where it adds real value:

- aggregate status polling/cache;
- QR begin mutation;
- conditional QR poll query or mutation loop;
- invalidation/refetch after successful login;
- retry policy that distinguishes transport failures from terminal QR states.

Recommended status polling interval is a few seconds while the page is visible; avoid aggressive sub-second polling.

QR polling should respect upstream behavior and stop immediately on success, expiration, replacement, unmount, or browser inactivity where practical.

Do not persist the Query cache to browser storage.

## 14. UI routes and behavior

### 14.1 `/` dashboard

Show at least:

- bridge status/version;
- FQGate lifecycle state;
- FQGate version + compatibility badge;
- network readiness;
- market-session status/login method;
- last refresh/connection indicator;
- clear CTA to login when appropriate.

Use concise operator language. Distinguish `process running`, `network ready`, and `session connected` visually.

### 14.2 `/login`

Provide the QR flow.

States should include:

```text
not started
starting
displaying QR
waiting for scan
waiting for confirmation
connected
expired/replaced
upstream unavailable
incompatible
```

UX requirements:

- clear refresh/retry action;
- no accidental repeated begin requests;
- QR image has a stable layout box to prevent page jump;
- success should invalidate/refetch dashboard status;
- browser refresh loses the active QR flow by design unless still represented safely in server memory and deliberately re-associated; do not persist it client-side simply to preserve UX;
- responsive mobile/desktop layout even though Phase 2 is local-only.

## 15. Security headers and browser behavior

Add appropriate local response protections without inventing an authentication system in Phase 2.

At minimum evaluate and test:

- `Content-Security-Policy` suitable for the built UI/QR image strategy;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- frame embedding policy (`frame-ancestors` / equivalent);
- no permissive CORS wildcard;
- no cross-origin credentials behavior.

Because QR login POSTs change authentication/session state, do not introduce broad CORS. Same-origin UI is the intended Phase 2 caller.

Cloudflare Access authentication belongs to later phases.

## 16. Logging

Structured logs should identify bridge route/operation IDs rather than dump arbitrary request bodies.

Never log:

- QR base64 image data;
- bridge QR `sessionId` in full;
- upstream `flow_id`;
- authorization/cookie/session material;
- raw login response bodies.

Request IDs may be logged.

## 17. Testing requirements

### 17.1 Core/unit tests

Cover at minimum:

- operation registry has no duplicate method/path;
- registry contains no wildcard upstream proxy;
- every implemented `/api/v1` operation has policy metadata;
- public/LAN host binding is rejected/overridden;
- status normalization keeps process/network/session concepts distinct;
- bridge error mapping/redaction;
- QR begin success;
- malformed begin envelope/data;
- QR media type validation;
- QR payload size bounds;
- QR poll pending states;
- QR poll connected state;
- upstream 1003/3014 normalization;
- unknown QR session ID;
- TTL expiry;
- replacement/invalidation behavior;
- active-flow bound;
- cleanup after success/expiry;
- no sensitive values in structured logs.

### 17.2 HTTP integration tests

Run the TanStack Start server/handler against fakes and verify:

- exact allowed routes/methods;
- unknown API route returns 404;
- wrong method returns 405 or framework-equivalent denial;
- no raw upstream route is exposed;
- request body size limits;
- stable JSON error envelope;
- security headers;
- API never emits QR/upstream sensitive data outside the intended begin response.

### 17.3 React/UI tests

Use Testing Library/Vitest or equivalent for meaningful component behavior, not snapshots alone.

Cover:

- status cards for major states;
- login CTA visibility;
- QR begin loading/error/success;
- QR pending -> confirmation -> connected transitions;
- expired flow -> retry;
- QR image not rendered into persistent storage APIs;
- accessibility labels/focus for critical controls.

### 17.4 Browser E2E

Add a small Playwright suite, preferably Chromium on Ubuntu CI, using fake FQGate/bridge dependencies so normal CI is deterministic.

Required browser flow:

```text
open dashboard
 -> observe disconnected status
 -> navigate/start login
 -> receive/render QR
 -> poll pending
 -> simulate connected upstream
 -> observe success
 -> dashboard/status becomes connected
```

Also test an expired/replaced QR flow.

Normal CI must not require a real FQGate login or Cloudflare credentials.

## 18. Windows Phase 2 acceptance

Document a real Windows x64 acceptance procedure using the production build and the existing managed FQGate.

It must verify:

1. Phase 0/1 lifecycle CLI still works;
2. production bridge binds only to `127.0.0.1:<port>`;
3. browser can open the dashboard locally;
4. dashboard reads real managed FQGate status/health;
5. unknown/raw FQGate paths are not exposed by the bridge;
6. if a real QR login test is operationally safe, begin/poll/scan succeeds against real FQGate;
7. if the host is already connected and a real QR test would require destructive logout/session manipulation, do **not** automate that manipulation; record real QR acceptance as pending rather than weakening safety;
8. stopping the bridge does not stop FQGate unless explicitly requested through existing lifecycle tooling;
9. no Windows service/headless support is claimed.

Phase 2 is fully closed only after a real QR login has been proven at least once on the target Windows/FQGate combination. Implementation may otherwise be marked complete with that external acceptance pending.

## 19. CI

Keep Ubuntu and Windows CI.

At minimum run:

- frozen pnpm install
- typecheck
- lint
- unit/integration tests
- full production build
- format check

Run browser E2E where practical on Ubuntu only to keep CI cost predictable. Windows CI should at least prove build/runtime scripts and existing lifecycle behavior remain valid.

## 20. Documentation deliverables

At completion add:

```text
docs/status/phase-2-completion.md
```

Record:

- exact React/TanStack Start/Router/Query/Tailwind/shadcn baseline;
- final project/build shape;
- final API routes;
- operation-registry model;
- QR-flow model and TTL;
- UI behavior;
- tests and CI;
- production loopback binding evidence;
- Windows acceptance status;
- known framework/upstream limitations;
- remaining Phase 3 work.

Update `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/upstream-contracts.md`, `docs/roadmap.md`, and `AGENTS.md` when implementation reality requires it.

## 21. Definition of done

Phase 2 implementation is complete when:

- React 19 + TanStack Start app builds in the existing package;
- existing lifecycle CLI still builds/tests/works;
- production bridge is forced to loopback;
- explicit bridge operation registry exists;
- stable version/capabilities/status APIs exist;
- QR begin/poll adapter exists and is runtime-validated;
- opaque ephemeral bridge QR sessions exist;
- modern shadcn-based dashboard/login UI exists;
- TanStack Query owns polling/mutation state without browser persistence;
- unknown/raw upstream paths remain unreachable;
- no trading/Cloudflare/MCP/WebSocket/SMS scope creep exists;
- unit/integration/UI/E2E tests pass;
- Ubuntu + Windows CI pass;
- completion documentation is accurate;
- real Windows acceptance is executed or explicitly left as the only external closure item.

## 22. Implementation philosophy

This phase is intentionally also a learning investment in the modern React/TanStack ecosystem, but learning value does not justify architectural duplication.

Prefer one coherent full-stack application over a monorepo plus two HTTP servers. Prefer shadcn primitives and deliberate CSS over importing multiple visual libraries. Prefer explicit server routes and bridge operations over framework magic that obscures the security boundary.

The most important Phase 2 artifact is not the dashboard itself. It is the first audited application boundary between a browser and FQGate.
