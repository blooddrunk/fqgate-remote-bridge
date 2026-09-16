# Security Model

## Security objective

The project exists to make a local FQGate instance remotely usable **without turning FQGate itself into an Internet-facing service**.

The security model uses layered controls:

1. FQGate binds to loopback only.
2. The bridge binds to loopback only.
3. `cloudflared` creates outbound-only connectivity.
4. Cloudflare Access authenticates users and machines.
5. The bridge applies its own explicit route allowlist and method policy.
6. Secrets are stored outside source control and redacted from logs.

No single layer should be treated as sufficient on its own.

## Trust boundaries

### Trusted local zone

- bridge process
- FQGate process
- cloudflared process
- local configuration/secrets store

### External control plane

- Cloudflare Tunnel
- Cloudflare Access
- GitHub upstream release repositories

### Untrusted / semi-trusted clients

- remote browsers
- remote agents
- consuming applications

Cloudflare authentication proves an identity or service credential was accepted; it does **not** authorize arbitrary FQGate operations. Authorization remains constrained by the bridge route policy.

## FQGate exposure policy

The bridge must never implement a catch-all rule such as:

```text
/* -> http://127.0.0.1:17281/*
```

Instead, supported upstream paths must be registered explicitly.

Each route declaration should include:

- HTTP method
- upstream path
- read-only classification
- authentication class
- timeout
- maximum body size
- compatibility requirement
- whether response streaming/WebSocket behavior is allowed

A new FQGate upstream endpoint is **not remotely reachable by default**.

## Trading boundary

The project deliberately excludes trading and brokerage control.

Even if a future or older FQGate version exposes trading-related APIs, this project must not automatically proxy them. Adding any state-changing financial endpoint would require a separate project-level design decision and explicit review; it is outside the current scope.

## Cloudflare credentials

### Setup-time API token

Use a scoped API token with only the permissions required to provision/adopt the tunnel and DNS records. Do not ask for or document use of the Global API Key.

The setup flow should support removing the provisioning token after successful configuration.

### Tunnel runtime credential

Use the remotely-managed tunnel token required by `cloudflared` at runtime. Store it using an OS-protected mechanism where practical and ensure it is never printed in diagnostics.

### Machine access

Machine-to-machine callers should use Cloudflare Access service credentials or another Access-supported machine identity. Human login and machine login should have separate policies.

## Secret storage

Initial Windows implementation should use one of:

- Windows Credential Manager, or
- DPAPI-protected local configuration

Plaintext `.env` may be allowed only as an explicit development-mode fallback and must be ignored by Git.

Potential secrets include:

- Cloudflare provisioning token
- tunnel token
- Cloudflare Access service credentials used for self-tests
- notifier credentials/webhook secrets

## Logging and redaction

Structured logs should be the default.

Never log:

- Cloudflare API/token values
- Access client secrets
- tunnel credentials
- QR image payloads
- SMS verification data
- FQGate saved credentials/cookies/session material
- full authorization headers

Request logs should prefer route IDs over raw URLs when query strings may contain sensitive values.

## Browser login page

The login UI is protected by Cloudflare Access and should additionally:

- use secure response headers
- reject cross-site form requests where applicable
- avoid persisting QR image/session information in browser storage
- expire local QR flows promptly
- not expose administrative configuration endpoints to ordinary login-page users

QR image data should remain ephemeral.

## Phase 2 local API boundary

The Phase 2 bridge exposes only these same-origin, loopback routes:

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

The registry rejects duplicate/wildcard/raw-upstream paths at module load, and
the HTTP handler rejects unknown routes, wrong methods, query strings, oversized
bodies, and malformed JSON. There is no route parameter that selects an arbitrary
FQGate path. The QR begin body is an empty JSON object; the adapter sends
`cache_credentials: false` upstream. The browser receives only an opaque UUID
session ID. The upstream numeric `flow_id` and QR image are held in bounded
process memory, expire after 120 seconds, and are never written to storage or
logs. At most three active QR flows are retained; replacement and terminal
states are tombstoned briefly so stale polling cannot revive a flow.

Bridge-generated errors use `{ error: { code, message, requestId } }`. Messages
are stable and generic; request bodies, QR payloads, upstream flow IDs, response
details, and stack traces are not returned. Response headers include no-store,
same-origin framing/resource policies, `nosniff`, `no-referrer`, and a restrictive
CSP. The current TanStack Start SSR output includes an inline hydration bootstrap,
so `script-src` permits inline scripts only for this framework-generated output;
`unsafe-eval`, external scripts, wildcard CORS, and external `connect-src` values
remain disallowed.

## API authentication and authorization

The bridge should rely on Cloudflare Access at the edge and also support defense-in-depth verification where practical.

At minimum:

- API and UI hostnames should be protected by Access policies.
- machine API access should be distinguishable from human browser access.
- administrative endpoints should not share the same policy as read-only market-data access.

## Updates and supply chain

### FQGate

- fetch upstream stable manifest
- require expected file size and SHA-256
- download only from the documented upstream repository/release URL
- stage before replacing active binary
- preserve previous known-good binary
- verify version and health after activation
- roll back on failed activation when safe

### cloudflared

- download from official Cloudflare distribution/GitHub release source
- verify release integrity/signature/checksum when official metadata makes that practical
- stage and health-check before considering update successful

### Bridge

- releases should be reproducible enough to identify version/commit
- release checksums should be published
- updater should not execute unsigned arbitrary scripts from remote sources

## Network constraints

Desired local firewall posture:

- no inbound WAN rule for FQGate
- no inbound WAN rule for bridge
- no router port forwarding
- outbound HTTPS allowed for Cloudflare, GitHub/upstream downloads, and notifier destinations

## Threats considered

### Stolen Cloudflare Access service token

Mitigations:

- narrow Access application/policy
- bridge route allowlist
- token rotation support
- no trading routes
- audit logs

### Cloudflare Tunnel misconfiguration

Mitigations:

- startup self-check confirms expected Access protection
- documentation warns against public bypass hostname
- bridge still enforces route allowlist

### Upstream FQGate adds dangerous endpoints

Mitigation:

- deny-by-default route registry; no transparent proxy

### Compromised upstream download

Mitigations:

- checksum verification against upstream manifest
- staged activation
- rollback
- optional pin/freeze policy

### FQGate protocol changes

Mitigations:

- compatibility profile
- startup probes
- fail closed for unsupported operations
- expose `incompatible` state rather than forwarding blindly

## Security acceptance criteria for first remote release

A release is not considered remotely deployable until all are true:

- direct external access to FQGate is impossible by intended configuration
- bridge only binds to loopback
- unknown proxy paths are rejected
- Cloudflare Access is required for UI and API hostnames
- secrets are absent from repository and standard logs
- upstream package checksum verification is tested
- login QR payloads are ephemeral
- no trading endpoints are registered
- remote health/API tests pass through Access
