# Architecture

## Goals

FQGate Remote Bridge is a Windows-first edge service that turns one local FQGate instance into a remotely usable, authenticated, observable, and maintainable market-data endpoint **without changing FQGate's local-first posture**.

The bridge absorbs operational concerns that should not belong in consumers such as `turtle-value-engine`:

- FQGate installation and upgrades
- local application/API boundary
- browser login flows
- runtime API discovery and compatibility checks
- health monitoring
- cloudflared installation/lifecycle in later phases
- Cloudflare Tunnel/Access integration in later phases
- notifications and recovery in later phases
- upstream compatibility handling

Consumers should eventually see a stable provider endpoint and a small compatibility contract rather than raw FQGate implementation details.

## Non-goals

- trading or brokerage operations
- generic reverse-proxying of arbitrary localhost services
- generic transparent proxying of FQGate
- treating an OpenAPI document as an authorization policy
- replacing Cloudflare Access with home-grown Internet authentication
- implementing a complete FQGate clone
- making FQGate a mandatory dependency of any consuming project

## Current and target topology

### Through Phase 3: local-only

```text
Local browser
    |
    | http://127.0.0.1:17282
    v
+-------------------------------------------+
| FQGate Remote Bridge / TanStack Start     |
|                                           |
| Dashboard / routes                        |
|     |                                     |
|     +-> operation policy registry         |
|     +-> lifecycle/update service          |
|     +-> runtime OpenAPI catalog           |
|     +-> QR/session service                |
|                    |                      |
+--------------------|----------------------+
                     |
                     | fixed loopback calls
                     v
             127.0.0.1:17281
                  FQGate
```

Both processes remain IPv4-loopback-only.

### Later remote topology

```text
remote browser / machine client
             |
             v
      Cloudflare Access
             |
             v
      Cloudflare Tunnel
             |
             v
       cloudflared service
             |
             v
     127.0.0.1:<bridge>
             |
             v
   explicit bridge operations
             |
             v
       FQGate adapters
             |
             v
      127.0.0.1:17281
           FQGate
```

There is never an intended `cloudflared -> FQGate` direct route.

## Core components

### 1. Bootstrap / installer

Windows-oriented bootstrap logic should stay small and PowerShell-oriented:

- detect supported OS/architecture;
- prepare/install bridge payload in later packaging phases;
- create required directories;
- call TypeScript CLI/runtime for configuration and verification;
- later integrate startup/service/task behavior where appropriate.

Business logic belongs in TypeScript rather than duplicated PowerShell.

### 2. FQGate lifecycle and update manager

Responsibilities:

- read a registered trusted release source;
- select the Windows package;
- verify manifest schema, size, SHA-256, and candidate identity;
- maintain active/previous known-good binaries;
- start/stop/restart the FQGate desktop process;
- verify `--version` and `/v1/market/health`;
- invoke runtime `/openapi.json` validation, required Bridge path/method checks,
  and endpoint-specific compatibility probes during candidate activation;
- roll back when activation fails;
- expose one transaction interface reused by CLI and Dashboard through the
  framework-agnostic update application service.

Phase 0/1 implemented the lifecycle boundary. Phase 3 extends the same boundary rather than reimplementing updater logic in web routes.

#### Release-source registry

The source model is an explicit registry, not a URL text box.

Initial policy:

```text
github  -> enabled/default, fixed official repository + manifest rules
gitee   -> reserved adapter slot; disabled until an exact trusted mirror contract exists
```

Any future source must be code-registered and must enforce HTTPS/host/path/schema/integrity rules. Arbitrary manifest/executable URLs remain forbidden.

### 3. Runtime FQGate OpenAPI catalog

Phase 3 introduces a framework-agnostic service around the observed FQGate endpoint:

```text
GET http://127.0.0.1:17281/openapi.json
```

The upstream project also exposes local interactive docs at:

```text
http://127.0.0.1:17281/docs
```

The bridge should consume the JSON specification rather than copy or manually maintain the API catalog.

