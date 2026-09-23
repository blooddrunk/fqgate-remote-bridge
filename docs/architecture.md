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
- keep supported-but-unqualified candidates in a bounded qualification transaction;
- persist only artifact-bound operation evidence after candidate probes pass;
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
- allowed caller contexts as an independent policy dimension;
- whether the operation requires a separate remote-admin confirmation grant;
- timeout;
- maximum request-body size;
- logging/sensitivity policy;
- compatibility requirement;
- documentation visibility.

The Phase 3 registry records an optional upstream method/path mapping. Phase
4.5 replaces combination exposure enums with independent `allowedContexts` and
`requiresConfirmation` fields. Runtime OpenAPI discovery never writes to this
registry.

The safe Phase 4 surface is allowed for `local`, `remote_human`, and the
cryptographically verified `remote_admin` context. In the Phase 4 baseline the
four maintenance operations were local-only; the implemented 4.5C policy adds
remote-admin permission to exactly those four operations and no others. A
request context is classified from the explicit `Host` value:
accepted IPv4-loopback forms are local, the configured human hostname is
remote-human, and the optional distinct admin hostname is remote-admin only
after exact Cloudflare Access JWT verification. Every other Host is rejected.
`X-Forwarded-Host` is never consulted. Remote-human requests require a
non-empty `Cf-Access-Jwt-Assertion`; admin requests additionally validate
RS256, issuer, audience, temporal claims, and `kid` against a bounded cache
fetched only from the fixed team-domain cert endpoint.

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

The implementation keeps cloudflared semantics separate from the FQGate
release manifest. Its fixed source is the official Cloudflare GitHub release
metadata for a selected calendar-version tag and its fixed
`cloudflared-windows-amd64.exe` asset. The release body/API digest supplies
SHA-256 integrity, and the staged candidate must report the selected version
before activation. Installation is only triggered by explicit CLI commands.

Windows service integration is a narrow adapter around `sc.exe`; it validates
the token file before install/start/restart and creates a service command with
`tunnel run --token-file <path>`. The token file is outside the repository and
is protected through `icacls` for the service identity/administrators. The
fixed local origin contract is `http://127.0.0.1:17282`; no FQGate port or
arbitrary origin is accepted.

### 11. Cloudflare Access and remote policy — Phase 4/5

Phase 4 secures human Dashboard access with Access as part of the same remote milestone as Tunnel. Phase 5 adds machine authentication for the read-only API.

Human, admin, and machine policies are separate. Cloudflare authentication
does not authorize arbitrary FQGate operations; the bridge registry remains the
authorization boundary after Access succeeds. Phase 4.5A
adds an optional admin hostname/AUD and Bridge-side verifier; 4.5B keeps the
existing responsive application and server-side authorization model. The
implemented Phase 4.5C policy adds only the four explicitly named maintenance
operations to `remote_admin`, with a one-time confirmation for apply and
exact-origin/intent CSRF checks. Live Windows/Cloudflare acceptance completed
on 2026-09-19 and is recorded in the Phase 4.5 acceptance runbook.

The live request-matrix companion is deliberately outside this runtime
boundary. It launches a non-persistent headed browser context after the
operator completes Access login/MFA, keeps cookies/assertions/grants in
process memory, bounds response bodies, and never performs `updates.apply`.
Its output is limited to PASS/FAIL, bounded HTTP/error codes, redacted labels,
and timestamps.

Phase 4 assumes a manually created self-hosted Access application with a
human Allow policy and Protect with Access enabled on the published
application. Phase 5-A adds only the independent machine hostname, Access
application/AUD metadata, service-token JWT verifier, and
`remote_machine` request context. At that historical checkpoint its operation allowlist was intentionally
empty: a valid machine principal was denied by every existing operation and
machine-host page/static/raw paths cannot reach the TanStack application. No
Cloudflare API provisioning or market-data operation was implemented in 5-A. The real
Windows/Cloudflare human acceptance is recorded in the Phase 4 runbook and
handoff; Phase 4 remains closed.

Phase 5-B later granted the single bounded lookup, and Phase 5-C grants only
its registry-derived machine documentation operation. Neither changes the
historical 5-A evidence or grants any old human/admin operation.

### 12. Cloudflare control-plane discovery and plan — Phase 6-A

Phase 6-A is a framework-independent, read-only control-plane adapter under
`src/cloudflare/`. It uses the fixed Cloudflare API base and an allowlisted GET
transport to discover the exact account/zone, remotely-managed Tunnel and
configuration, three DNS records, three independent Access applications/AUDs and
their policies. The desired state is repo-external and the reconciler emits a
canonical, secret-free plan plus SHA-256 fingerprint.

The adapter has no POST/PUT/PATCH/DELETE/token-retrieval method and is not a
generic Cloudflare REST proxy. It never creates, adopts, updates or deletes
Cloudflare resources. Duplicate resources, broad ingress, direct FQGate origin
17281, wrong Bridge origin, unexpected AUD, Bypass/Everyone and policy widening
are explicit conflicts. Runtime FQGate OpenAPI and the Bridge registry remain
descriptive/authorization boundaries respectively.

