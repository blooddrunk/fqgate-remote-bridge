# Phase 2 Task Package — Local Bridge API and QR Login UI

Status: **superseded historical draft**

Target executor: Codex Goal / coding agent  
Scope owner: `fqgate-remote-bridge`  
Baseline: 2026-09-16  
Prerequisite: Phase 0 + Phase 1 are fully closed, including real Windows x64 acceptance.

> This earlier Fastify + Vue task is retained for history only. The active Phase 2
> acceptance contract is [`phase-2-tanstack-local-bridge-and-qr-ui.md`](phase-2-tanstack-local-bridge-and-qr-ui.md),
> which defines the implemented TanStack Start + React stack.

## 1. Objective

Build the first actual local `FQGate Remote Bridge` application boundary on top of the proven Phase 0/1 lifecycle manager.

At the end of Phase 2, on the Windows host itself, a user should be able to:

1. start a local bridge HTTP server bound only to loopback;
2. open a small browser UI served by that bridge;
3. see bridge/FQGate/market-session status without opening the FQGate UI;
4. start an FQGate QR-login flow from the browser;
5. scan the displayed QR code;
6. observe `waiting_for_scan` / `waiting_for_confirmation` / connected / expired/error states through the bridge;
7. recover the FQGate market session through the bridge UI;
8. verify that unknown/upstream routes are denied rather than transparently proxied.

Phase 2 remains **local-only**. It must not expose the bridge to LAN or Internet and must not introduce Cloudflare yet.

## 2. Source of truth

Before implementation, read and follow in this order:

1. `AGENTS.md`
2. `README.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/status/phase-0-1-completion.md`
8. this task package

Current observed upstream QR behavior is recorded in `docs/upstream-contracts.md`. Recheck the current public `zhuyifang/tonghuasun-agent` implementation before coding the QR adapter. If it differs materially, update the compatibility ledger and isolate the change behind the FQGate adapter rather than leaking upstream assumptions into bridge routes/UI.

## 3. Scope boundaries

### In scope

- Fastify-based local bridge server
- loopback-only bridge configuration and validation
- bridge startup/shutdown CLI integration
- bridge health/version/status/capability API
- explicit route registry / deny-by-default route model
- reusable FQGate local HTTP API client using the existing envelope decoder
- explicit FQGate compatibility gate for upstream-dependent bridge operations
- QR login begin adapter
- QR login poll adapter
- normalization of QR expiration/replacement conditions
- minimal Vue 3 + Vite UI
- status polling and QR-login user flow
- secure response headers and local same-origin request policy
- bounded request bodies/timeouts
- structured/redacted request/error logging
- automated server/adapter/UI-logic tests
- Windows Phase 2 acceptance procedure
- documentation/completion report

### Explicitly out of scope

Do **not** implement any of these in Phase 2:

- `cloudflared`
- Cloudflare Tunnel
- Cloudflare Access
- DNS or Cloudflare API provisioning
- Internet/LAN binding
- a generic reverse proxy
- arbitrary FQGate path forwarding
- quote/history/candle/order-flow market API expansion beyond the minimum diagnostics boundary in this task
- MCP proxying
- WebSocket proxying
- SMS login
- notifier providers
- supervisor/restart daemon
- Windows service installation
- permanent Task Scheduler setup
- automatic update policy beyond the already-implemented Phase 1 lifecycle commands
- `turtle-value-engine` integration
- trading, brokerage, order, cancellation, fund transfer, or other financial state-changing functionality

Do not opportunistically begin Phase 3+.

## 4. Repository shape

Keep Phase 2 as a **single package** unless a concrete build constraint proves that impossible.

Do not introduce a pnpm monorepo merely because Vue is now present. Backend and UI are one deployable Windows application in this phase.

A reasonable implementation shape is:

```text
src/
  bridge/
    http/
      server.ts
      routes.ts
      errors.ts
      security.ts
    status/
  fqgate/
    api/
      client.ts
    login/
      qr.ts
  ...existing Phase 0/1 modules...
ui/
  index.html
  src/
    App.vue
    api/
    components/
    composables/
    styles/
tests/
  ...
```

Exact paths may differ, but preserve the separation between:

- public bridge contract;
- upstream FQGate protocol adapter;
- Phase 0/1 lifecycle manager;
- browser UI.

The UI build output should be served by the bridge in production. Do not require a second production web server.

## 5. Bridge runtime and configuration

### 5.1 Bind address

The production bridge must bind to:

```text
127.0.0.1
```

Phase 2 should not accept a configuration that silently binds to `0.0.0.0`, a LAN address, or an arbitrary hostname.

If host configuration is exposed at all in this phase, restrict it to approved loopback forms and test rejection of non-loopback values. Prefer keeping the host fixed and making only the port configurable.

Use one documented default bridge port. Recommended default:

