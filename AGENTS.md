# AGENTS.md

This file is the working contract for coding agents contributing to `fqgate-remote-bridge`.

## Source of truth

Before implementing anything, read in this order:

1. `README.md`
2. `docs/architecture.md`
3. `docs/security.md`
4. `docs/upstream-contracts.md`
5. `docs/roadmap.md`
6. the active phase task package under `docs/tasks/`
7. relevant design notes under `docs/plans/`
8. `docs/agent-guide.md`

If implementation ideas conflict with those documents, update the design explicitly before changing behavior.

## Project intent

The project securely exposes selected **read-only FQGate market-data capabilities and login/session operations** from an always-on Windows PC through a controlled local bridge. FQGate itself remains local-first and must never become Internet-facing.

It is an independent infrastructure/adapter project. It must not make `turtle-value-engine` or any other consumer depend exclusively on FQGate.

## Non-negotiable rules

- Keep FQGate bound to IPv4 loopback, normally `127.0.0.1:17281`.
- Keep the bridge bound to IPv4 loopback, normally `127.0.0.1:17282`.
- Never create a LAN/WAN listener or router port-forward for either service.
- Never create a generic catch-all reverse proxy to FQGate.
- New upstream FQGate endpoints are denied until explicitly implemented and registered.
- Runtime `/openapi.json` is a description/discovery source, never an authorization source.
- Do not expose trading, order, cancellation, fund-transfer, brokerage-control, or other state-changing financial endpoints.
- Never request a Cloudflare Global API Key. Phase 4 adopts a pre-created remotely-managed Tunnel and human Access policy; API provisioning belongs to Phase 6.
- Do not commit Tunnel tokens, Access assertions/secrets, QR payloads, login/session material, or other credentials.
- Preserve all closed Phase 0/1/2/3 behavior while adding Phase 4.

## Completed baseline

Phase 0 through Phase 3 are closed.

The current application uses Node.js 22+, TypeScript, pnpm, React 19, TanStack Start/Router/Query, Vite, Tailwind CSS v4, and shadcn/ui. TanStack Start is a replaceable transport/UI shell: lifecycle, compatibility, OpenAPI discovery, remote-exposure policy, cloudflared lifecycle, QR policy, and FQGate protocol logic must stay framework-agnostic.

Phase 3 delivered the local update center and runtime OpenAPI/API Reference. The bridge operation registry currently owns every callable bridge route and deny-by-default behavior.

## Active Phase 4 contract

The active task package is:

`docs/tasks/phase-4-cloudflare-tunnel-access.md`

The primary design note is:

`docs/plans/phase-4-secure-remote-human-access.md`

The Codex handoff is:

`docs/prompts/phase-4-codex-goal.md`

Phase 4 is **Secure Remote Human Access only**. Its purpose is to let an authenticated human reach selected Dashboard and QR/status/reference surfaces through Cloudflare Tunnel + Cloudflare Access while FQGate and the bridge remain loopback-only.

### Remote exposure is an explicit bridge policy

Do not treat `cloudflared -> 127.0.0.1:17282` as permission to expose every local operation.

Evolve the bridge operation policy so every operation has an explicit exposure class and request context is fail-closed.

Phase 4 intended remote-human surface:

- `bridge.version`
- `bridge.capabilities`
- `bridge.status`
- `session.qr.begin`
- `session.qr.poll`
- `updates.status` (read-only status only)
- `openapi.catalog` (reference-only catalog)

Phase 4 operations that must remain **local-only**:

- `updates.check`
- `updates.plan`
- `updates.apply`
- `openapi.refresh`

Phase 4 must not add remote market-data operations. Those belong to Phase 5.

The exact implementation may refine names/types, but the security outcome above is mandatory.

### Request-context rules

Remote/local classification must not be inferred from `X-Forwarded-Host` or another untrusted forwarding header.

The design target is:

- loopback Host/origin accepted as local context;
- exactly configured remote human hostname accepted as remote-human context;
- any unknown Host rejected fail-closed;
- a remote-human request must also present the Cloudflare Access assertion expected after Access authentication;
- the assertion itself must never be logged.

Cloudflare Tunnel's **Protect with Access** origin setting should be required for the published hostname so `cloudflared` validates the Access JWT before proxying to the loopback bridge. A bridge-side assertion-presence check is defense-in-depth/drift detection, not a replacement for Cloudflare cryptographic validation.

### cloudflared rules

