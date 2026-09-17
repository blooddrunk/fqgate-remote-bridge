# Runtime OpenAPI and Remote API Documentation Design

Status: **Phase 3 local foundation verified; remote exposure deferred to Phase 4/5**.

## Why this exists

FQGate exposes a browser API documentation page and a runtime OpenAPI document on the local service:

```text
http://127.0.0.1:17281/docs
http://127.0.0.1:17281/openapi.json
```

The upstream Python SDK explicitly states that complete parameters and return fields should follow the running `/openapi.json`. That makes the runtime document the best available source for keeping the FQGate API catalog synchronized with the installed version.

The bridge should therefore **consume** the runtime OpenAPI document rather than copy, vendor, or manually reproduce the upstream API documentation.

The current local implementation fetches only
`http://127.0.0.1:17281/openapi.json`, validates and bounds it, caches it for a
short TTL, computes a canonical SHA-256 fingerprint, and returns a structural
catalog to the local Reference UI. It does not expose the raw document or
proxy `/docs`.

## Core design rule

Runtime OpenAPI is a **description source**, not an **authorization source**.

A path appearing in `/openapi.json` means only that the running FQGate describes that path. It does not mean the path is safe, supported by this project, remotely callable, or compatible with the bridge.

The bridge must continue to deny unknown/new upstream operations by default.

## Two documentation views

### 1. Upstream FQGate reference

Purpose: answer "what does my currently running FQGate claim to support?"

Source:

```text
GET 127.0.0.1:17281/openapi.json
```

Properties:

- complete upstream catalog when the schema is valid;
- automatically follows the installed FQGate version;
- displays observed FQGate version, fetch time, and schema fingerprint;
- may show operations that the bridge does not support;
- clearly labels unsupported/unapproved operations;
- reference-only in Phase 3;
- future remote human access is protected by Cloudflare Access;
- it must not provide a generic raw-upstream execution path.

### 2. Bridge/remote API reference

Purpose: answer "what does FQGate Remote Bridge actually allow clients to call?"

Primary source:

- explicit bridge operation/policy registry;
- explicit public-to-upstream mapping metadata;
- bridge-owned request/response schemas where appropriate.

Runtime OpenAPI may enrich descriptions and compatibility checks, but may not add routes automatically.

Properties:

- contains only approved bridge operations;
- uses bridge public paths, which may differ from upstream paths;
- can eventually produce a filtered bridge-owned OpenAPI document;
- later interactive `Try it out` targets only the bridge API;
- newly added upstream operations remain absent until explicitly approved and implemented.

## Why not proxy FQGate `/docs` directly

A transparent proxy would create multiple risks:

- links/scripts may assume the original FQGate origin/path;
- `Try it out` can naturally target raw `/v1/...` paths;
- a future upstream endpoint could become executable without bridge review;
- the approach blurs the security boundary between documentation and authorization;
- it conflicts with the project rule against a generic reverse proxy.

The bridge may imitate or embed a standards-based documentation renderer, but its data source and execution target must remain under bridge control.

## Runtime OpenAPI service

Recommended framework-agnostic responsibility boundary:

```text
FqgateOpenApiService
```

The exact class/module name is implementation-defined.

### Fetch policy

Only fetch the fixed local target:

```text
http://127.0.0.1:17281/openapi.json
```

Never accept an operator-supplied URL.

Apply:

- short request timeout;
- maximum response size;
- JSON content validation;
- OpenAPI version/shape validation;
- bounded normalized errors;
- no raw response body logging.

### Cache policy

Use a short in-memory TTL. The cache exists only to avoid repeatedly fetching a large schema during ordinary page rendering/polling.

Requirements:

- bounded entries (normally one current document is enough);
- invalidated after FQGate restart/update activation;
- refreshable by explicit operator action;
- no long-term assumption that the schema stays unchanged for the life of the process.

### Fingerprint

Compute a deterministic fingerprint, preferably SHA-256 over canonicalized JSON.

