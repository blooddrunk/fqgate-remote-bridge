# Codex Goal — Phase 4 Secure Remote Human Access

Work in:

```text
https://github.com/blooddrunk/fqgate-remote-bridge
```

Use the repository as the only source of truth. Do not rely on prior chat context.

Before editing code, sync the latest `main` and read in order:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/tasks/phase-4-cloudflare-tunnel-access.md`
8. `docs/plans/phase-4-secure-remote-human-access.md`
9. `docs/status/phase-3-implementation-handoff.md`
10. `docs/operations/windows-phase-3-acceptance.md`
11. `docs/agent-guide.md`

Then inspect the actual Phase 3 code, especially the bridge operation registry/HTTP transport, TanStack routes/components, FQGate lifecycle/OpenAPI services, config, Windows scripts, and tests. Do not redesign from assumptions when the repository already has a working abstraction.

## Goal

Complete **Phase 4 only**: provide secure remote **human** access to selected Dashboard/QR/status/reference capabilities through a remotely-managed Cloudflare Tunnel protected by Cloudflare Access, while keeping FQGate and the bridge IPv4-loopback-only and keeping local maintenance and machine market-data APIs outside the remote surface.

Do not stop at planning. Implement code, tests, UI/CLI/operator flow, documentation, and Windows acceptance material.

## 1. Add explicit request context + remote-human exposure policy

Phase 3 operations are all local-only. Evolve the policy model so authorization can distinguish local requests from authenticated remote-human requests.

Remote-human allowed operations in Phase 4:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

Operations that MUST remain local-only in Phase 4:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Requirements:

- operation exposure is enforced server-side, not just hidden in the UI;
- local context uses explicit accepted loopback Host values;
- remote-human context uses exactly one configured remote hostname;
- reject unknown Host values fail-closed;
- do not trust `X-Forwarded-Host` or similar forwarding headers for context selection;
- a remote-host request must contain the expected Cloudflare Access assertion header;
- never log assertion contents;
- add normalized forbidden/remote-context errors and correct HTTP status behavior;
- preserve raw `/v1/...` denial and all unregistered-route denial.

Cloudflare Tunnel's **Protect with Access** origin setting is the primary JWT validation mechanism for Phase 4. The bridge assertion-presence check is defense-in-depth/drift detection; do not invent a replacement authentication system unless the supported Cloudflare mechanism proves insufficient.

## 2. Make the existing TanStack UI safe remotely

Reuse the current app rather than creating a second remote frontend.

Remote-human UX must allow:

- Dashboard/status;
- QR begin/poll login flow;
- read-only update status;
- API Reference/catalog in reference-only form.

Remote-human UX must NOT allow:

- update check;
- update plan;
- update apply;
- explicit OpenAPI refresh;
- any Phase 5 market-data client operation.

Hide/disable local-only controls with clear Chinese operator text, but keep the server exposure policy authoritative.

## 3. Implement cloudflared lifecycle/release integration

Add a framework-agnostic cloudflared manager with clean interfaces and narrow Windows integration.

Required capabilities:

- detect installed cloudflared and version;
- download only from a fixed official Cloudflare release source;
- reject arbitrary executable/download URLs;
- validate release identity and official published integrity information, including SHA-256 when supplied;
- stage replacement safely;
- explicit/manual install/update only, no background auto-update;
- Windows service install/start/stop/restart/status;
- diagnostics testable with fakes in normal CI;
- origin target fixed to the configured loopback bridge, never FQGate.

Reuse safe generic download primitives where useful, but do not force Cloudflare release semantics into the FQGate manifest model if that obscures supply-chain validation.

## 4. Use secure token-file handling for the remotely-managed Tunnel

Phase 4 adopts a pre-created remotely-managed Tunnel token. Do NOT provision Tunnel/DNS/Access through the Cloudflare API; that belongs to Phase 6.

Preferred service runtime:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Require a supported cloudflared version with `--token-file`.

Requirements:

- raw Tunnel token is never stored in repository config, normal application JSON, browser storage, logs, diagnostics, history, tests, or Windows service command line;
- token file is outside the repo;
- if setup writes it, write atomically and immediately apply restrictive Windows ACLs suitable for the service identity;
- inability to secure/read the secret file is a blocking error;
- tests prove generated service invocation/config uses the token-file path and does not contain the raw token;
- all token/error redaction remains deterministic.

## 5. Define and document the manual Cloudflare contract

Phase 4 assumes the operator manually creates/configures:

- remotely-managed Tunnel;
- public hostname/published application targeting `http://127.0.0.1:17282`;
- self-hosted Cloudflare Access application;
- human Allow policy;
- **Protect with Access** for the published application/origin so cloudflared validates Access before forwarding.

