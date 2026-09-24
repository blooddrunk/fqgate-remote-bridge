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
- the post-Phase-5 qualification path may admit an in-range, not-yet-validated candidate only through a bounded transaction that runs the required base-contract and operation-specific probes;
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

## Cloudflare credentials and control-plane access

### Setup-time API token

Phase 6-A accepts only a time-bounded, least-privilege, read-only API token
limited to the exact account/zone and the discovery resources. The original
acceptance used the permanent-Windows hidden `Read-Host -AsSecureString`
boundary; the closed custody task also permits explicit current-user Vault
reuse. The value is briefly passed to a child process environment. It must not appear in a CLI
argument, repository file, ordinary environment configuration, log, plan or
evidence. Never request or document Global API Key use.

The Phase 6-A client uses a fixed API origin, fixed GET paths, timeout, redirect
rejection, bounded bodies and bounded pagination. That transport remains
independently GET-only. Phase 6-B1 adds a separate typed DNS-write transport for
one missing desired CNAME per invocation, guarded by two current-plan fingerprint
checks. It can delete only the record ID returned by that same invocation for
rollback. Its acceptance-only TXT writer can use only the fixed reserved
`_fqgate-remote-bridge-phase6b-canary.<desired-zone>` name and is not reachable
through production apply or a Bridge HTTP route. The write token is separate
from the existing three-entry credential Vault, entered through hidden local
PowerShell input, scoped to DNS write for the exact zone, and passed only to a
bounded child process environment. Production CLI apply is refused outside
Windows before discovery or mutation, because its mandatory Phase 5-C remote
regression runs in the accepted Windows environment. No generic REST proxy, Tunnel-token
retrieval, Access application/policy mutation, or Tunnel configuration mutation
is authorized. Phase 6-B1's live canary, post-canary Phase 6-A/Phase 5-C
regressions and exact-commit Ubuntu/Windows CI passed on 2026-09-24. Its closed
scope remains limited to guarded one-at-a-time desired DNS CNAME creation and
same-invocation rollback. Phase 6-B2/C remain separately unauthorized.

Phase 6-A closed with hidden-entry live acceptance on implementation commit
`9c6babb`. The post-Phase-6-A acceptance credential custody task is defined in
`docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md`.
Its implementation adds an explicit Prompt/Vault selector and Windows
Credential Manager generic credentials for the invoking user; such credentials
remain readable by processes running as that user, so they do not defend
against compromise of the Windows account. Stored acceptance credentials must
remain least-privilege and expire/rotate according to Cloudflare. The Vault
source reads only three fixed current-user targets with owner, expiry and
non-secret deployment binding checks; missing or invalid entries fail closed.
The prompt path remains available. On 2026-09-24, real Vault-backed Phase 6-A
and Phase 5-C acceptance, protected LocalSystem Tunnel-token migration,
human/admin/machine regression and old-directory retirement passed. The old
Cloudflare API-token file was deleted locally; this did not revoke the remote
token. The closure evidence is in
`docs/status/post-phase-6-a-credential-custody-implementation-handoff.md`.
The same task relocated the LocalSystem cloudflared Tunnel token to the
protected ProgramData token-file path; it never stores that runtime token in
the invoking user's Credential Manager.

### Tunnel runtime credential

Use the remotely managed tunnel runtime token in a repo-external Windows ACL
protected file. The service invocation uses
`cloudflared tunnel run --token-file <path>` and never embeds the raw value in
the service command line. Token-file creation/read/ACL verification is
fail-closed; status only reports `secure`, `missing`, `unreadable`, or
`insecure`, never file contents. The current code has no token input in normal
JSON configuration. Phase 6-A now has only the read-only discovery/plan API path;
it has no Cloudflare mutation or token-retrieval path.

### Machine access

Machine callers should use Cloudflare Access service credentials or another Access-supported identity, separate from human login policy.

## Secret storage

The permanent Windows acceptance backend uses Windows Credential Manager for
exactly three fixed current-user targets. The LocalSystem Tunnel token remains
in a protected service file.

Plaintext `.env` may be used only as an explicit development fallback and must remain ignored by Git.
It is never an acceptance-credential backend for the permanent Windows host.

