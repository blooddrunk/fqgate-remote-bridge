# FQGate Remote Bridge

Securely run, update, monitor, and remotely access a local [FQGate](https://github.com/zhuyifang/fqgate-releases) instance on an always-on Windows PC through a controlled bridge, with Cloudflare Tunnel and Cloudflare Access planned for later phases.

> **Status:** Phase 0 + Phase 1 are fully closed after real Windows x64 acceptance. Phase 2 is ready for implementation: a local-only TanStack Start bridge API and QR login UI.

## Why this project exists

FQGate is useful as an A-share market-data provider, but its current desktop application is local-first and listens on `127.0.0.1:17281`. This project provides a small, independently deployable bridge so remote tools can eventually use that local instance without exposing FQGate itself to the public Internet.

The bridge is intentionally independent from [`turtle-value-engine`](https://github.com/blooddrunk/turtle-value-engine). FQGate must remain an optional provider, never a single point of dependency for the investment engine.

## Target architecture

```text
Internet                              later phases
   |
   v
Cloudflare Access
   |
   v
Cloudflare Tunnel
   |
   v
127.0.0.1:<bridge-port>         Windows host
   |
   +-- TanStack Start / React UI
   +-- explicit bridge API routes
   +-- QR login adapter
   +-- later: supervisor / updater / notifier
   |
   v
127.0.0.1:17281
   |
   v
FQGate
```

The key rule is simple: **Cloudflare Tunnel must eventually terminate at this bridge, not at FQGate directly.**

## Planned long-term responsibilities

- Download, verify, install, update, and roll back FQGate from its official release source.
- Provide a controlled local application boundary in front of FQGate.
- Provide status and QR login without exposing raw FQGate routes.
- Download, install, update, and health-check `cloudflared` in a later phase.
- Provision a remotely-managed Cloudflare Tunnel using a least-privilege API token.
- Publish a human-facing status/login page protected by Cloudflare Access.
- Publish a machine-facing read-only API endpoint protected by Cloudflare Access service authentication.
- Normalize FQGate, bridge, tunnel, update, and login state into one health model.
- Send deduplicated state-change notifications through pluggable notifiers.
- Keep FQGate itself bound to loopback and never require opening inbound Windows Firewall ports.

## Hard boundaries

This repository is for **market-data access and operations only**.

- No order placement, cancellation, fund transfer, brokerage-account control, or other trading features.
- No blind proxy of unknown future FQGate endpoints.
- New bridge operations are explicit and denied by default until registered.
- No Global Cloudflare API Key; use scoped API tokens only when Cloudflare work begins.
- No secrets committed to Git or written to normal application logs.
- No redistribution of the FQGate executable; download it from the official upstream release source and verify the upstream checksum.
- No assumption that FQGate will exist forever. Consumers must treat it as an optional provider.

## Current implementation

Phase 0 + Phase 1 provide a deterministic Windows-first FQGate lifecycle boundary:

- official manifest/package selection;
- official-only download;
- exact size and SHA-256 verification;
- candidate identity/version validation;
- explicit compatibility policy;
- transactional install/update/rollback;
- managed-process identity checks;
- real `/v1/market/health` envelope handling;
- local lifecycle CLI;
- real Windows x64 acceptance.

See [`docs/status/phase-0-1-completion.md`](docs/status/phase-0-1-completion.md) for the recorded evidence.

## Phase 2 technology direction

Phase 2 deliberately uses a modern React/TanStack stack as both a product choice and a learning investment:

- React 19
- TanStack Start
- TanStack Router
- TanStack Query
- Vite
- Tailwind CSS v4
- shadcn/ui
- Node.js 22+ / TypeScript / pnpm

TanStack Start replaces the earlier Fastify + Vue plan for Phase 2. The repository remains a **single package**: Start provides the server/UI transport while the existing lifecycle and FQGate modules remain framework-agnostic service code underneath it.

TanStack Start is still pre-v1/RC, so the project treats it as a replaceable transport shell. Core compatibility, lifecycle, QR, security policy, and error semantics must not live inside React components or framework-specific route files.

Aceternity UI and Magic UI are not baseline Phase 2 dependencies. The first UI should achieve a modern operator-dashboard look with shadcn/ui and Tailwind before additional visual registries or animation packages are considered.

## Phase 2 target

The next milestone remains local-only. A browser on the Windows host should be able to:

1. open the bridge on loopback;
2. see bridge/FQGate/session/compatibility status;
3. begin an FQGate QR login through a bridge-owned API;
4. scan the QR and observe the session recover;
5. do so without exposing raw FQGate paths or persisting QR/session material.

Cloudflare, public hostnames, MCP, WebSocket proxying, SMS login, notifications, and trading remain out of scope.

## Planned user experience

Long term, initial setup should converge toward one administrator command or installer that:

1. verifies Windows prerequisites;
2. installs/updates FQGate;
3. installs/updates the bridge;
4. creates or adopts a Cloudflare Tunnel;
5. installs `cloudflared` as a Windows service;
6. configures protected public hostnames;
7. installs Windows startup tasks for the interactive-user components;
8. verifies local FQGate health, bridge health, tunnel reachability, and Access protection.

Normal operation should eventually require no manual intervention. When FQGate login expires, the protected web UI should show a QR code and restore the session without Remote Desktop.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Upstream contracts and compatibility](docs/upstream-contracts.md)
- [Development roadmap](docs/roadmap.md)
- [Phase 0 + Phase 1 implementation task](docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md)
- [Phase 0 + Phase 1 completion report](docs/status/phase-0-1-completion.md)
- [Phase 2 implementation task](docs/tasks/phase-2-tanstack-local-bridge-and-qr-ui.md)
- [Phase 2 Codex Goal prompt](docs/prompts/phase-2-codex-goal.md)
- [Agent/developer instructions](AGENTS.md)

## Current development handoff

The current coding goal is **Phase 2 only**.

Read the Phase 2 task package first, then use the stored Codex Goal prompt. Do not begin Cloudflare integration until the local bridge/API/QR flow is implemented and accepted on the target Windows/FQGate combination.

The existing lifecycle CLI remains available through the current build, for example:

```text
node dist/cli/main.js version
node dist/cli/main.js fqgate status
node dist/cli/main.js fqgate update --check
```

Phase 2 must preserve this lifecycle functionality while adding the TanStack Start production build/runtime.

## Current upstream baseline

Planning was performed against FQGate `1.0.0` and the public `tonghuasun-agent` implementation as observed on **2026-09-16**. Upstream behavior is not treated as immutable; compatibility checks are a first-class requirement of this project.