The CLI surface is limited to `cloudflare discover` and `cloudflare plan`. It does
not add a Bridge route or change any `remote_machine` permission; the machine
allowlist remains exactly `market.instruments.lookup` and `openapi.machine`.

Phase 6-B may later contain separately reviewed mutation adapters and apply
transactions. It is not part of this architecture change.

### Post-Phase-6-A acceptance credential custody

Windows acceptance has an explicit Prompt/Vault source at the existing Phase
6-A and Phase 5-C/5-A entry points. The Vault provider addresses exactly three
current-user Credential Manager generic targets; it checks owner SID,
local-machine persistence, expiry and the non-secret account/zone or machine
hostname/AUD binding. It never enumerates or exports credentials. The existing
child-process environment boundary remains the only credential handoff to
the acceptance harness. The LocalSystem Tunnel token remains in a protected
file, independent of the user vault. Migration automation uses the bounded
cloudflared service controller and preserves an old-path rollback until full
remote verification and explicit finalization.

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

## Phase 5-B instrument lookup — CLOSED

`market.instruments.lookup` is the sole new market operation, POST
`/api/v1/instruments/lookup`, with contexts exactly local + remote_machine.
The framework-independent `src/fqgate/market` adapter accepts only a six-digit
code and dispatches fixed POST `/v1/market/catalog/search-symbols`. It filters
exact codes and returns only validated code/market/name/instrumentId fields.
No human/admin grant or old machine-operation grant changes.

Bounds: 256-byte public body, 5000 ms / 65536 bytes upstream, 16 upstream items,
16-character market/code fields, 128-character names, 32-character instrument
IDs. Unknown request fields fail before any upstream work; oversized or invalid
results fail instead of truncating. Upstream envelopes/messages never escape.
Redirects are disabled for market and contract fetches.

The historical Phase 5-B closure checked the managed running version (exact live-validated
1.0.1 and configured compatibility), then the bounded runtime OpenAPI operation plus its
transitive schema-reference fingerprint. The active maintenance track preserves that
historical 1.0.1 state through a narrowly scoped migration bridge, while new candidates
must persist artifact-bound operation evidence from `fqgate qualify`. Each lookup now
requires supported runtime state, its own stored operation evidence, a current approved
fingerprint matching that evidence, and the existing strict response decoder. This
conservative gate detects even nonbreaking changes to the selected contract; unrelated
added operations do not affect it. No cache grants stale market compatibility. Version or
contract failures are distinct from market availability/login/permission errors.
Health session `unknown` is not itself denial because the live reads succeeded.

This is an operation-local gate: update activation requirements and default
validated-version policy remain unchanged. Diagnostic/recovery operations remain
available. The machine top-level page/static/raw gate, separate JWT claim
profile, host/AUD isolation, and old-operation denial remain unchanged.
The historical Phase 5-A zero-privilege checkpoint above is not rewritten.

## Phase 5-C machine OpenAPI — closed

The Bridge owns a separate machine document at
`GET /api/v1/openapi/machine`, operation ID `openapi.machine`, allowed exactly
for `local` and `remote_machine`. The generator receives Bridge operation
registry entries, filters only entries whose `allowedContexts` includes
`remote_machine`, and requires explicit public documentation metadata on each
such entry. Registry invariants fail startup if a machine operation lacks that
metadata or a non-machine operation carries it.

The document is canonicalized and bounded to 64 KiB. It contains only the
Bridge public request/response/error schemas for the current lookup and docs
route. It has no dependency on runtime FQGate OpenAPI and emits no upstream
paths or schemas, compatibility fingerprints, filesystem/runtime state,
Access configuration, secrets, or human/admin/session/update operations.
Runtime FQGate discovery therefore cannot add a machine path or alter machine
authorization.

Closure acceptance on 2026-09-21 proved the exact two-path/five-schema document,
the approved lookup, old-operation and page/static/raw denial, human/admin
isolation, Bridge-only Tunnel ingress, and both loopback listeners through the
real machine Access application. Phase 5 adds no second market operation.

## Post-Phase-5 FQGate compatibility maintenance — active

The official stable 1.0.2 Windows x64 package is accepted only through the existing
fixed-source lifecycle transaction. The reviewed lookup ledger currently approves the
historical operation/transitive-schema fingerprint
`a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5` and the bounded
semantic probe `market.instruments.lookup.exact-code-v1`. A candidate outside the base
supported range, with a changed operation fingerprint, or with a failed semantic/base
contract/health probe is denied and rolled back. Runtime OpenAPI remains descriptive and
the Bridge registry remains the only authorization source.

The repeatable Windows command and external evidence contract are documented in
`docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`; the task remains
active until permanent Windows, remote-machine, and final-commit CI evidence is recorded.