The old `D:\code\research\fqgate-secrets` directory had broad inherited ACLs
and was removed after zero-consumer proof. The LocalSystem Tunnel token now
resides in the protected
`C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token` file. The local
file/service migration did not rotate or provision Cloudflare tokens.

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

At the Phase 5-A checkpoint, `remote_machine` was added to no registered
operation's `allowedContexts`, so a valid machine assertion received normalized
`OPERATION_FORBIDDEN` for every then-current operation. The
top-level Start/Nitro request gate also rejects machine-host page, static, and
unregistered/raw routes before they can render the human Dashboard or form a
proxy side channel. Cloudflare service-token acceptance is separate evidence;
deterministic tests remain the complete dangerous-operation deny matrix.
Later Phase 5-B and 5-C grants are limited to the bounded lookup and machine
documentation operations and do not rewrite that historical checkpoint.

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
transitive schema-reference fingerprint. The active maintenance track keeps that old state
usable through a narrowly scoped migration bridge. New candidates instead persist
artifact-bound operation evidence from `fqgate qualify`; each lookup requires supported
runtime state, its own operation evidence, a current approved fingerprint matching that
evidence, and the existing strict decoder. This conservative gate detects even nonbreaking
changes to the selected contract and requires renewed evidence; unrelated added operations
do not affect it. No cache grants stale market compatibility. The actual result is parsed
again on every call. Version or contract failures are distinct from market
availability/login/permission errors.
Health session `unknown` is not itself denial because the live reads succeeded.

This is an operation-local gate: update activation requirements and default
validated-version policy remain unchanged. Diagnostic/recovery operations remain
available. The machine top-level page/static/raw gate, separate JWT claim
profile, host/AUD isolation, and old-operation denial remain unchanged.
The historical Phase 5-A zero-privilege checkpoint above is not rewritten.

## Post-Phase-5 qualification boundary — closed

The official stable 1.0.2 Windows x64 artifact is fixed by the manifest identity
`FQGate-1.0.2-windows-x64-UNSIGNED.exe`, size `23065088`, SHA-256
`024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`. These values
are checked before activation; they do not by themselves certify compatibility.

The reviewed lookup evidence ledger contains operation ID
`market.instruments.lookup`, the approved operation/transitive-schema fingerprint
`a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5`, and semantic probe
`market.instruments.lookup.exact-code-v1`. The candidate transaction stores only these
bounded metadata values and a timestamp. It stores no raw OpenAPI, market payload,
credential, JWT, QR/session material, or Access metadata.

A changed fingerprint, failed semantic result, missing base contract, invalid runtime
OpenAPI, failed health check, or activation error fails closed and invokes the existing
automatic rollback path. The machine allowlist remains exactly
`market.instruments.lookup` plus `openapi.machine`; no human/admin/old machine permission
changes. The permanent-Windows procedure is
`docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`. Its
external evidence and final-commit CI passed; the closure record is
`docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`.

## Phase 5-C machine documentation boundary — closed

`openapi.machine` serves `GET /api/v1/openapi/machine` only to `local` and a
cryptographically verified `remote_machine`. It is a normal policy-registered
operation; human and administrator contexts do not receive it. Its output is
generated only from operation-registry entries explicitly allowed for
`remote_machine` and carrying explicit public schema metadata. Runtime FQGate
OpenAPI is never consulted while generating it.

The deterministic document is limited to 64 KiB and currently describes only
the six-digit instrument lookup and its own documentation route. It excludes
upstream envelopes/routes/schema names, compatibility fingerprints, local
paths, Access team/AUD data, credentials, QR/session/update/admin operations,
and runtime observations. Any later machine operation requires a reviewed
registry permission plus explicit documentation metadata and tests; upstream
discovery cannot grant either authority.

Permanent-Windows and real service-token acceptance on 2026-09-21 passed with
machine-derived local and remote totals. The existing Access application,
hostname, AUD, service token, Tunnel and Bridge-only ingress were reused without
Cloudflare mutation. No credential, assertion, cookie, raw OpenAPI, compatibility
fingerprint, QR/session material or raw market value entered Git or evidence.