```text
17881
```

Once implemented, record the chosen default in README/config docs.

### 5.2 CLI

Add an equivalent top-level command:

```text
fqgate-remote-bridge serve
```

Requirements:

- starts Fastify and the static UI on the configured loopback address;
- reports the local UI/API address;
- handles `SIGINT` / `SIGTERM` with bounded graceful shutdown;
- does not automatically expose or start Cloudflare components;
- does not require FQGate to be healthy merely for the bridge process to start;
- keeps local diagnostics available when FQGate is stopped, unavailable, or incompatible.

Development scripts may provide separate Vite/Fastify watch modes, but production behavior is one bridge origin.

### 5.3 Build

`pnpm build` must build both backend and UI production artifacts.

Normal CI must remain credential-free and must not require a real FQGate process.

## 6. Public local bridge contract

The exact JSON field naming may be refined during implementation, but the semantic contract below must be preserved.

### 6.1 Bridge liveness

```http
GET /healthz
```

Purpose: prove the bridge process itself is alive without depending on FQGate.

Requirements:

- fast and side-effect-free;
- does not call upstream FQGate;
- returns bridge version/build metadata only as needed;
- remains healthy when FQGate is down.

### 6.2 Aggregate status

```http
GET /api/v1/status
```

Return normalized information sufficient for the UI, including concepts equivalent to:

```text
bridge state/version
FQGate lifecycle
FQGate validated version (when available)
FQGate reachability/health validity
network readiness
market session: connected | guest | login_required | unknown
login method when safely available
compatibility state
```

Do not expose unnecessary local filesystem paths, credentials, cookies, QR payloads, authorization data, or raw upstream session material.

Status should normally return HTTP 200 even when FQGate is unavailable; degraded state belongs in the response model. Invalid bridge requests are a different concern from upstream component health.

### 6.3 Capabilities

```http
GET /api/v1/capabilities
```

Expose bridge-level supported capabilities rather than upstream route discovery.

For Phase 2, concepts should include:

```text
qrLogin: true when the validated compatibility profile permits it
smsLogin: false
mcp: false
websocket: false
remoteAccess: false
```

Do not expose an automatically generated inventory of every FQGate route.

### 6.4 QR begin

```http
POST /api/v1/login/qr/begin
Content-Type: application/json

{}
```

The bridge calls the fixed upstream operation:

```http
POST /v1/market/session/qr/begin
{
  "cache_credentials": false
}
```

The browser must not be allowed to override `cache_credentials`.

Normalize the successful bridge result into fields equivalent to:

```text
flowId
imageBase64
mediaType
status: waiting_for_scan | waiting_for_confirmation
```

Requirements:

- `flowId` must be validated conservatively;
- accepted QR media types must be explicitly allowlisted; for the current observed contract, prefer `image/png` only unless another type is verified;
- QR payload size must be bounded;
- QR image data must not be logged or persisted;
- unexpected upstream shapes fail closed.

### 6.5 QR poll

```http
POST /api/v1/login/qr/poll
Content-Type: application/json

{
  "flowId": 123
}
```

The bridge calls the fixed upstream operation:

```http
POST /v1/market/session/qr/poll
{
  "flow_id": 123
}
```

Normalize results into either:

```text
connected: false
status: waiting_for_scan | waiting_for_confirmation
```

or:

```text
connected: true
method: qr (or another explicitly validated upstream login method)
```

Observed upstream error codes `1003` and `3014` must map to a stable bridge-domain condition equivalent to:

```text
QR_FLOW_EXPIRED
```

Use an HTTP status appropriate for an expired/invalidated flow (for example 410) and do not leak unstable upstream error semantics to the UI.

## 7. Explicit route registry and deny-by-default behavior

Phase 2 must establish the route-registry pattern that later remote API phases will extend.

Important distinction:

- bridge-owned routes such as `/healthz`, status, and capabilities are not upstream proxy entries;
- FQGate health/QR operations are explicit adapter operations with fixed upstream method/path;
- QR login is an explicitly approved session-control operation, not a generic "read-only market-data" route;
- no request path supplied by a browser/client may be concatenated into an upstream FQGate URL.

The bridge must reject examples such as:

```text
/v1/market/health
/v1/market/session/qr/begin
/v1/market/realtime/quote
/mcp
/v1/market/stream
/api/v1/proxy/*
```

unless a specific bridge-owned route is explicitly registered for that capability.

Do not implement a wildcard handler that forwards unknown paths upstream.

Tests must prove deny-by-default behavior.

## 8. FQGate API adapter

Build a small explicit local FQGate API client on top of the existing HTTP transport and `decodeFqgateResponseEnvelope` boundary.

Requirements:

