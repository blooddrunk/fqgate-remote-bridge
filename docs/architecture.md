# Architecture

## Goals

FQGate Remote Bridge is a Windows-first edge service that turns one local FQGate instance into a remotely reachable, authenticated, observable, and maintainable market-data endpoint without changing FQGate's local-first posture.

The bridge must absorb operational concerns that do not belong in consumers such as `turtle-value-engine`:

- FQGate installation and upgrades
- local application/API boundary
- browser login flows
- health monitoring
- cloudflared installation and upgrades
- Cloudflare Tunnel lifecycle
- notifications
- upstream compatibility handling

Consumers should only see a stable provider endpoint and a small compatibility contract.

## Non-goals

- trading or brokerage operations
- generic reverse-proxying of arbitrary localhost services
- replacing Cloudflare Access with home-grown Internet authentication
- implementing a complete FQGate clone
- making FQGate a mandatory dependency of any consuming project

## Component model

```text
                           Cloudflare control plane             later phases
                          /                         \
                Tunnel configuration           Access policy
                         |                           |
                         +-------------+-------------+
                                       |
Internet client                         |
(browser / agent)                       |
       |                                |
       +-------- HTTPS / WSS -----------+
                                       |
                                cloudflared service
                                       |
                              127.0.0.1:<bridge>
                                       |
            +--------------------------+--------------------------+
            |                          |                          |
     TanStack Start UI          bridge server routes         later supervisor
            |                          |                          |
            |                    operation registry       process/update/state
            |                          |                          |
            +--------------------------+--------------------------+
                                       |
                               FQGate adapter layer
                                       |
                               127.0.0.1:17281
                                       |
                                    FQGate
```

Phase 2 implements only the local TanStack Start/UI/API portion of this model. Cloudflare and supervisor components remain later work.

## Bridge modules

### 1. Bootstrap / installer

Windows-oriented bootstrap logic should be implemented in PowerShell with minimal responsibility:

- detect supported OS/architecture
- install application payload
- arrange startup/service/task integration in later phases
- create required directories
- call the bridge CLI/runtime for configuration and verification

Business logic should stay in TypeScript, not be duplicated in PowerShell.

### 2. FQGate manager

Responsibilities:

- read the upstream stable release manifest
- select the Windows package
- verify file size and SHA-256 before activation
- maintain `current` and `previous` binaries for rollback
- start/stop/restart the FQGate process
- verify `--version` and `/v1/market/health`
- refuse upgrades whose compatibility has not passed policy

Phase 0/1 implemented and accepted this boundary on real Windows x64. Later phases must reuse it rather than recreate lifecycle logic in web routes.

### 3. Local application transport — TanStack Start

Phase 2 uses **TanStack Start** as the local full-stack HTTP/UI transport.

Responsibilities:

- bind the production server only to IPv4 loopback;
- provide React 19/TanStack Router pages;
- provide explicit server routes for bridge-owned APIs;
- integrate TanStack Query for browser server-state polling and mutations;
- apply security headers and normalized bridge error responses;
- host the QR login/status UI;
- remain a thin transport over framework-agnostic bridge/FQGate services.

TanStack Start replaces the earlier Phase 2 Fastify + Vue plan. Do not run a second Fastify backend merely to preserve the old plan.

Because TanStack Start is pre-v1/RC, core bridge operations must not depend on Start-specific request/context types. A future framework replacement should not require rewriting FQGate compatibility, lifecycle, QR state, or policy logic.

### 4. Bridge operation / policy registry

The bridge is **not** an unrestricted reverse proxy.

Every intended bridge operation is represented explicitly by policy metadata such as:

- operation ID
- public method/path
- classification
- timeout
- maximum request-body size
- logging/sensitivity policy
- compatibility requirement

Initial Phase 2 operations are limited to bridge version/capabilities/status and QR login begin/poll.

There is no generic `/* -> FQGate` operation, no arbitrary upstream-path parameter, and no transparent fallback when an unknown route is requested.

### 5. FQGate API adapter

Responsibilities:

- own upstream HTTP-envelope decoding;
- validate endpoint-specific response data;
- normalize upstream errors and states;
- isolate observed FQGate API quirks from bridge clients;
- enforce compatibility requirements before an operation reaches FQGate.

