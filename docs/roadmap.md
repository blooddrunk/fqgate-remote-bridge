# Development Roadmap

This roadmap is ordered to reduce risk early. The first goal is not a polished UI; it is proving that the complete local-to-remote path can be made secure, observable, and recoverable.

## Phase 0 — Repository and contracts

Status: **implementation and closure fixes complete; Windows host acceptance remains external**.

Deliverables:

- repository structure
- architecture and security docs
- upstream compatibility ledger
- TypeScript workspace skeleton
- configuration schema
- structured logging conventions
- test harness and CI baseline

Exit criteria:

- repository builds on Windows and CI
- secrets cannot be committed accidentally through normal examples/config
- upstream assumptions are isolated behind adapter interfaces

## Phase 1 — Local FQGate lifecycle manager

Status: **implementation and closure fixes complete; real Windows x64 acceptance remains pending**.

Goal: reliably own FQGate installation and runtime on one Windows machine before any Internet exposure exists.

Deliverables:

- read official FQGate stable manifest
- select Windows architecture package
- download with timeout/retry
- verify file size and SHA-256
- install into application data directory
- detect installed/running version
- maintain previous known-good executable
- start/stop/restart FQGate
- probe `GET /v1/market/health`
- model FQGate and market-session state
- PowerShell bootstrap for Windows

Required tests:

- fresh install
- no-op install when checksum already matches
- checksum mismatch rejection
- interrupted download
- failed activation
- rollback path
- FQGate absent/stopped/unhealthy

Exit criteria:

A clean Windows host can install and start FQGate safely, and the manager can distinguish process health from market-session/login health. Automated fixtures, Linux checks, and Windows CI cover the testable boundary; the clean-host acceptance must still be run on real Windows before this exit criterion is marked fully closed.

## Phase 2 — Local bridge API and QR login UI

Goal: put a controlled application boundary in front of FQGate while still remaining local-only.

Deliverables:

- Fastify bridge bound to `127.0.0.1`
- bridge health/version/capability endpoints
- explicit route registry
- FQGate compatibility adapter
- QR login begin/poll adapter
- minimal Vue status/login UI
- session-state display
- error normalization
- structured/redacted logs

Security requirements:

- no catch-all reverse proxy
- unknown paths denied
- QR image/session data remains ephemeral
- no trading endpoints

Exit criteria:

From another browser on the same Windows host, the user can view status, initiate a QR login, scan it, and observe session recovery through the bridge without interacting with the FQGate UI.

## Phase 3 — cloudflared lifecycle and manual Tunnel integration

Goal: prove remote connectivity while keeping Cloudflare provisioning partly manual.

Deliverables:

- install/update/detect `cloudflared`
- install/start/stop Windows cloudflared service
- accept a pre-created remotely-managed tunnel token
- route tunnel ingress to local bridge
- remote UI hostname
- remote API hostname
- deployment diagnostics

Exit criteria:

A remote browser can reach the protected login/status UI through a manually configured Cloudflare Tunnel; FQGate itself remains unreachable directly.

## Phase 4 — Cloudflare Access and machine authentication

Goal: make the remote deployment safe enough for real use.

Deliverables:

- documented human Access policy
- documented/service-token machine policy
- API-path authentication model
- optional defense-in-depth Access JWT verification if practical
- self-test that detects obvious Access bypass/misconfiguration
- remote read-only API smoke tests

Exit criteria:

- unauthenticated UI request is rejected by Access
- unauthenticated API request is rejected by Access
- authenticated human can use QR login UI
- authenticated service identity can call an allowlisted read-only API
- unknown FQGate routes remain unreachable

## Phase 5 — Automated Cloudflare provisioning

Goal: move initial deployment toward one guided setup flow.

Deliverables:

- scoped Cloudflare API token validation
- account/zone validation
- create/adopt named tunnel
- create/adopt DNS records
- configure tunnel ingress
- obtain/install runtime tunnel credential
- configuration drift detection
- idempotent setup
- safe `--dry-run`/plan output

Important behavior:

- provisioning credentials are setup-time credentials
- runtime should not require broad DNS/Tunnel edit permissions
- existing Cloudflare resources are adopted only when identity/configuration matches expectations

Exit criteria:

A clean supported Windows machine plus a scoped Cloudflare token and operator-selected domain/hostnames can reach a working, Access-protected deployment without manually editing tunnel configuration.

## Phase 6 — Supervisor, recovery, and notifications

Goal: make the system suitable for an always-on PC.

Deliverables:

- supervisor state machine
- process restart policy
- tunnel health monitoring
- session/login-expiration detection
- update state monitoring
- generic webhook notifier
- alert deduplication/cooldown
- recovery notifications
- local event journal

Events should include at least:

- FQGate stopped/crashed/recovered
- FQGate incompatible
- market login required/recovered
- tunnel disconnected/recovered
- bridge degraded/recovered
- update available/applied/rolled back/failed

Exit criteria:

Common failures can be injected and produce exactly one actionable incident notification plus a recovery notification when service returns.

## Phase 7 — Safe automatic updates

Goal: reduce routine maintenance without allowing upstream changes to silently break remote access.

Deliverables:

- configurable update policy for FQGate
- configurable update policy for cloudflared
- staged updates
- compatibility probes
- rollback on activation failure
- maintenance window option
- manual pin/freeze option
- update history

Default policy should be conservative until multiple upstream releases have been observed in practice.

Exit criteria:

Both FQGate and cloudflared can update and recover from a deliberately broken candidate without leaving the bridge permanently unavailable.

## Phase 8 — MCP and realtime streaming compatibility

Goal: expose richer FQGate capabilities only after the basic read-only HTTP path is stable.

Deliverables:

- remote MCP protocol investigation and contract tests
- Access service-token integration for MCP clients
- long-lived request/stream timeout handling
- WebSocket proxy for selected market stream use cases
- reconnect/backpressure behavior
- documented consumer examples

Exit criteria:

MCP and/or WebSocket are enabled only where end-to-end behavior through Access + Tunnel is reliable and preserves the bridge allowlist/security model.

## Phase 9 — Packaging and operator UX

Goal: make deployment maintainable without a developer workstation.

Deliverables:

- versioned Windows release artifact
- installer/bootstrap command
- uninstall/reconfigure flow
- diagnostics bundle with secret redaction
- configuration migration
- operator documentation
- troubleshooting guide
- release checksums

Exit criteria:

A non-development Windows machine can install, upgrade, diagnose, and uninstall the project using documented commands.

## Future / optional

Not required for the first useful release:

- multiple FQGate hosts with failover
- local LAN-only mode without Cloudflare
- alternative tunnels such as Tailscale/Headscale
- multiple notifier adapters
- richer metrics/Prometheus exporter
- provider-specific adapter for `turtle-value-engine`

These should be added only if real usage justifies them.

## Suggested first development handoff

The first coding task should cover **Phase 0 + Phase 1 only**. Do not begin Cloudflare integration until FQGate lifecycle management and health semantics work reliably on the target Windows host.