Use cases:

- show whether the schema changed after an upgrade;
- identify the exact observed contract in diagnostics/status;
- compare current vs candidate/previous observations;
- avoid persisting the entire upstream document in long-lived history.

## Compatibility and diff model

At minimum detect:

- added path/method;
- removed path/method;
- bridge-required operation missing;
- mapped operation no longer matching expected method/path;
- high-level request/response schema change when practical.

Do not overclaim semantic compatibility from structural OpenAPI comparison alone.

Endpoint-specific adapters still own runtime parsing and semantic checks.

Recommended statuses:

```text
unchanged
changed-compatible-observation
review-required
incompatible
unavailable
```

The exact naming is implementation-defined, but `unknown`/`unavailable` must never be treated as safe.

## Upgrade integration

The Phase 3 update activation pipeline should conceptually become:

```text
trusted release source
  -> manifest validation
  -> bounded download
  -> size check
  -> SHA-256 check
  -> candidate identity/version
  -> version compatibility policy
  -> activate candidate
  -> health probe
  -> runtime /openapi.json probe
  -> required bridge contract check
  -> success
```

If activation fails after replacement, use the existing known-good rollback path.

The OpenAPI compatibility probe should not require that every upstream endpoint remain unchanged. It should focus on bridge-required operations and surface other changes to the operator for review.

## Bridge operation mapping metadata

Long term, the registry should be able to represent something like:

```text
operationId
public method/path
upstream method/path (optional)
classification
local/remote exposure class
authentication class
compatibility requirement
documentation visibility
request/response handling policy
```

This metadata is the basis for generating the bridge-owned remote API reference.

Do not simply filter the upstream OpenAPI by identical path strings: the bridge should be free to normalize or rename public routes.

## Local Phase 3 UX

Suggested Dashboard navigation:

```text
Overview
Login
Updates
API Reference
```

The API Reference page may contain tabs:

```text
Upstream FQGate
Bridge API
Compatibility / Changes
```

Useful information:

- FQGate version;
- OpenAPI version;
- schema fingerprint;
- last fetch time;
- total upstream operations;
- approved bridge operations;
- upstream-only operations;
- missing required mappings;
- added/removed operation summary.

Keep copy explicit:

> "Appears in FQGate" does not mean "available remotely".

## Remote Phase 4/5 behavior

### Phase 4 — human reference through Access

An authenticated human may view the Dashboard and upstream reference through Cloudflare Access.

Full upstream reference remains reference-only.

### Phase 5 — machine API + bridge docs

Expose only bridge-approved read-only operations.

Generate a bridge-owned OpenAPI document from the operation registry and bridge contracts. Interactive documentation may execute these bridge paths through the Access-protected remote API hostname.

The upstream full-reference catalog remains separately labeled and must not be used as a remote routing table.

## Security invariants

- no generic path proxy;
- no raw `/v1/*` pass-through;
- no arbitrary upstream/OpenAPI URL;
- schema discovery cannot mutate the route registry at runtime;
- unknown operations remain denied;
- no trading or other financial state-changing operations;
- no logging of sensitive upstream bodies or session material;
- both FQGate and bridge remain loopback-only through Phase 3;
- remote documentation is not accepted until Access protects the remote UI.

## Test requirements

Use deterministic fixtures for normal CI:

- valid OpenAPI document;
- malformed JSON;
- unsupported/malformed OpenAPI shape;
- oversized response;
- timeout;
- required path missing;
- path added;
- path removed;
- method changed;
- fingerprint stable under deterministic canonicalization;
- unregistered discovered path stays denied by the bridge;
- full-reference catalog can include an operation that bridge catalog excludes;
- update compatibility check fails closed when required contract is unavailable.

A Windows acceptance should also verify the live running FQGate `/openapi.json` and record only bounded non-sensitive evidence, not the full document unless intentionally needed for a fixture and safe to commit.