Phase 2 adds the QR begin/poll adapter alongside the existing health adapter.

### 6. QR flow registry

Phase 2 introduces an in-memory bridge-owned QR-flow registry.

The browser receives an opaque random bridge `sessionId`; the upstream numeric FQGate `flow_id` remains server-side only.

The registry is:

- memory-only;
- TTL-bounded;
- count-bounded;
- cleared on terminal states;
- intentionally invalidated by bridge process restart.

QR image data, upstream flow IDs, and active login-session data are not persisted or logged.

### 7. Web UI

Phase 2 UI stack:

- React 19
- TanStack Start / TanStack Router
- TanStack Query
- Tailwind CSS v4
- shadcn/ui

Minimal responsibilities:

- bridge status/version
- FQGate process/version/compatibility/health
- market session status
- QR login initiation and polling
- clear error/retry states

The UI should be a modern, restrained operator dashboard rather than a marketing page. shadcn/ui is the baseline component source. Aceternity UI/Magic UI are not required Phase 2 dependencies.

The browser never receives local filesystem credentials, Cloudflare API tokens, upstream numeric QR flow IDs, or other service secrets.

### 8. cloudflared manager — later phase

Responsibilities when Phase 3 begins:

- detect installed version
- download and verify official cloudflared releases
- provision or adopt a remotely managed tunnel
- install/reconfigure the Windows service
- verify the connector is healthy
- support controlled rollback when a new cloudflared release causes failure

The bridge should prefer a remotely-managed tunnel token for runtime. Broad Cloudflare API credentials are setup-time credentials and should not be retained when no longer needed.

### 9. Cloudflare provisioner — later phase

Setup-time functionality:

- validate account/zone configuration
- create or adopt a named tunnel
- create/update DNS records for configured hostnames
- configure ingress toward the local bridge port
- provide enough output for the operator to create or verify Cloudflare Access policies

Recommended hostname split:

```text
fqgate.example.com      -> human status + QR login
fqgate-api.example.com  -> machine API / MCP gateway
```

### 10. Supervisor/state machine — later phase

Normalize low-level observations into a small state model.

Suggested dimensions:

```text
bridge:      starting | ready | degraded | failed
fqgate:      stopped | starting | ready | unhealthy | incompatible
session:     connected | guest | login_required | login_in_progress | unknown
tunnel:      stopped | connecting | connected | degraded
updates:     idle | available | applying | rollback | failed
```

State transitions should produce events for logs, UI, and later notifier plugins.

### 11. Notification subsystem — later phase

Use a small interface rather than hard-code a vendor.

Initial provider may be a generic JSON webhook, with later adapters for ntfy, Bark, Telegram, Feishu, WeCom, etc.

## Windows process model

FQGate is a desktop executable and may require an interactive user session. Phase 0/1 acceptance proved the bridge-managed process in that model.

Planned separation remains:

- `cloudflared`: Windows service in a later phase
- bridge backend: service only after packaging/runtime behavior is proven
- FQGate: interactive user-session process; Task Scheduler/logon startup may be added later

Do not claim headless Windows-service support for FQGate.

## Local networking rule

FQGate remains on:

```text
127.0.0.1:17281
```

Phase 2 bridge also binds only to IPv4 loopback, with the task package recommending:

```text
127.0.0.1:17282
```

A different port may be configured later, but Phase 2 must not add a LAN/public host mode.

`cloudflared` will eventually create outbound connections to Cloudflare, so the design should not require inbound router port forwarding or public Windows Firewall rules.

## Consumer contract

A consumer must not depend on upstream FQGate quirks directly when avoidable. The bridge should expose:

- version endpoint
- provider capability endpoint
- health/status endpoint
- stable error envelope for bridge-generated failures
- upstream version/compatibility metadata in diagnostics

The consumer remains responsible for fallback to other market-data providers.

## Current phase boundary

Phase 0 + Phase 1 are fully closed and provide the local lifecycle manager.

Phase 2 is the current target and adds only:

- local loopback TanStack Start runtime;
- explicit bridge version/capability/status routes;
- QR login begin/poll adapter;
- ephemeral bridge QR session state;
- React/shadcn status and QR UI.

Phase 2 does **not** add Cloudflare, public exposure, read-only market-data forwarding, MCP, WebSocket proxying, SMS login, notifications, or trading operations.
