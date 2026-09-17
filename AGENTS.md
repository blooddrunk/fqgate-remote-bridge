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

If implementation ideas conflict with those documents, update the design explicitly before changing behavior.

## Project intent

The project securely exposes selected **read-only FQGate market-data capabilities and login/session operations** from an always-on Windows PC through a controlled local bridge. Cloudflare Tunnel and Cloudflare Access are later layers; FQGate itself remains local-first.

It is an independent infrastructure/adapter project. It must not make `turtle-value-engine` or any other consumer depend exclusively on FQGate.

## Non-negotiable rules

- Keep FQGate bound to loopback.
- Keep the bridge bound to loopback.
- Never create a generic catch-all reverse proxy to FQGate.
- New upstream FQGate endpoints are denied until explicitly registered.
- Runtime `/openapi.json` is an upstream **description/discovery source**, never an authorization source.
- Showing an upstream endpoint in documentation must never make it callable through the bridge.
- Do not implement or expose trading, order, cancellation, fund-transfer, brokerage-control, or other state-changing financial endpoints.
- Never request a Cloudflare Global API Key; use scoped API tokens when Cloudflare work begins.
- Do not commit secrets, QR payloads, login/session material, Access secrets, or tunnel tokens.
- Do not vendor or redistribute the FQGate executable. Download from a registered trusted upstream source and verify checksum/size.
- Fail closed when upstream compatibility cannot be established.
- Preserve a known-good rollback path before replacing runtime binaries.
- Preserve closed Phase 0/1/2 behavior while adding later layers.

## Windows-first runtime model

Initial deployment target is a permanently-on Windows x64 PC.

Phase 0/1 proved FQGate running as a bridge-managed desktop process in an interactive user session. Do not claim headless Windows-service support for FQGate.

Later architecture may use:

- `cloudflared`: Windows service
- bridge backend: service if/when packaging proves it safe
- FQGate: interactive user-session process, potentially launched/supervised through Task Scheduler in a later phase

## Current implementation baseline

Phase 0 + Phase 1 + Phase 2 are fully closed. The current implementation uses:

- Node.js 22+
- TypeScript
- pnpm
- React 19
- TanStack Start / TanStack Router
- TanStack Query
- Vite
- Tailwind CSS v4
- shadcn/ui
- PowerShell only for Windows bootstrap/service/task integration

The production bridge defaults to `127.0.0.1:17282` and must always force IPv4 loopback binding. FQGate remains at `127.0.0.1:17281`.

TanStack Start is a replaceable transport/UI shell. Lifecycle, compatibility, OpenAPI discovery, update transactions, QR-flow policy, and FQGate protocol logic must remain framework-agnostic.

Do not introduce a second backend or a monorepo without a concrete independent-deployment requirement.

## Completed Phase 3 contract

The completed task package is:

`docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`

Relevant design notes:

- `docs/plans/fqgate-install-upgrade-dashboard.md`
- `docs/plans/runtime-openapi-and-remote-docs.md`

Phase 3 implementation and target Windows x64 acceptance are complete. It remains
**local-only**. It must not implement Cloudflare Tunnel,
Cloudflare Access, public/LAN listeners, remote market-data APIs, MCP, WebSocket
proxying, supervisor/notifications, or automatic background updates.

### Phase 3A — upgrade center

- Reuse the existing lifecycle transaction; do not duplicate updater logic in routes/components.
- GitHub remains the default registered FQGate release source.
- A Gitee source may be represented by an adapter/registry slot only after its exact trusted repository/path contract is documented. Never accept an arbitrary manifest or executable URL.
- Dashboard install/update requires an explicit user action, a plan/preview, and explicit confirmation.
- Page load, bridge startup, and background timers must not silently download or activate FQGate.
- Candidate activation must preserve known-good rollback and use size/hash/version/compatibility/health checks.
- Overlapping update transactions must be rejected or serialized deterministically.

### Phase 3B — runtime OpenAPI/docs

Observed upstream local endpoints:

```text
GET http://127.0.0.1:17281/openapi.json
GET http://127.0.0.1:17281/docs
```

The project should consume `/openapi.json`, not copy or manually re-maintain the FQGate API catalog.

