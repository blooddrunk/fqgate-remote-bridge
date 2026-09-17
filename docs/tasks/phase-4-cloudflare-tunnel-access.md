# Phase 4 Task Package — Secure Remote Human Access with Cloudflare Tunnel + Access

Status: **ACTIVE / next implementation package**

## Goal

Implement Phase 4 only: securely expose selected human-facing bridge/Dashboard capabilities through a remotely-managed Cloudflare Tunnel protected by Cloudflare Access, while preserving the loopback-only FQGate/bridge topology and keeping local maintenance and machine market-data APIs out of the remote surface.

Read first:

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/upstream-contracts.md`
- `docs/roadmap.md`
- `docs/plans/phase-4-secure-remote-human-access.md`
- `docs/status/phase-3-implementation-handoff.md`
- `docs/operations/windows-phase-3-acceptance.md`
- `docs/agent-guide.md`

Inspect the actual Phase 3 implementation before coding.

## Scope A — request context and exposure policy

Evolve the operation registry from the Phase 3 all-`local_only` model into an explicit local/remote-human exposure policy.

Required remote-human operations:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

Required local-only operations in Phase 4:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Requirements:

- operation exposure is server-authoritative;
- classify local versus remote-human requests without trusting `X-Forwarded-Host`;
- accept only explicit loopback Host forms for local context and one configured remote hostname for remote-human context;
- reject unknown Host values fail-closed;
- remote-human context requires the expected Cloudflare Access assertion header after Cloudflare Access validation;
- never log the assertion value;
- add normalized authorization/remote-context errors and appropriate HTTP status mapping;
- preserve existing raw `/v1/...` and unregistered-route denial.

## Scope B — remote UI policy

Make the TanStack UI safely usable remotely without duplicating the application.

Remote-human behavior:

- Dashboard/status works;
- QR begin/poll works;
- update status is read-only;
- update check/plan/apply controls are absent/disabled and explain that they require local maintenance access;
- API Reference catalog is visible and remains reference-only;
- explicit OpenAPI refresh is absent/disabled remotely;
- no market-data client API or trading UI is added.

The server exposure gate must enforce all of this even if a caller bypasses the UI.

## Scope C — cloudflared release/lifecycle service

Add a framework-agnostic Cloudflared manager and narrowly-scoped Windows integration.

Required behavior:

- detect installed cloudflared/version;
- fixed official Cloudflare release source only;
- no arbitrary download URL;
- obtain/validate release identity and published integrity metadata, including SHA-256 when supplied by the official release;
- stage and activate a supported Windows x64 binary safely;
- no silent/background updates;
- status/diagnostic interfaces testable without real Cloudflare;
- Windows service install/start/stop/restart/status support;
- Tunnel origin always targets the configured loopback bridge, never FQGate.

Do not create a generic second updater architecture if existing safe download primitives can be reused, but keep Cloudflare release semantics isolated from FQGate release semantics.

## Scope D — Tunnel token secret handling

Use a pre-created remotely-managed Tunnel token. Phase 4 must not provision Cloudflare resources through the API.

Preferred runtime form:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Requirements:

- require/support a cloudflared version with `--token-file`;
- token lives outside the repo and normal application JSON;
- if the bridge setup writes the token file, write atomically and apply restrictive Windows ACLs immediately;
- raw token must not appear in Windows service command line, logs, errors, diagnostics, UI, browser storage, fixtures, or committed files;
- reject startup/reconfiguration if the secret file is missing, unreadable, or cannot be secured to the intended service identity;
- test generated service command/config for absence of the raw secret.

## Scope E — Cloudflare Access contract

Phase 4 assumes the operator manually creates/configures:

- remotely-managed Tunnel;
- published application/public hostname targeting `http://127.0.0.1:17282`;
- self-hosted Cloudflare Access application;
- human Allow policy;
- **Protect with Access** on the published application/origin so cloudflared validates the Access JWT before proxying.

Repository responsibilities:

