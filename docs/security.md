# Security Model

## Security objective

The project exists to make a local FQGate instance remotely usable **without turning FQGate itself into an Internet-facing service**.

The security model uses layered controls:

1. FQGate binds to loopback only.
2. The bridge binds to loopback only.
3. `cloudflared` creates outbound-only connectivity in later phases.
4. Cloudflare Access authenticates users and machines in later phases.
5. The bridge applies its own explicit route allowlist and method policy.
6. Runtime OpenAPI is descriptive only and never grants authorization.
7. Secrets are stored outside source control and redacted from logs.

No single layer should be treated as sufficient on its own.

## Trust boundaries

### Trusted local zone

- bridge process
- FQGate process
- local lifecycle/update state
- local OpenAPI discovery cache
- `cloudflared` process in later phases
- local configuration/secrets store

### External control plane

- Cloudflare Tunnel / Access in later phases
- trusted registered FQGate release sources
- official cloudflared distribution in later phases

### Untrusted / semi-trusted clients

- browser requests, even when originating locally
- remote browsers in later phases
- remote agents and consuming applications in later phases
- upstream FQGate API responses and OpenAPI documents, which must be parsed defensively

Cloudflare authentication proves an identity/service credential was accepted; it does **not** authorize arbitrary FQGate operations. Authorization remains constrained by the bridge route policy.

## FQGate exposure policy

The bridge must never implement a catch-all rule such as:

```text
/* -> http://127.0.0.1:17281/*
```

Supported upstream paths must be represented explicitly.

Each intended operation should include policy metadata such as:

- bridge operation ID
- public HTTP method/path
- optional upstream method/path mapping
- classification
- allowed caller contexts as an independent policy dimension
- confirmation requirement for high-impact remote-admin operations
- timeout
- maximum body size
- logging/sensitivity policy
- compatibility requirement
- documentation visibility

A new FQGate upstream endpoint is **not reachable through the bridge by default**.

## Runtime OpenAPI boundary

FQGate exposes a runtime document at:

```text
http://127.0.0.1:17281/openapi.json
```

This document is treated as untrusted structured input.

Security requirements:

- the fetch target is fixed in code/config policy to loopback; no arbitrary OpenAPI URL;
- timeout and maximum response size are enforced;
- malformed/unsupported documents fail closed;
- raw upstream bodies are not logged on parse/validation failure;
- discovered operations cannot mutate or extend the route registry at runtime;
- full upstream reference may show an endpoint that is unavailable through the bridge;
- remote interactive documentation, when added later, may execute only bridge-approved public routes;
- schema availability/presence does not replace endpoint-specific semantic validation.

Threat: upstream FQGate adds a sensitive or dangerous endpoint.

Mitigation: the endpoint can appear in the upstream reference/diff view, but remains non-callable until a bridge developer explicitly implements and registers an allowed operation. Financial state-changing operations remain out of project scope regardless of upstream documentation.

## Trading boundary

The project deliberately excludes trading and brokerage control.

Even if a future/older FQGate exposes trading-related APIs, this project must not proxy them. This includes order placement, cancellation, fund transfer, brokerage/account control, and comparable financial state mutation.

## Phase 3 local administrative boundary

Phase 3 adds local FQGate installation/update actions to the Dashboard. These are privileged local maintenance operations, not market-data operations.

Requirements:

- they remain reachable only through the loopback bridge in Phase 3;
- each action is explicitly represented by bridge-owned policy metadata;
- no unconstrained TanStack server function may bypass operation policy;
- update check occurs only after an explicit user action;
- installation/update requires plan/preview and explicit confirmation;
- confirmation is bound to the intended candidate/plan identity;
- only one mutating lifecycle transaction runs at a time;
- page load, startup, polling, or a background timer must not silently download/activate FQGate;
- CLI and Dashboard must reuse the same lifecycle/update transaction;
- failures preserve or restore the previous known-good binary where the established lifecycle transaction supports rollback.

The exposed local operations are explicit registry entries only:

