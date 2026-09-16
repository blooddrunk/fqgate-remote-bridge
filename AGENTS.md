# AGENTS.md

This file is the working contract for coding agents contributing to `fqgate-remote-bridge`.

## Source of truth

Before implementing anything, read in this order:

1. `README.md`
2. `docs/architecture.md`
3. `docs/security.md`
4. `docs/upstream-contracts.md`
5. `docs/roadmap.md`

If implementation ideas conflict with those documents, update the design explicitly before changing behavior.

## Project intent

The project securely exposes selected **read-only FQGate market-data capabilities** from an always-on Windows PC through Cloudflare Tunnel and Cloudflare Access.

It is an independent infrastructure/adapter project. It must not make `turtle-value-engine` or any other consumer depend exclusively on FQGate.

## Non-negotiable rules

- Keep FQGate bound to loopback.
- Keep the bridge bound to loopback by default.
- Never create a generic catch-all reverse proxy to FQGate.
- New upstream FQGate endpoints are denied until explicitly registered.
- Do not implement or expose trading, order, cancellation, fund-transfer, brokerage-control, or other state-changing financial endpoints.
- Never request a Cloudflare Global API Key; use scoped API tokens.
- Do not commit secrets, QR payloads, login/session material, Access secrets, or tunnel tokens.
- Do not vendor or redistribute the FQGate executable. Download from the official upstream release source and verify checksum/size.
- Fail closed when upstream compatibility cannot be established.
- Preserve a known-good rollback path before replacing runtime binaries.

## Windows-first runtime model

Initial deployment target is a permanently-on Windows x64 PC.

Assume:

- `cloudflared` can run as a Windows service.
- bridge backend should run as a service if feasible.
- FQGate may require an interactive desktop/user session; use Task Scheduler/logon startup until headless service behavior is proven.

Do not claim full headless FQGate support without an explicit Windows acceptance test.

## Preferred implementation shape

- Node.js 22+
- TypeScript
- pnpm
- Fastify for bridge HTTP/API
- Vue 3 + Vite for the minimal UI
- PowerShell for Windows bootstrap/service/task integration only

Keep framework surface small. This is an operations/security bridge, not a general web platform.

## Architecture constraints

Separate modules/interfaces for:

- FQGate release source and compatibility
- FQGate process/lifecycle
- FQGate API adapter
- bridge route registry
- cloudflared lifecycle
- Cloudflare provisioning
- supervisor state machine
- secret store
- notification providers

External behavior should be testable through interfaces without needing real Cloudflare/FQGate for most unit tests.

## Upstream compatibility discipline

Treat upstream FQGate API details as observations, not permanent public contracts.

At minimum, isolate:

- `/v1/market/health`
- QR begin/poll APIs
- MCP behavior
- WebSocket behavior

Use fixtures/contract probes and version gates. Unknown/unsupported versions should degrade safely rather than trigger transparent pass-through.

## Security review checklist for every remote endpoint

Before adding a remote endpoint answer all of these in code/review:

1. Is the endpoint read-only?
2. Why is remote access required?
3. Which HTTP method/path is allowed?
4. What Access identity class may call it?
5. What body-size and timeout limits apply?
6. Can request/response logs expose sensitive material?
7. What upstream versions have been validated?
8. What happens if upstream adds fields or changes semantics?
9. Is the route denied by default when compatibility checks fail?

If the endpoint changes financial/account state, it is out of scope.

## Testing expectations

Prefer automated tests for:

- manifest parsing
- checksum mismatch
- version compatibility
- route allowlist/deny behavior
- secret redaction
- supervisor transitions
- notification deduplication
- update rollback

Windows acceptance tests should cover lifecycle/service/task behavior that CI cannot faithfully emulate.

Cloudflare integration tests should be optional and credential-gated; normal CI must not require real Cloudflare secrets.

## Development sequence

Follow `docs/roadmap.md`. The first implementation package should be Phase 0 + Phase 1 only.

Do not opportunistically implement later Cloudflare/MCP/UI features while foundational lifecycle semantics are unfinished.

## Documentation rule

When an implementation materially changes:

- security boundary,
- upstream assumption,
- runtime topology,
- operator workflow, or
- phase completion state,

update the corresponding documentation in the same change.
