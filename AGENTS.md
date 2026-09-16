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

If implementation ideas conflict with those documents, update the design explicitly before changing behavior.

## Project intent

The project securely exposes selected **read-only FQGate market-data capabilities and login/session operations** from an always-on Windows PC through a controlled local bridge, with Cloudflare Tunnel and Cloudflare Access added only in later phases.

It is an independent infrastructure/adapter project. It must not make `turtle-value-engine` or any other consumer depend exclusively on FQGate.

## Non-negotiable rules

- Keep FQGate bound to loopback.
- Keep the bridge bound to loopback.
- Never create a generic catch-all reverse proxy to FQGate.
- New upstream FQGate endpoints are denied until explicitly registered.
- Do not implement or expose trading, order, cancellation, fund-transfer, brokerage-control, or other state-changing financial endpoints.
- Never request a Cloudflare Global API Key; use scoped API tokens when Cloudflare work begins.
- Do not commit secrets, QR payloads, login/session material, Access secrets, or tunnel tokens.
- Do not vendor or redistribute the FQGate executable. Download from the official upstream release source and verify checksum/size.
- Fail closed when upstream compatibility cannot be established.
- Preserve a known-good rollback path before replacing runtime binaries.
- Preserve Phase 0/1 lifecycle behavior while adding later layers.

## Windows-first runtime model

Initial deployment target is a permanently-on Windows x64 PC.

Phase 0/1 proved FQGate running as a bridge-managed desktop process in an interactive user session. Do not claim headless Windows-service support for FQGate.

Later architecture may use:

- `cloudflared`: Windows service
- bridge backend: service if/when packaging proves it safe
- FQGate: interactive user-session process, potentially launched/supervised through Task Scheduler in a later phase

## Phase 2 implementation shape

Phase 0 + Phase 1 are fully closed. The current active implementation package is Phase 2.

Use:

- Node.js 22+
- TypeScript
- pnpm
- React 19
- TanStack Start as the Phase 2 full-stack framework/server transport
- TanStack Router through Start
- TanStack Query for browser/server state where justified
- Vite-based Start builds
- Tailwind CSS v4
- shadcn/ui as the baseline UI component source
- PowerShell only for Windows bootstrap/service/task integration

### Important Phase 2 decisions

- TanStack Start replaces the earlier Fastify + Vue plan.
- Do not run a second Fastify backend in Phase 2.
- Keep the repository as one package; do not introduce a monorepo without a concrete independent-deployment requirement.
- Treat TanStack Start as a replaceable transport/UI shell because it is still pre-v1/RC.
- Keep lifecycle, compatibility, QR-flow, policy, and FQGate protocol logic framework-agnostic.
- Do not use experimental React Server Components in Phase 2.
- Use shadcn/ui first; do not add Aceternity UI/Magic UI or heavy visual dependencies merely for decoration.

Keep framework surface small. This is an operations/security bridge, not a general web platform.

## Architecture constraints

Separate modules/interfaces for:

- FQGate release source and compatibility
- FQGate process/lifecycle
- FQGate API adapter
- bridge operation/policy registry
- QR-flow adapter and ephemeral flow registry
- TanStack Start route/UI transport
- cloudflared lifecycle (later phase)
- Cloudflare provisioning (later phase)
- supervisor state machine (later phase)
- secret store (later phase)
- notification providers (later phase)

External behavior should be testable through interfaces without needing real Cloudflare/FQGate for most unit tests.

Route files and React components must remain thin. They should not own upstream parsing, compatibility, lifecycle, or security policy.

## Upstream compatibility discipline

Treat upstream FQGate API details as observations, not permanent public contracts.

At minimum, isolate:

- `/v1/market/health`
- QR begin/poll APIs
- MCP behavior
- WebSocket behavior

Use fixtures/contract probes and version gates. Unknown/unsupported versions should degrade safely rather than trigger transparent pass-through.

## Bridge operation security checklist

Before adding a bridge endpoint or server-side operation answer all of these in code/review:

1. Is the operation allowed by project scope?
2. Why is browser/remote access required?
3. Which HTTP method/path or Start operation is exposed?
4. Is it explicitly represented by the bridge operation/policy registry?
5. What request-body size and timeout limits apply?
6. Can request/response logs expose sensitive material?
7. What upstream versions have been validated?
8. What happens if upstream adds fields or changes semantics?
9. Does compatibility failure deny the operation?
10. Is there any chance this is a trading/account-control operation?

If the endpoint changes financial/account state, it is out of scope.

No TanStack Start server route/function may become an implicit privileged bypass around the bridge operation policy.

## QR handling rules

QR/session handling is sensitive even though it is not a password flow.

- Never log QR base64 data.
- Never log upstream numeric flow IDs.
- Do not persist QR images or active QR sessions to disk/browser storage.
- Prefer bridge-owned opaque session identifiers over exposing upstream identifiers.
- Bound TTL and active flow count.
- Normalize upstream expiration/replacement semantics behind the adapter.

## Testing expectations

Prefer automated tests for:

- manifest parsing
- checksum mismatch
- version compatibility
- route/operation allowlist and deny behavior
- loopback-only binding
- QR flow lifecycle/expiry/replacement
- secret/QR redaction
- bridge error normalization
- supervisor transitions (when implemented)
- notification deduplication (when implemented)
- update rollback

Phase 2 should include meaningful React behavior tests and a small deterministic browser E2E flow using fakes. Normal CI must not require real FQGate login or Cloudflare credentials.

Windows acceptance tests should cover lifecycle/runtime behavior that CI cannot faithfully emulate.

Cloudflare integration tests should remain credential-gated and must not be introduced in Phase 2.

## Development sequence

Follow `docs/roadmap.md`.

- Phase 0: CLOSED
- Phase 1: CLOSED
- Phase 2: current implementation target
- Phase 3+: do not opportunistically implement

The active Phase 2 acceptance contract is:

`docs/tasks/phase-2-tanstack-local-bridge-and-qr-ui.md`

## Documentation rule

When an implementation materially changes:

- security boundary,
- upstream assumption,
- runtime topology,
- framework/build shape,
- operator workflow, or
- phase completion state,

update the corresponding documentation in the same change.