```text
GET  /api/v1/updates/status
POST /api/v1/updates/check
POST /api/v1/updates/plan
POST /api/v1/updates/apply
GET  /api/v1/openapi/catalog
POST /api/v1/openapi/refresh
```

`updates/apply` accepts only a server-issued plan identity. It does not accept
release URLs, executable URLs, manifest bodies, or upstream paths. The update
service re-checks the fixed trusted candidate before passing the original plan
to the lifecycle manager. Runtime OpenAPI catalog responses contain bounded
structural metadata rather than the raw upstream document.

## Release source / supply-chain policy

### FQGate

- default source remains a code-registered official GitHub source;
- future Gitee support requires a fixed, documented trusted repository/path contract;
- arbitrary manifest/release/executable URLs are forbidden;
- fetch manifest through a source-specific adapter;
- validate manifest schema;
- require expected file size and SHA-256;
- validate candidate identity/version;
- stage before replacement;
- preserve previous known-good binary;
- verify health after activation;
- Phase 3 additionally verifies the runtime OpenAPI required-contract baseline before activation is considered successful;
- the Runtime OpenAPI target is fixed to `http://127.0.0.1:17281/openapi.json`;
- rollback on failed activation when safe.

OpenAPI compatibility is not a binary equality check against the whole upstream API. Unrelated added endpoints do not automatically block an update; missing/invalid bridge-required contracts do.

### cloudflared (later phase)

- download from official Cloudflare distribution/release source;
- validate official integrity metadata when available;
- stage/health-check before considering an update successful.

### Bridge

- releases should identify source version/commit;
- release checksums should be published in packaging phases;
- updater must not execute arbitrary remote scripts.

## Update transaction state

Any Phase 3 state persisted for crash recovery/history must be minimal and non-secret.

Allowed examples:

- transaction ID
- source identifier
- planned/target version
- bounded timestamps/status/error code
- candidate checksum already public in manifest
- rollback/success state

Do not persist:

- executable bytes in history records
- QR/session data
- login credentials/cookies
- Cloudflare secrets
- authorization headers
- arbitrary upstream response bodies

## Cloudflare credentials (later phase)

### Setup-time API token

Use only a scoped API token with permissions required to provision/adopt Tunnel/DNS/related resources. Never request/document Global API Key use.

### Tunnel runtime credential

Use the remotely managed tunnel runtime token in a repo-external Windows ACL
protected file. The service invocation uses
`cloudflared tunnel run --token-file <path>` and never embeds the raw value in
the service command line. Token-file creation/read/ACL verification is
fail-closed; status only reports `secure`, `missing`, `unreadable`, or
`insecure`, never file contents. The current code has no token input in normal
JSON configuration and no Cloudflare provisioning API path.

### Machine access

Machine callers should use Cloudflare Access service credentials or another Access-supported identity, separate from human login policy.

## Secret storage

Later Windows implementation should use one of:

- Windows Credential Manager; or
- DPAPI-protected local configuration.

Plaintext `.env` may be used only as an explicit development fallback and must remain ignored by Git.

Potential secrets include Cloudflare setup tokens, tunnel tokens, Access service credentials used by self-tests, and notifier credentials.

## Logging and redaction

Structured logs are the default.

Never log:

- Cloudflare credentials
- Access secrets
- Tunnel credentials
- QR image payloads
- SMS verification data
- FQGate saved credentials/cookies/session material
- upstream numeric QR flow IDs
- full authorization headers
- raw failed OpenAPI response bodies

Prefer route/operation IDs over raw sensitive URLs. OpenAPI diagnostics should record bounded metadata such as status, byte count, OpenAPI version, operation count, and fingerprint rather than entire documents.

## Browser UI security

The local and future remote UI should:

- use secure response headers;
- avoid persisting active QR state in browser storage;
- avoid exposing local filesystem secrets/credentials;
- distinguish reference documentation from executable bridge operations;
- never embed a raw upstream documentation page in a way that creates an execution bypass.