- base URL remains loopback-validated by the existing configuration layer;
- fixed endpoint constants live in the adapter, not the browser-facing route code;
- bounded timeout and response size;
- JSON request/response only for the Phase 2 operations;
- preserve envelope validation/redaction behavior already established in Phase 0/1;
- endpoint-specific response validators are separate from envelope decoding;
- do not turn the client into an arbitrary `proxy(method, path, body)` callable from routes.

### Compatibility gate

Bridge liveness/status diagnostics must remain available when FQGate is unknown or incompatible.

Upstream-dependent actions such as QR begin/poll must fail closed unless the running/managed FQGate compatibility state is validated for the QR contract.

Do not interpret `supported-but-unvalidated` as validated.

## 9. Stable bridge error model

Define a bridge-owned error envelope for API failures, for example:

```json
{
  "error": {
    "code": "QR_FLOW_EXPIRED",
    "message": "The QR login flow has expired. Generate a new QR code."
  }
}
```

Keep messages safe for display and logs.

At minimum distinguish concepts equivalent to:

```text
BAD_REQUEST
METHOD_NOT_ALLOWED / ROUTE_NOT_FOUND
FQGATE_UNAVAILABLE
FQGATE_INCOMPATIBLE
UPSTREAM_RESPONSE_INVALID
UPSTREAM_API_ERROR
QR_FLOW_EXPIRED
QR_PAYLOAD_INVALID
INTERNAL_ERROR
```

Do not expose stack traces or raw upstream bodies to the browser.

## 10. Local HTTP security requirements

Even though Phase 2 is loopback-only, design it so Phase 3 can safely place Cloudflare Tunnel in front without rewriting the server's basic security posture.

Required controls:

1. bind only to loopback;
2. no permissive CORS configuration;
3. browser UI and API share one production origin;
4. state-changing routes require `POST` and exact JSON content type;
5. reject cross-origin browser POSTs using an explicit Origin policy where an Origin header is present;
6. enforce small body limits (QR routes need only tiny JSON bodies);
7. use bounded upstream timeouts;
8. add conservative security headers, including an explicit CSP suitable for the Vue bundle and `data:` QR images;
9. do not emit directory listings;
10. API/status/login responses containing session information should use `Cache-Control: no-store`;
11. do not log request bodies for login routes;
12. do not log QR base64 or flow/session material;
13. request logs should prefer stable route IDs rather than raw sensitive URLs.