Rules:

- Fetch only the fixed loopback endpoint; do not accept a user-supplied OpenAPI URL.
- Bound timeout and response size.
- Validate JSON/OpenAPI shape before using it.
- Use a short bounded cache and deterministic schema fingerprint.
- The full upstream-reference view may list every FQGate endpoint, but it is reference-only and must not create a proxy path or interactive bypass.
- A bridge/remote contract is generated only from explicit operation/mapping metadata.
- Unknown/new upstream paths remain denied.
- OpenAPI checks supplement endpoint-specific adapters/contract tests; schema presence alone does not prove semantic compatibility.
- The implemented service fetches only `http://127.0.0.1:17281/openapi.json`,
  exposes bounded structural catalog metadata, and invalidates its short cache
  after managed FQGate restart/activation.

## Architecture constraints

Separate modules/interfaces for:

- FQGate release source and compatibility
- FQGate process/lifecycle/update transaction
- FQGate API adapter
- runtime FQGate OpenAPI discovery/catalog/diff
- bridge operation/policy registry
- QR-flow adapter and ephemeral flow registry
- TanStack Start route/UI transport
- cloudflared lifecycle (later phase)
- Cloudflare provisioning (later phase)
- secret store (later phase)
- supervisor state machine (later phase)
- notification providers (later phase)

External behavior should be testable through interfaces without needing real Cloudflare/FQGate for normal CI.

Route files and React components must remain thin. They should not own upstream parsing, compatibility, update transactions, OpenAPI filtering, lifecycle, or security policy.

## Upstream compatibility discipline

Treat upstream FQGate API details as observations, not permanent public contracts.

At minimum, isolate and test:

- `/v1/market/health`
- QR begin/poll APIs
- `/openapi.json`
- MCP behavior (later phase)
- WebSocket behavior (later phase)

Use fixtures, runtime probes, version gates, and explicit bridge policy. Unknown/unsupported versions should degrade safely rather than trigger transparent pass-through.

## Bridge operation security checklist

Before adding a bridge endpoint or server-side operation answer all of these in code/review:

1. Is the operation allowed by project scope?
2. Why is browser/remote access required?
3. Which public method/path is exposed?
4. Which upstream method/path, if any, does it map to?
5. Is it explicitly represented by the bridge operation/policy registry?
6. What request-body size and timeout limits apply?
7. Can request/response logs expose sensitive material?
8. What upstream versions/contracts have been validated?
9. What happens if upstream adds fields or changes semantics?
10. Does compatibility failure deny the operation?
11. Is there any chance this changes financial/account state?

If the operation changes financial/account state, it is out of scope.

No TanStack Start route/function and no OpenAPI-driven code generation may become an implicit privileged bypass around the bridge operation policy.

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

- manifest/release-source parsing
- checksum/size mismatch
- version compatibility
- update transaction concurrency and rollback
- runtime OpenAPI size/timeout/schema validation
- OpenAPI fingerprint/diff behavior
- required path/method compatibility checks
- full-reference versus bridge-approved API separation
- deny behavior for newly discovered/unregistered upstream paths
- route/operation allowlist behavior
- loopback-only binding
- QR lifecycle/expiry/replacement
- secret/QR redaction
- bridge error normalization

Normal CI must not require real FQGate login or Cloudflare credentials. Use deterministic fixtures/fakes for most tests.

Windows acceptance should cover lifecycle/runtime behavior that CI cannot faithfully emulate, especially a real FQGate update/no-op path and live `/openapi.json` discovery.

Cloudflare integration tests remain out of Phase 3.

## Development sequence

Follow `docs/roadmap.md`.

- Phase 0: CLOSED
- Phase 1: CLOSED
- Phase 2: CLOSED
- Phase 3: CLOSED
- Phase 4+: do not opportunistically implement

Codex handoff:

`docs/prompts/phase-3-codex-goal.md`

## Documentation rule

When an implementation materially changes:

- security boundary,
- upstream assumption,
- runtime topology,
- framework/build shape,
- operator workflow,
- OpenAPI/compatibility behavior, or
- phase completion state,

update the corresponding documentation in the same change.