The current TanStack Start SSR shell may require its narrowly scoped inline hydration bootstrap; `unsafe-eval`, wildcard CORS, and unconstrained external connections remain disallowed.

## Current local API boundary

Phase 2 established explicit same-origin loopback routes for status and QR login. Phase 3 may add explicit update/OpenAPI/catalog operations, but it must preserve the same model:

- no route parameter selecting an arbitrary FQGate path;
- unknown methods/routes rejected;
- request/body/timeout limits applied;
- normalized errors;
- no stack/upstream body leakage;
- no generic `/v1/*` fallback.

## API authentication and authorization (remote phases)

The bridge will rely on Cloudflare Access at the edge and adds defense-in-depth
verification for the separate administrator application.

At minimum:

- UI and API hostnames are protected by Access;
- human and machine policies are distinguishable;
- local administrative/update operations are not automatically exposed under a generic machine market-data policy;
- bridge route policy remains authoritative after Access succeeds.

### Phase 4 remote-human boundary

The bridge classifies every request from the explicit `Host` header (falling
back to the server URL only when the runtime did not provide a Host header for
the request object):

- `127.0.0.1`/`localhost` with no port or the configured bridge port is local;
- exactly one configured DNS hostname is remote-human;
- all unknown values fail closed with a normalized host error.

`X-Forwarded-Host`, `Forwarded`, source IP, and other proxy metadata do not
select a context. A remote-human request must contain a non-empty
`Cf-Access-Jwt-Assertion`. This is only an assertion-presence/drift check;
Cloudflare `Protect with Access` at the published application is the primary
JWT validation layer. The assertion value is never placed in structured log
context, diagnostics, responses, browser state, or test fixtures.

The operation registry has a complete Phase 4.5 matrix. Its authorization
model stores allowed caller contexts independently from operation intent and
confirmation requirements. The seven safe Dashboard/status, QR, read-only
update status, and reference catalog operations allow `local`,
`remote_human`, and a successfully verified `remote_admin` context. The
implemented 4.5C policy adds remote-admin permission to exactly
`updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh`; all
other operations remain outside that context. The handler enforces the matrix
before dispatch, so hiding a button is not an authorization control.

### Phase 4.5A remote-admin authentication boundary

The optional admin hostname is distinct from the ordinary human hostname and
is paired with a separate Cloudflare Access application audience. The Bridge
derives the only accepted cert endpoint as:

```text
https://<configured-team>.cloudflareaccess.com/cdn-cgi/access/certs
```

The configured team hostname and audience are non-secret metadata. No arbitrary
JWKS URL is accepted. The bounded in-memory JWK cache is limited by size,
key-count, timeout, and TTL; an unknown `kid` causes at most one fixed-endpoint
refresh. Admin assertions must pass maintained-library RS256 verification,
exact derived issuer, exact audience, required `sub`/`iat`/`exp`, and temporal
claim checks. Only `{ kind, subject, audience }` is propagated as the principal;
the assertion is never logged, persisted, echoed, or placed in browser state.

The intended admin Access application is human-only and independently requires
the operator identity, MFA, a short session, Protect with Access, and no Bypass
or Service Auth policy. The current operator-approved low-friction deployment
profile does not require WARP, client certificates, hostname mTLS, or device
posture because they conflict with the operator's OpenWrt/daed/passwall2 path.
Edge policy remains the primary Access validation layer; Bridge-side
cryptographic validation is a fail-closed drift/authentication check. A future
deployment may opt into device posture as a separate documented profile, but it
must not be inherited by a future `remote_machine` context.

Remote-admin control POSTs enabled by 4.5C, including the existing QR session
POSTs, use the exact HTTPS admin Origin and a Bridge-owned non-simple intent
header. Wildcard CORS remains forbidden.
Remote `updates.apply` additionally consumes a short-lived, one-time,
memory-only confirmation grant bound to the verified principal, admin
audience, exact operation, and exact update plan/candidate identity. The real
Windows x64 + Cloudflare evidence was completed on 2026-09-19 and is recorded
in the Phase 4.5 acceptance runbook; the phase is CLOSED.