Responsibilities:

- fetch only the fixed loopback OpenAPI path;
- apply a bounded timeout and response-size limit;
- parse JSON and validate a supported OpenAPI shape;
- normalize errors without leaking upstream bodies;
- keep a short bounded cache;
- compute a deterministic schema fingerprint;
- enumerate path/method operations;
- compare two observed schemas for added/removed/changed operations;
- test the presence of path/method contracts required by bridge adapters;
- provide source data for local documentation and upgrade compatibility checks.

The service uses a short in-memory TTL cache, explicit refresh/invalidation, a
deterministic SHA-256 fingerprint over canonical JSON, bounded response bytes,
and normalized errors. FQGate restart, stop, and candidate activation
invalidate the cache. A required-contract failure is an activation failure and
therefore enters the existing rollback path.

OpenAPI is **descriptive, not authoritative for security**. An endpoint discovered in the schema is not remotely or locally bridge-callable unless it is separately represented by bridge policy.

The OpenAPI check supplements endpoint-specific contract parsing and probes. Schema presence does not prove runtime semantics.

### 4. Documentation/catalog model

The product should distinguish two concepts.

#### Upstream FQGate reference

Source: the running FQGate `/openapi.json`.

Purpose: tell the operator what the installed FQGate version documents.

Properties:

- may display the complete upstream catalog;
- follows upstream upgrades automatically;
- clearly labels version/fingerprint/time of observation;
- is reference-only by default;
- must not create a generic proxy or arbitrary `Try it out` path.

#### Bridge/remote API contract

Source: explicit bridge operation/mapping metadata, optionally enriched with schema details from the runtime upstream OpenAPI document.

Purpose: tell clients what the bridge actually permits.

Properties:

- deny-by-default;
- stable bridge-owned public paths;
- only registered operations appear;
- newly discovered upstream operations do not appear automatically;
- future remote interactive execution targets only bridge-approved routes.

Conceptually:

```text
runtime FQGate OpenAPI  -----> upstream reference catalog
          |
          +----> compatibility/mapping input
                         |
bridge operation registry ----+----> bridge/remote OpenAPI
```

It is not a simple transparent `intersection by path`: bridge public paths may differ from upstream paths, so the registry should own explicit mapping metadata.

### 5. Local application transport — TanStack Start

Phase 2 established TanStack Start as the local full-stack HTTP/UI transport.

Responsibilities:

- bind production only to IPv4 loopback;
- provide React 19/TanStack Router pages;
- provide explicit bridge-owned server routes;
- use TanStack Query for browser/server state;
- apply security headers and normalized bridge errors;
- host status, QR login, Phase 3 upgrade UI, and API reference UI;
- remain a thin transport over framework-agnostic services.

The production bundle is launched through `scripts/start-bridge.mjs`, defaults to `127.0.0.1:17282`, and must not become a generic upstream proxy.

TanStack Start is replaceable. Core services must not depend on Start-specific request/context types.

### 6. Bridge operation / policy registry

The bridge is **not** an unrestricted reverse proxy.

Every intended bridge operation should be represented explicitly by metadata such as:

- operation ID;
- public method/path;
- optional upstream method/path mapping;
- classification (`diagnostic`, `session`, `local-admin`, later `market-read`);
- local/remote exposure class;
- timeout;
- maximum request-body size;
- logging/sensitivity policy;
- compatibility requirement;
- documentation visibility.

The Phase 3 registry also records an optional upstream method/path mapping and
local-only exposure class. Runtime OpenAPI discovery never writes to this
registry.

There is no generic `/* -> FQGate`, no arbitrary upstream path parameter, and no fallback when an unknown route is requested.

Phase 3 local administrative install/update operations must be explicit operations, not hidden Start server-function bypasses.

### 7. FQGate API adapter

Responsibilities:

- own upstream HTTP-envelope decoding;
- validate endpoint-specific response data;
- normalize upstream errors/states;
- isolate observed FQGate quirks from bridge clients;
- enforce compatibility requirements before an operation reaches FQGate.