- Use a remotely-managed Tunnel for Phase 4.
- Adopt a pre-created Tunnel token; do not create Tunnel/DNS/Access resources through the Cloudflare API in Phase 4.
- Tunnel ingress/published application service must target only `http://127.0.0.1:17282`, never FQGate port `17281`.
- Download `cloudflared` only from a fixed official Cloudflare release source; do not accept arbitrary binary URLs.
- Validate release identity and published integrity information before activation.
- Windows `cloudflared` updates are manual/explicit in this project. Do not add a background update loop.
- Prefer `cloudflared tunnel run --token-file <PATH>` for a remotely-managed Tunnel so the token is not embedded in the Windows service command line. Require a cloudflared version that supports `--token-file`.
- Store the token file outside the repository with restrictive Windows ACLs. Never put the token in application JSON, standard logs, diagnostics, UI state, or persistent browser storage.
- Keep PowerShell limited to Windows service/ACL/bootstrap integration; lifecycle/policy logic belongs in testable TypeScript services/interfaces.

### Cloudflare Access rules

Phase 4 uses a manually created self-hosted Access application and human policy. Human identity is distinct from the future machine/service-token policy in Phase 5.

Authenticated human access does not authorize arbitrary bridge operations. The bridge policy remains the operation-authorization boundary after Access succeeds.

### Remote UI behavior

The remote UI may expose Dashboard/status, QR login, read-only update status, and API Reference. It must not provide a working remote button/path for update check/plan/apply or explicit OpenAPI refresh.

Reference documentation remains descriptive only. No raw upstream `Try it out` or arbitrary upstream path execution may appear.

## Phase 4 non-goals

Do not opportunistically implement:

- Phase 5 remote machine/read-only market-data API;
- Access service-token machine authentication;
- automated Tunnel/DNS/Access provisioning or Cloudflare API-token workflows;
- supervisor/notifications;
- automatic background updates;
- MCP or WebSocket proxying;
- packaging/release installers beyond what Phase 4 needs for cloudflared Windows acceptance;
- trading or other financial state-changing operations.

## Windows-first runtime model

Initial deployment remains a permanently-on Windows x64 PC.

- `cloudflared`: Windows service in Phase 4.
- bridge backend: remains the existing loopback process; do not claim Windows-service support unless separately proven.
- FQGate: interactive user-session process; do not claim headless Windows-service support.

## Architecture constraints

Keep separate, testable modules/interfaces for:

- FQGate release source / compatibility / lifecycle;
- FQGate API adapters;
- runtime FQGate OpenAPI discovery;
- bridge operation/policy registry and remote exposure gate;
- QR flow registry;
- TanStack Start route/UI transport;
- cloudflared release/lifecycle/service management;
- secret/token storage abstraction;
- Cloudflare provisioning (Phase 6, not Phase 4);
- supervisor and notification providers (later phases).

Route files and React components must remain thin. They must not own authorization, Host classification, Tunnel-token handling, Windows service lifecycle, upstream parsing, or update transactions.

## Testing expectations

Normal CI must not require real FQGate login or Cloudflare credentials. Use deterministic fixtures/fakes for most tests.

Phase 4 automated coverage should include at least:

- local versus remote-human request-context classification;
- unknown Host denial;
- forwarded-host spoofing does not alter context;
- remote request without expected Access assertion is denied;
- remote-human allowed-operation matrix;
- local-admin update/refresh operations are denied remotely but continue to work locally;
- raw/unregistered upstream paths remain denied;
- Tunnel token and Access assertion redaction;
- fixed cloudflared release-source/integrity checks and arbitrary URL rejection;
- generated Windows service invocation contains a token-file path, not a raw Tunnel token;
- current QR/session and Phase 3 regression tests.

Target Windows x64 acceptance should prove, when real Cloudflare credentials/resources are available:

- FQGate and bridge still have only their loopback listeners;
- cloudflared runs as the Windows service and reconnects after service restart;
- the service definition/process command does not contain the raw Tunnel token;
- the protected public hostname rejects/challenges unauthenticated traffic;
- an authenticated human can use Dashboard/status and QR flow;
- remote local-admin operations are denied;
- raw/unregistered FQGate paths remain unreachable;
- local-only maintenance operations remain usable locally.

If real Cloudflare acceptance cannot be performed, document the missing evidence and do not mark Phase 4 closed.

## Development sequence

Follow `docs/roadmap.md`.

- Phase 0: CLOSED
- Phase 1: CLOSED
- Phase 2: CLOSED
- Phase 3: CLOSED
- Phase 4: ACTIVE
- Phase 5+: do not opportunistically implement

## Documentation rule

When implementation changes the security boundary, request-context model, Cloudflare assumptions, runtime topology, Windows service/token behavior, operator workflow, or phase completion state, update the corresponding source-of-truth documentation in the same change.
