# Codex Goal — Phase 3 FQGate Upgrade Center + Runtime OpenAPI Foundation

Work in:

```text
https://github.com/blooddrunk/fqgate-remote-bridge
```

Use the repository as the only source of truth. Do not rely on prior chat context.

Before editing code, sync the latest target branch and read, in order:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`
8. `docs/plans/fqgate-install-upgrade-dashboard.md`
9. `docs/plans/runtime-openapi-and-remote-docs.md`
10. `docs/agent-guide.md`

Then inspect the actual existing lifecycle/update implementation, bridge operation registry, TanStack Start routes, Dashboard UI, tests, config, and Windows scripts before deciding implementation details.

## Goal

Complete **Phase 3 only**: build a safe local FQGate upgrade center and a runtime OpenAPI/API-reference foundation while preserving the existing loopback-only, deny-by-default bridge boundary.

### Part A — safe local FQGate upgrade center

Implement the Phase 3 update workflow by reusing/refactoring the existing proven lifecycle transaction rather than duplicating updater logic in web routes.

Required behavior:

- GitHub remains the enabled/default registered FQGate release source.
- Do not accept arbitrary manifest or executable URLs anywhere.
- Preserve an extensible release-source registry for future Gitee support, but **do not invent or enable a Gitee mirror** unless an exact trusted fixed repository/path contract can be verified and recorded in `docs/upstream-contracts.md`.
- Dashboard update checks happen only after explicit user action; page load/startup/background polling must not silently check/download/apply updates.
- Add explicit update/install preview and confirmation.
- Bind confirmation to a stable plan/candidate identity so stale confirmation cannot silently apply a changed release.
- Reuse size, SHA-256, candidate version, compatibility, health, known-good backup, and rollback behavior already present in the lifecycle layer.
- Only one mutating lifecycle/update transaction may run at a time; duplicate clicks/retries must not create overlapping replacements.
- Add a modern restrained local `/updates` Dashboard experience showing current version, compatibility, release source, last explicit check, candidate version, blockers, size/SHA-256, transaction/result/rollback state, and CLI fallback guidance.
- New privileged local actions must be explicit bridge-owned operations/policy entries, not unconstrained TanStack server-function bypasses.

### Part B — runtime OpenAPI foundation

Use the running FQGate endpoint:

```text
http://127.0.0.1:17281/openapi.json
```

as the dynamic source of truth for the **upstream API catalog/structural observations**. Do not copy or manually maintain the official FQGate API list. Do not proxy the upstream `/docs` page as a shortcut.

Implement a framework-agnostic runtime OpenAPI service with:

- fixed loopback target only;
- bounded timeout;
- bounded response size;
- JSON/OpenAPI shape validation;
- normalized/redacted failures;
- short in-memory TTL cache;
- explicit refresh/invalidation and invalidation after FQGate restart/update activation;
- deterministic schema fingerprint, preferably SHA-256 over canonicalized JSON;
- path+method operation catalog;
- added/removed/changed structural diff where practical;
- required bridge-contract path/method checks.

Critical invariant:

```text
OpenAPI discovery != authorization
```

A newly discovered FQGate endpoint may appear in the reference/diff UI, but must remain unreachable through the bridge unless explicitly implemented and registered.

Keep endpoint-specific semantic parsing/probes for health/QR behavior; OpenAPI presence alone is not sufficient compatibility evidence.

### Part C — local API Reference UI

Add a local route such as:

```text
/api-reference
```

with clear separation between:

1. **Upstream FQGate reference** — complete valid runtime catalog from the current `/openapi.json`, reference-only, no raw upstream `Try it out`;
2. **Bridge API** — only explicitly registered bridge operations and their public/upstream mappings;
3. **Compatibility / changes** — fingerprint, operation counts, upstream-only operations, missing required mappings, added/removed changes where available.

Make the UI explicitly state that "documented by FQGate" does not mean "available remotely".

Evolve the operation registry only as needed so it can cleanly represent public method/path, optional upstream method/path mapping, classification, local/remote exposure class, compatibility requirement, request/body/logging policy, and documentation visibility.

Do not auto-register routes from OpenAPI.

### Part D — update activation compatibility

Extend candidate activation so success requires, after candidate start/health:

1. valid runtime `/openapi.json`;
2. required bridge path/method structural contracts present;
3. existing endpoint-specific semantic compatibility probes still pass.

If a required contract cannot be established, treat activation as failed and use the existing rollback behavior.

Do not reject a candidate merely because unrelated upstream endpoints were added.

## Hard boundaries

Do **not** implement any Phase 4+ capability in this goal:

- no Cloudflare Tunnel;
- no Cloudflare Access;
- no DNS/provisioning;
- no LAN/public listeners;
- no remote market-data API;
- no generic FQGate proxy;
- no MCP exposure;
- no WebSocket proxying;
- no supervisor/notifications;
- no automatic background update policy;
- no trading/order/cancel/fund-transfer/brokerage-control or other financial state-changing endpoints.

FQGate must remain on `127.0.0.1:17281`; the production bridge must remain IPv4-loopback-only (default `127.0.0.1:17282`).

## Testing

Implement deterministic tests covering the task package, especially:

- no update check/download caused by page/status load;
- no-update / update-available / incompatible cases;
- stale plan rejection;
- duplicate/parallel apply protection;
- size/hash/candidate-version failures;
- health failure rollback;
- OpenAPI compatibility failure rollback;
- arbitrary source URL impossible;
- valid/malformed/oversized/timed-out OpenAPI responses;
- deterministic fingerprint;
- path/method add/remove/required-missing cases;
- unrelated new endpoint does not automatically block activation;
- new/unregistered upstream endpoint remains denied;
- upstream reference can contain operations excluded from Bridge API;
- local UI/E2E for update workflow and API reference separation;
- existing raw `/v1/...` denial remains intact.

Run the repository's real quality gates, at minimum where scripts exist:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Do not claim a command passed unless it actually ran successfully.

## Windows acceptance and documentation

Create/update a Phase 3 Windows acceptance runbook and completion report. On a real supported Windows x64 host, verify safely where possible:

- FQGate and bridge still listen only on loopback;
- live runtime `/openapi.json` discovery works through the new service;
- API Reference shows a valid live catalog/fingerprint;
- update check uses the trusted registered source;
- current/no-op update path remains safe;
- Dashboard and CLI use the same lifecycle transaction;
- unknown/raw FQGate paths remain unreachable through the bridge.

Use fixtures/harnesses for deliberately invalid candidates rather than corrupting a live user installation. If a real newer FQGate release is unavailable, document that limitation honestly instead of manufacturing acceptance evidence.

Update relevant source-of-truth docs in the same change, including README, architecture/security/upstream contracts/roadmap as required by the implemented shape, and add a Phase 3 completion report only when the actual definition of done is met.

## Completion behavior

Do not stop at a plan. Implement the code, tests, UI, documentation, and acceptance material required for Phase 3.

At the end, report:

- what changed;
- important design decisions/refactors;
- tests/checks actually run and results;
- Windows acceptance evidence actually obtained;
- any remaining blockers preventing Phase 3 closure;
- exact files/docs that represent the handoff state.