Existing health and QR adapters remain the model. Later read-only market-data routes should receive their own typed adapters or well-defined generic read adapters only after Phase 5 policy work.

### 8. QR flow registry

The browser receives an opaque random bridge session ID; upstream numeric FQGate `flow_id` stays server-side.

The registry remains:

- memory-only;
- TTL-bounded;
- count-bounded;
- cleared/tombstoned on terminal states;
- intentionally invalidated by bridge restart.

QR payloads, upstream flow IDs, credentials, and active login material are not persisted or logged.

### 9. Web UI

Baseline stack:

- React 19
- TanStack Start / TanStack Router
- TanStack Query
- Tailwind CSS v4
- shadcn/ui

Phase 3 adds two operator surfaces without changing the technology shape:

- FQGate version/update center;
- API reference/compatibility page.

The update center has explicit status, check, plan, and apply operations. A
plan identity includes the fixed source, candidate version, file name, size,
SHA-256, and installed candidate context; apply rejects stale identities. The
API reference page has separate Upstream FQGate, Bridge API, and
Compatibility/Changes views and never offers raw upstream execution.

The UI remains an operator dashboard, not a general web platform.

### 10. cloudflared manager — Phase 4

Responsibilities:

- detect installed version;
- download/verify official cloudflared distribution;
- adopt a remotely managed Tunnel token;
- install/reconfigure the Windows service;
- verify connector health;
- support controlled rollback when update work is later enabled.

Tunnel ingress targets the bridge loopback port only.

### 11. Cloudflare Access and remote policy — Phase 4/5

Phase 4 secures human Dashboard access with Access as part of the same remote milestone as Tunnel. Phase 5 adds machine authentication for the read-only API.

Human and machine policies should be separate. Cloudflare authentication does not authorize arbitrary FQGate operations; the bridge registry remains the authorization boundary.

### 12. Cloudflare provisioner — Phase 6

Setup-time functionality:

- validate scoped account/zone configuration;
- create/adopt a named Tunnel;
- create/adopt DNS records;
- configure ingress;
- help establish/verify Access prerequisites;
- provide plan/dry-run and drift detection.

Broad setup credentials should not remain required at runtime.

### 13. Supervisor/state machine — Phase 7

Suggested dimensions:

```text
bridge:      starting | ready | degraded | failed
fqgate:      stopped | starting | ready | unhealthy | incompatible
session:     connected | guest | login_required | login_in_progress | unknown
tunnel:      stopped | connecting | connected | degraded
updates:     idle | checking | available | applying | rollback | failed
openapi:     unknown | ready | changed | incompatible | failed
```

State transitions should feed logs, UI, event journal, and later notification providers.

### 14. Notification subsystem — Phase 7

Use a small provider interface rather than hard-code a vendor. An initial generic JSON webhook can be followed by optional adapters such as ntfy, Bark, Telegram, Feishu, or WeCom.

## Windows process model

FQGate is a desktop executable and may require an interactive user session. Phase 0/1 acceptance proved the bridge-managed process in that model.

Planned separation:

- `cloudflared`: Windows service in Phase 4+
- bridge backend: service only after packaging/runtime behavior is proven
- FQGate: interactive user-session process; Task Scheduler/logon startup may be added later

Do not claim headless Windows-service support for FQGate.

## Local networking rule

FQGate remains on:

```text
127.0.0.1:17281
```

The bridge remains on an IPv4 loopback address, default:

```text
127.0.0.1:17282
```

Adding OpenAPI discovery or API documentation does not relax either rule.

## Compatibility philosophy

The bridge should combine four signals rather than trust any one mechanism:

1. FQGate reported version;
2. endpoint-specific runtime parsing/probes;
3. runtime OpenAPI path/method/schema observations;
4. bridge compatibility policy and validation history.

Unknown or incompatible behavior should degrade/fail closed. A new upstream endpoint is information to review, not permission to expose it.
