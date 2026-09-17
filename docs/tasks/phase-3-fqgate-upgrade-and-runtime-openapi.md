# Phase 3 Task Package — FQGate Upgrade Center and Runtime OpenAPI Foundation

Status: **ACTIVE / next implementation package**

## Goal

Complete the local operational control plane before any Cloudflare Tunnel or remote exposure is introduced.

Phase 3 has two tightly related deliverables:

1. a safe Dashboard-driven FQGate install/update center that reuses the proven lifecycle transaction and rollback behavior;
2. runtime FQGate OpenAPI discovery/documentation so the project follows the API contract of the installed FQGate instead of copying it manually.

Everything remains IPv4 loopback-only.

## Required reading

Before coding, read:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/plans/fqgate-install-upgrade-dashboard.md`
8. `docs/plans/runtime-openapi-and-remote-docs.md`
9. `docs/agent-guide.md`

Inspect the actual existing lifecycle/update, route registry, TanStack routes, Dashboard components, configuration, tests, and Windows scripts before choosing implementation details.

## Fixed scope

### In scope

- explicit local update checks;
- Dashboard install/update plan and confirmation;
- reuse of the existing lifecycle/update transaction;
- trusted release-source registry hardening;
- optional Gitee adapter **shape only** unless a fixed trusted upstream mirror is verifiably available and documented;
- update concurrency/idempotency/recovery behavior;
- runtime `GET http://127.0.0.1:17281/openapi.json` discovery;
- OpenAPI validation, bounded fetch, caching, fingerprint, operation catalog, diff and compatibility checks;
- local API Reference UI;
- upgrade activation integration with OpenAPI compatibility checks;
- tests and Windows acceptance documentation/evidence.

### Out of scope

- Cloudflare Tunnel;
- Cloudflare Access;
- LAN/public listeners;
- remote market-data API;
- generic FQGate proxying;
- arbitrary upstream URL configuration;
- remote MCP;
- WebSocket proxying;
- supervisor/notifications;
- automatic background updates;
- trading/order/cancel/transfer/account-control operations.

Do not opportunistically implement later phases.

---

## Workstream A — inspect and preserve existing lifecycle behavior

First audit the existing Phase 0/1 updater/lifecycle implementation.

Document in code/tests which functions already own:

- stable manifest retrieval;
- package selection;
- download timeout/retry;
- size and SHA-256 validation;
- candidate `--version` validation;
- compatibility checks;
- stop/replace/start behavior;
- health probing;
- previous known-good binary and rollback;
- transaction/state recovery if present.

The Dashboard must call this same service boundary. Do not create a second web-specific updater.

If the existing boundary is too CLI-coupled, refactor toward a framework-agnostic application service while preserving behavior and tests.

## Workstream B — release-source registry

Create or tighten an explicit trusted source abstraction.

Required first behavior:

```text
github = enabled/default
```

It must use the currently documented official FQGate release repository/manifest rules.

Design for:

```text
gitee = registered adapter type or disabled placeholder
```

but do not invent a mirror URL or trust a user-supplied repository. Only enable Gitee if an exact trusted fixed repository/path/schema contract can be verified from upstream/public facts and documented in `docs/upstream-contracts.md`.

Requirements:

- no arbitrary manifest URL;
- no arbitrary executable URL;
- HTTPS/host/path policy per adapter;
- manifest schema validation;
- normalized source identity shown in UI/status;
- tests proving arbitrary URL injection is impossible.

## Workstream C — update application service and transaction concurrency

Expose framework-agnostic operations such as the following conceptual capabilities; exact names are implementation-defined:

```text
getUpdateStatus()
checkForUpdate()
planInstallOrUpdate()
applyInstallOrUpdate(confirmedPlanIdentity)
getRecentUpdateResult()
```

Requirements:

- no network check just because Dashboard loads;
- explicit `check` action;
- explicit apply confirmation;
- plan includes source, installed version, target version, size, SHA-256, compatibility/blockers, restart impact;
- bind confirmation to a stable plan/candidate identity so stale confirmation cannot silently apply a different release;
- only one mutation transaction at a time;
- duplicate clicks/retries do not create parallel replacements;
- browser refresh does not create a second transaction;
- bounded status/result metadata may survive long enough for UX/recovery, but never persist secrets/download bodies;
- failure surfaces a stable normalized error and preserves/returns to known-good state.