A suitable CSP should be functionally equivalent to:

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'none';
form-action 'self'
```

Adjust only where the actual Vite output requires it, and document any relaxation.

## 11. Vue UI

The UI is intentionally small. Do not introduce a large design system/component framework solely for Phase 2.

Required user-visible states:

### Status area

Show concise states for:

- bridge online;
- FQGate stopped/starting/ready/unhealthy/incompatible;
- market network ready/not ready/unknown;
- session connected/guest/login required/unknown;
- validated FQGate version where useful.

Avoid surfacing raw internal diagnostics as the primary UI.

### QR login area

Behavior:

1. user explicitly chooses to generate/refresh QR;
2. UI calls bridge `qr/begin`;
3. image is rendered from the validated base64 payload;
4. UI polls bridge `qr/poll` at a restrained interval (roughly 1.5–3 seconds);
5. UI stops polling on connected, expired, terminal error, component unmount, or replacement by a newly generated QR;
6. `waiting_for_scan` and `waiting_for_confirmation` are visually distinct;
7. expired flow offers a clear "generate new QR" action;
8. successful login transitions back to connected status.

Security/privacy:

- no `localStorage`, `sessionStorage`, IndexedDB, cookies, or service-worker persistence for QR/session material;
- QR payload and flow ID live only in component/in-memory state;
- clear QR data when a flow finishes or is replaced;
- do not auto-regenerate QR in an infinite loop;
- do not implement SMS login in this phase.

### Refresh behavior

Status polling may continue at a modest interval. Avoid synchronized tight polling loops between status and QR polling.

## 12. Testing requirements

Normal tests must not require real FQGate or browser credentials.

### 12.1 Bridge server

Cover at minimum:

- production/default bind is loopback;
- non-loopback config is rejected if host is configurable;
- `/healthz` succeeds with FQGate absent;
- status returns normalized degraded state when FQGate is absent/unhealthy;
- capabilities reflect compatibility state;
- unknown routes return deny-by-default response;
- direct FQGate paths are not proxied;
- wrong HTTP method is rejected;
- QR POSTs reject inappropriate content type;
- cross-origin POST is rejected when Origin is foreign;
- body-size limit is enforced;
- security headers/CSP are present;
- session-bearing responses are `no-store`.

Use Fastify injection where practical rather than opening real sockets in unit tests.

### 12.2 FQGate adapter / QR

Cover:

- valid QR begin envelope;
- `cache_credentials` is always false;
- malformed envelope;
- malformed/oversized QR payload;
- unapproved media type;
- pending scan;
- waiting confirmation;
- successful connected poll;
- upstream 1003 -> `QR_FLOW_EXPIRED`;
- upstream 3014 -> `QR_FLOW_EXPIRED`;
- other non-zero upstream code -> normalized safe upstream error;
- timeout/unavailable upstream;
- unsupported/unvalidated FQGate version blocks QR action;
- sensitive upstream messages are redacted/bounded.

### 12.3 Route registry

Prove that only declared operations exist. Add a regression test demonstrating that a plausible new upstream path remains inaccessible until code explicitly registers it.

### 12.4 UI

At minimum test the QR state machine/composable logic:

- begin -> waiting scan;
- scan -> waiting confirmation;
- connected -> polling stops + QR memory clears;
- expired -> polling stops + refresh action available;
- refresh replaces old flow and old poll cannot overwrite new state;
- unmount cancels polling;
- status/API errors produce a bounded user-facing state;
- no persistent browser storage is used for QR/session data.

The production UI build must be exercised in CI.

A full Playwright dependency is optional in Phase 2; do not add it merely for superficial coverage if server injection + UI unit tests provide the needed guarantees. Browser-level acceptance is required on the real Windows host.

## 13. Windows Phase 2 acceptance

Add/document a real-host acceptance procedure. It may reuse the already proven Phase 1 managed FQGate installation.

The real Windows acceptance must verify:

1. bridge starts on the documented loopback port;
2. `netstat`/equivalent confirms no `0.0.0.0` or LAN listener for the bridge;
3. `/healthz` works;
4. `/api/v1/status` reflects the real managed FQGate;
5. direct requests to unregistered FQGate-style paths are rejected;
6. the Vue UI loads from the bridge origin;
7. user can generate a real QR code through the bridge;
8. user scans it with the intended app;
9. UI observes pending/confirmation/connected progression as available in the real flow;
10. final status reports connected session without requiring interaction with the FQGate UI;
11. QR image/session material is not left in persistent browser storage or application logs;
12. bridge shutdown is clean and leaves managed FQGate lifecycle semantics intact.

If real QR acceptance cannot be completed in the coding environment, do not claim Phase 2 closed. Record implementation completion separately from real-host acceptance.

## 14. CI and quality gates

Keep the existing checks and extend them as necessary:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

Both Ubuntu and Windows CI should remain green.

No normal CI job may require:

- real FQGate;
- Cloudflare credentials;
- QR scan;
- private resources.

## 15. Documentation deliverables

During implementation update documentation when reality differs from this plan.

At completion add:

```text
docs/status/phase-2-completion.md
```

Record:

- final bridge port/bind behavior;
- final API surface;
- route registry model;
- QR compatibility assumptions;
- UI behavior;
- test counts/results;
- CI status;
- real Windows/browser/QR acceptance status;
- known limitations;
- explicit remaining Phase 3 work.

Update:

- `README.md`
- `docs/architecture.md`
- `docs/security.md` if the implemented boundary changes any planned detail;
- `docs/upstream-contracts.md` for newly verified upstream behavior;
- `docs/roadmap.md` only for exit criteria genuinely satisfied.

Do not mark Phase 2 fully closed until the real Windows same-host browser QR flow succeeds.

## 16. Definition of done

Phase 2 implementation is complete when all of these are true:

- Fastify bridge exists and binds only to loopback;
- production Vue UI is served by the bridge;
- bridge liveness/status/capability APIs exist;
- explicit route registry/deny-by-default behavior exists and is tested;
- there is no wildcard/catch-all upstream proxy;
- reusable FQGate API envelope/endpoint adapter exists;
- QR begin/poll contract is implemented and validated;
- 1003/3014 expiration is normalized behind a bridge-owned error code;
- QR/session data is ephemeral and excluded from logs/persistent browser storage;
- compatibility gate prevents QR actions on unvalidated FQGate versions;
- stable safe API error envelope exists;
- body/time/log/security-header controls are tested;
- UI implements status + QR flow without SMS or unrelated features;
- all existing and new quality gates pass on Ubuntu and Windows CI;
- no Cloudflare/Phase 3+ code was added accidentally;
- completion documentation accurately states whether real-host acceptance has run.

Phase 2 is **fully closed** only when, in addition, the real Windows same-host browser can complete the QR-login recovery flow through the bridge and the acceptance evidence is recorded.

## 17. Implementation philosophy

Phase 2 is where this project becomes a bridge, but it must remain a **narrow adapter**, not become a generic local proxy.

Prefer:

```text
stable bridge operation -> explicit adapter -> fixed validated FQGate endpoint
```

over:

```text
client path -> generic proxy -> arbitrary FQGate endpoint
```

This distinction is the main security property that later makes Cloudflare exposure acceptable.