Do not hard-code an email, IdP, account, zone, or organization-specific policy.

Provide clear operator documentation and local validation/status for the configured remote hostname. Do not request a Global API Key or broad Cloudflare API token.

## 6. Add local-only Remote Access setup/status UX or CLI as needed

Implement the minimum coherent operator surface required to deploy and diagnose Phase 4. It may be a local-only Dashboard page, CLI commands, or both, but keep domain logic out of routes/components/PowerShell.

Bounded non-secret state can include:

- cloudflared installed/version;
- service installed/running state;
- configured remote hostname;
- token-file configured/ACL-safe state (boolean/status only);
- Tunnel connectivity category where safely observable;
- Access self-test status category;
- local versus remote-human operation policy summary.

Any mutation/setup operation must remain local-only.

## 7. Configuration and security invariants

Preserve:

```text
FQGate: 127.0.0.1:17281
Bridge: 127.0.0.1:17282 (default)
```

Do not add a LAN/public bridge bind or router port-forward.

Remote hostname configuration must be a constrained hostname, not an arbitrary proxy origin. Tunnel origin is always the loopback bridge. Examples/docs must contain placeholders only and no token values.

Never add a catch-all FQGate proxy, raw upstream execution path, or trading/state-changing financial API.

## 8. Automated testing

Normal CI must require no real Cloudflare credentials.

Add deterministic tests for at least:

- local Host accepted;
- configured remote Host + Access assertion accepted for a remote-human operation;
- configured remote Host without assertion denied;
- unknown Host denied;
- spoofed `X-Forwarded-Host` does not change authorization context;
- complete Phase 4 operation exposure matrix;
- update check/plan/apply and OpenAPI refresh denied remotely but still available locally;
- raw/unregistered FQGate path denial remains intact;
- QR/session sensitive-data regressions;
- Access assertion and Tunnel token redaction;
- cloudflared trusted release/integrity success and mismatch failure;
- arbitrary cloudflared URL cannot be supplied;
- generated Windows service invocation uses token-file and excludes raw token;
- cloudflared lifecycle/service state transitions through fakes;
- existing Phase 2/3 test suite remains green.

Run actual repository quality gates, at minimum where scripts exist:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Do not claim commands passed unless they actually ran successfully.

## 9. Windows + real Cloudflare acceptance

Create/update `docs/operations/windows-phase-4-acceptance.md` and extend acceptance tooling with an explicit Phase 4 mode where useful.

Phase 4 may only be marked CLOSED after real supported Windows x64 acceptance proves:

1. bridge and FQGate remain loopback-only;
2. supported cloudflared Windows service is installed/running;
3. service/process command metadata does not contain the raw Tunnel token;
4. protected token-file state/ACL is valid without recording the secret;
5. public hostname routes only to the bridge;
6. unauthenticated access is challenged/denied by Cloudflare Access;
7. authenticated human can use Dashboard/status;
8. remote QR begin/poll works when safe to test without destructive logout;
9. remote update check/plan/apply and OpenAPI refresh are denied;
10. remote raw/unregistered FQGate paths remain unreachable;
11. local-only maintenance operations still work over loopback;
12. cloudflared Windows service restart reconnects without changing bridge/FQGate listeners.

If the coding environment lacks real Cloudflare resources, finish implementation, deterministic tests, operator docs, and acceptance scripts/runbook, then record **live acceptance pending**. Do not fabricate evidence and do not mark Phase 4 closed.

## 10. Documentation / handoff

Update affected source-of-truth docs in the same change, including as needed:

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/upstream-contracts.md`
- `docs/roadmap.md`
- `docs/agent-guide.md`
- Phase 4 plan/task/runbook/status documents.

Create `docs/status/phase-4-implementation-handoff.md` with actual implementation details, commands run, results, Windows/Cloudflare evidence obtained, and blockers.

## Hard boundaries: do NOT implement Phase 5+

- no remote machine/read-only market-data API;
- no Cloudflare Access service-token machine auth;
- no automated Cloudflare API provisioning/DNS/drift management;
- no supervisor/notifications;
- no automatic background update policy;
- no MCP/WebSocket proxy;
- no final installer/packaging expansion beyond what is necessary for Phase 4 cloudflared service acceptance;
- no trading/order/cancel/fund-transfer/brokerage-control endpoints.

At the end, report:

- what changed;
- important security/architecture decisions;
- tests/checks actually run and results;
- Windows/Cloudflare acceptance evidence actually obtained;
- exact remaining blockers, if any;
- exact source files/docs representing the handoff state.