If persistent transaction state already exists, reuse it. Otherwise add only the minimal crash-safe state justified by the current lifecycle design.

## Workstream D — local Dashboard update center

Add a restrained operator UI integrated into the existing TanStack/shadcn Dashboard.

Suggested route/navigation:

```text
/updates
```

Display:

- installation/running status;
- installed FQGate version;
- compatibility status;
- active release source;
- last explicit check time/result;
- available version;
- blockers;
- candidate size and SHA-256;
- current transaction state;
- previous success/failure/rollback summary where safely available.

Actions:

- Check for updates;
- Preview installation/update;
- Confirm installation/update;
- Refresh status.

UX requirements:

- make it clear the operation can restart FQGate and may require login/session recovery;
- do not display fake percentage progress when byte-level progress is unavailable;
- disable/reject duplicate mutation while one is active;
- retain CLI fallback instructions;
- no silent auto-update toggle in this phase.

All server routes/actions must be explicit bridge-owned operations with policy metadata. Do not hide privileged update behavior in an unconstrained server function.

## Workstream E — Runtime OpenAPI service

Implement a framework-agnostic service that only reads:

```text
http://127.0.0.1:17281/openapi.json
```

Requirements:

- fixed loopback origin/path; no caller-supplied URL;
- bounded request timeout;
- bounded maximum response bytes;
- reject malformed JSON;
- validate minimum OpenAPI document shape/version needed by this project;
- normalized errors, no raw upstream response body returned/logged;
- short in-memory TTL cache;
- explicit refresh/invalidation;
- cache invalidation after FQGate restart/update activation;
- deterministic schema fingerprint (prefer SHA-256 over canonicalized JSON);
- enumerate operations as path + method with stable metadata;
- expose only non-sensitive structural metadata to UI.

Do not proxy upstream `/docs` as the implementation shortcut.

## Workstream F — catalog, diff, and compatibility probe

Provide pure/testable logic for:

- current upstream operation catalog;
- added operations;
- removed operations;
- changed operations where structurally detectable;
- bridge-required path/method presence;
- mapping status between bridge operations and upstream operations.

Required principle:

```text
OpenAPI discovery != authorization
```

A newly discovered FQGate path must remain unreachable through the bridge until explicitly registered.

The compatibility probe used during activation should focus on bridge-required contracts. Do not reject a candidate merely because unrelated upstream endpoints were added.

Fail closed when a required contract is missing, unreadable, or structurally incompatible.

Keep endpoint-specific runtime parsers/probes for health and QR behavior; OpenAPI cannot replace semantic validation.

## Workstream G — operation registry/mapping evolution

Evolve the bridge registry only as much as necessary to support future generated bridge docs cleanly.

It should be possible to represent:

- bridge operation ID;
- public method/path;
- classification;
- local/remote exposure class;
- optional upstream method/path mapping;
- compatibility requirement;
- timeout/body/logging policy;
- documentation visibility.

Do not automatically register operations from OpenAPI.

Do not add generic `path` parameters that can choose arbitrary upstream paths.

## Workstream H — local API Reference UI

Add an operator-facing local route, suggested:

```text
/api-reference
```

Recommended views/tabs:

### Upstream FQGate

Show data derived from the runtime OpenAPI document:

- FQGate version if available from existing status;
- OpenAPI version;
- schema fingerprint;
- fetched-at time;
- operation count;
- searchable/tag-grouped upstream operations;
- clear badge for operations not approved by the bridge.

This is reference-only in Phase 3. No raw upstream `Try it out`.

### Bridge API

Show only explicitly registered bridge operations.

Clearly distinguish bridge public path from upstream path when mapped.

### Compatibility / Changes

Show:

- required operation coverage;
- upstream-only operation count;
- missing required operations;
- schema changed/unchanged state;
- added/removed summary against the previous observed fingerprint when such comparison is safely available.

Operator copy must explicitly state that an upstream-documented endpoint is not automatically available remotely.

## Workstream I — integrate OpenAPI probe into update activation

Extend the existing update activation pipeline without weakening rollback.