- document exact required operator steps with screenshots not required;
- configure/validate the expected remote hostname locally;
- defense-in-depth reject remote-host requests that lack the Access assertion header;
- provide a safe remote acceptance/self-test procedure;
- do not request Global API Key or broad provisioning credentials.

## Scope F — local setup/diagnostics UX

Add only the UI/CLI needed to make Phase 4 operable, for example a local-only Remote Access setup/status surface.

It should be able to show bounded, non-secret state such as:

- cloudflared installed/version;
- Windows service installed/running;
- remote hostname;
- protected token-file configured/secure (boolean/state only);
- Tunnel connectivity health if safely observable;
- last remote Access self-test category;
- which operations are remote-human versus local-only.

Any setup mutation remains local-only.

## Configuration constraints

Add configuration only where needed. In particular:

- keep `fqgateBaseUrl` loopback-only;
- keep bridge production bind loopback-only;
- remote hostname must be a hostname, not an arbitrary origin URL;
- never accept arbitrary Tunnel origin target;
- never put a Tunnel token directly in checked-in config/example files;
- examples use placeholders only.

## Testing

Normal CI must not need Cloudflare credentials.

Add deterministic tests for at least:

- local Host accepted;
- configured remote Host + Access assertion accepted for remote-human operation;
- configured remote Host without assertion denied;
- unknown Host denied;
- spoofed forwarding headers do not grant remote/local context;
- allowed/denied Phase 4 operation matrix;
- update check/plan/apply and OpenAPI refresh denied remotely but work locally;
- QR payload/session/log redaction regressions;
- Access assertion and Tunnel token redaction;
- trusted cloudflared release parsing/integrity success and mismatch failure;
- arbitrary cloudflared URL impossible;
- Windows service invocation uses token-file path and does not contain raw token;
- token-file ACL integration behavior is unit-testable/fakeable where possible;
- existing typecheck/lint/unit/E2E and Phase 2/3 behavior remains green.

Run, where available:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

## Windows acceptance

Create `docs/operations/windows-phase-4-acceptance.md` and extend the Windows acceptance tooling with an explicit Phase 4 mode where practical.

Real Phase 4 closure requires evidence from the supported Windows x64 host with actual Cloudflare resources:

- FQGate listener exactly on loopback;
- bridge listener exactly on loopback;
- cloudflared Windows service installed/running;
- service/process invocation contains no raw Tunnel token;
- protected token-file ACL/state verified without recording secret data;
- public hostname routes only to bridge;
- unauthenticated public request is challenged/denied by Access;
- authenticated human can view Dashboard/status;
- QR begin/poll works remotely when safe to test;
- remote update check/plan/apply and OpenAPI refresh are rejected;
- raw/unregistered FQGate paths remain unreachable remotely;
- local maintenance operations remain usable locally;
- cloudflared service restart reconnects successfully.

If Cloudflare credentials/resources are unavailable to the coding environment, finish deterministic implementation and runbooks, explicitly mark live acceptance pending, and **do not mark Phase 4 closed**.

## Documentation and completion

Update source-of-truth docs whenever implementation changes architecture/security/operator workflow. At minimum review/update:

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/upstream-contracts.md`
- `docs/roadmap.md`
- `docs/agent-guide.md`

Add `docs/status/phase-4-implementation-handoff.md` with actual checks/evidence. Mark Phase 4 CLOSED only after the real remote Windows/Cloudflare acceptance criteria are met.

## Hard non-goals

Do not implement:

- remote machine/read-only market-data operations or Access service-token authentication (Phase 5);
- automated Cloudflare API provisioning/DNS/drift workflows (Phase 6);
- supervisor/notification system (Phase 7);
- automatic update scheduling/policy (Phase 8);
- MCP/WebSocket (Phase 9);
- final packaging (Phase 10);
- LAN/public bridge bind;
- direct cloudflared -> FQGate route;
- generic FQGate proxy;
- trading/order/cancel/transfer/brokerage-control APIs.