Unknown/raw `/v1/...` routes are still rejected before any FQGate request is
made. The top-level application transport applies the same Host/assertion
gate to page and static requests, so an untrusted Host cannot use a UI route
as a side channel.

The live acceptance companion uses a headed, non-persistent Playwright browser
context. It keeps the Access browser session and any short-lived confirmation
grant in memory only, bounds response reads, emits only bounded status/error
codes, and never calls `updates.apply`. This is an acceptance tool, not a
runtime authorization path; deterministic tests remain the evidence for
principal/operation binding and concurrent redemption cases whose successful
consumer would otherwise activate a real update.

### Phase 5-A remote-machine boundary — zero operation privilege

The machine/API hostname is exact and distinct from both human hostnames. It is
paired with separate non-secret team-domain/AUD metadata; service-token Client
ID/Secret are never Bridge configuration. The Bridge derives the same fixed
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` endpoint and bounded
in-memory JWK cache used by the cryptographic transport, but the machine claim
validator is separate from the human-admin validator. It requires RS256,
exact issuer and exact single machine AUD, valid `iat`/`exp`/optional `nbf`,
`type=app`, bounded non-empty `common_name`, and the service-token empty-string
`sub` semantics. It returns only `{ kind: "machine", subject, audience }`.
Human-admin tokens continue to require non-empty `sub`; neither principal kind
can impersonate the other.

Phase 5-A recognizes `remote_machine` as a request context but adds it to no
registered operation's `allowedContexts`. A valid machine assertion therefore
receives normalized `OPERATION_FORBIDDEN` for every current operation. The
top-level Start/Nitro request gate also rejects machine-host page, static, and
unregistered/raw routes before they can render the human Dashboard or form a
proxy side channel. Cloudflare service-token acceptance is separate evidence;
deterministic tests remain the complete dangerous-operation deny matrix.

## Network constraints

Desired posture:

- no inbound WAN rule for FQGate;
- no inbound WAN rule for bridge;
- no router port forwarding;
- both FQGate and bridge remain loopback-bound;
- outbound HTTPS allowed only as needed for trusted release sources, Cloudflare in later phases, and configured notifiers.

## Threats considered

### Malicious/unexpected runtime OpenAPI document

Mitigations:

- fixed loopback target;
- bounded fetch size/time;
- structural validation;
- no raw logging;
- schema cannot change authorization;
- fail closed for required compatibility.

### Stale update confirmation

Mitigation:

- bind confirmation to candidate/plan identity and reject when release state changed.

### Concurrent update requests

Mitigation:

- one mutating lifecycle transaction at a time; duplicate/parallel applies rejected or deterministically serialized.

### Upstream adds dangerous endpoints

Mitigation:

- deny-by-default registry; reference visibility does not imply callability; financial state-changing endpoints remain forbidden.

### Compromised/incorrect upstream package

Mitigations:

- trusted fixed source registry;
- size/SHA-256 verification;
- candidate identity/version checks;
- compatibility/health/OpenAPI probes;
- staged activation and rollback.

### Stolen Cloudflare Access service token (later phase)

Mitigations:

- narrow Access policy;
- bridge allowlist;
- token rotation;
- no trading routes;
- audit/event logs.

### Cloudflare Tunnel misconfiguration (later phase)

Mitigations:

- Access-protected remote milestone;
- self-tests for expected protection;
- no direct FQGate ingress;
- bridge still enforces route policy.

## Security acceptance criteria before first remote release

A release is not remotely deployable until all are true:

- direct intended external access to FQGate is impossible;
- bridge only binds to loopback;
- unknown/raw upstream paths are rejected;
- runtime OpenAPI cannot create routes;
- remote UI/API are protected by Cloudflare Access;
- secrets are absent from repo/standard logs;
- package integrity/update rollback are tested;
- QR payloads are ephemeral;
- no trading/state-changing financial endpoints are registered;
- remote approved API tests pass through Access.