After candidate starts and health succeeds:

1. fetch runtime `/openapi.json`;
2. validate document;
3. verify bridge-required path/method contracts;
4. run existing endpoint-specific compatibility probes;
5. only then mark activation successful.

If required OpenAPI/contract checks fail, treat candidate activation as failed and execute the established rollback behavior.

Do not require unrelated upstream paths to remain byte-for-byte identical.

## Workstream J — API and security behavior

Any new local APIs must:

- be explicit registry operations;
- use stable normalized errors;
- use method/body/timeout limits;
- reject unknown routes/methods;
- remain same-origin/loopback-only;
- avoid sensitive logging;
- never expose a configurable upstream URL/path;
- never expose file-system secret paths or tokens;
- never allow OpenAPI contents to mutate runtime route authorization.

Update `docs/security.md` if implementation details add new persistent state or threat considerations.

## Workstream K — automated tests

At minimum add automated coverage for:

### Upgrade center

- no check/download on page/status load;
- explicit check with no update;
- update available;
- incompatible candidate blocked;
- stale/changed plan confirmation rejected;
- duplicate/parallel apply rejected or deterministically serialized;
- size mismatch;
- hash mismatch;
- candidate version mismatch;
- health failure rollback;
- OpenAPI compatibility failure rollback;
- normalized/redacted errors;
- arbitrary source URL cannot be supplied.

### Runtime OpenAPI

- valid document;
- malformed JSON;
- invalid/unsupported document shape;
- timeout;
- oversized response;
- deterministic fingerprint;
- added path/method;
- removed path/method;
- required path missing;
- unrelated new path does not fail required-contract compatibility;
- cache hit/expiry/invalidation;
- unregistered discovered route stays denied;
- upstream reference includes an operation excluded from bridge catalog.

### UI/E2E

Using deterministic fakes:

- update check -> plan -> confirm success;
- update failure/rollback visible;
- API reference renders upstream and bridge separation;
- no raw upstream execution control;
- unknown/raw `/v1/...` bridge path remains denied.

## Workstream L — quality gates

Run the repository's standard checks at minimum:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Use the exact package scripts present in the repository if names differ.

Do not claim a check passed unless it was actually run.

## Workstream M — Windows acceptance

Create/update an operations acceptance document for Phase 3.

On a real supported Windows x64 host verify:

- FQGate/bridge still bind only to loopback;
- live running `/openapi.json` can be fetched by the bridge service;
- API Reference page shows a valid live fingerprint/catalog;
- update check uses the trusted source;
- no-op/current-version path is safe;
- where a real newer release is unavailable, use the safest non-destructive accepted path and record what cannot be proven yet;
- CLI update behavior still works;
- Dashboard update behavior uses the same transaction;
- a deliberately invalid candidate is tested in fixtures/harness, not by unsafe corruption of the user's live installation;
- unknown FQGate paths remain unreachable through the bridge.

Record bounded evidence only. Do not commit QR/session/token material or unnecessarily dump the full live OpenAPI document.

## Documentation updates required in the same implementation

At completion update as applicable:

- `README.md`;
- `AGENTS.md` if implementation constraints changed;
- `docs/architecture.md`;
- `docs/security.md`;
- `docs/upstream-contracts.md` with confirmed live OpenAPI observations;
- `docs/roadmap.md` phase status;
- Phase 3 Windows acceptance/runbook;
- a Phase 3 completion report under `docs/status/`.

## Definition of done

Phase 3 is closed only when all of the following are true:

- update center exists and requires explicit operator action/confirmation;
- CLI and Dashboard reuse the same lifecycle transaction;
- arbitrary download/release URLs remain impossible;
- rollback behavior remains tested;
- runtime FQGate `/openapi.json` is consumed safely and dynamically;
- local upstream-reference and bridge-reference views exist;
- OpenAPI discovery cannot authorize routes;
- required-contract compatibility is part of update activation;
- newly discovered upstream endpoints remain denied;
- all normal CI/quality gates pass;
- target Windows acceptance is performed and honestly documented to the extent safe/possible;
- both FQGate and bridge remain loopback-only;
- no Phase 4+ Cloudflare/remote implementation has leaked into the task.
