# FQGate Remote Bridge

Securely run, update, monitor, and remotely access a local [FQGate](https://github.com/zhuyifang/fqgate-releases) instance on an always-on Windows PC through Cloudflare Tunnel and Cloudflare Access.

> **Status:** Phase 0 + Phase 1 implementation is present. Real Windows x64 acceptance is still pending; Phase 2 features are intentionally not implemented.

## Why this project exists

FQGate is useful as an A-share market-data provider, but its current desktop application is local-first and listens on `127.0.0.1:17281`. This project provides a small, independently deployable bridge so remote tools can use that local instance without exposing FQGate itself to the public Internet.

The bridge is intentionally independent from [`turtle-value-engine`](https://github.com/blooddrunk/turtle-value-engine). FQGate must remain an optional provider, never a single point of dependency for the investment engine.

## Target architecture

```text
Internet
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
   +-- Web UI / QR login
   +-- Read-only API proxy
   +-- Health / status API
   +-- Supervisor / updater / notifier
   |
   v
127.0.0.1:17281
   |
   v
FQGate
```

The key rule is simple: **Cloudflare Tunnel must terminate at this bridge, not at FQGate directly.**

## Planned long-term responsibilities

- Download, verify, install, update, and roll back FQGate from its official release source.
- Download, install, update, and health-check `cloudflared`.
- Provision a remotely-managed Cloudflare Tunnel using a least-privilege API token.
- Publish a human-facing status/login page protected by Cloudflare Access.
- Publish a machine-facing read-only API endpoint protected by Cloudflare Access service authentication.
- Provide remote QR login by adapting FQGate's local login APIs.
- Normalize FQGate, bridge, tunnel, update, and login state into one health model.
- Send deduplicated state-change notifications through pluggable notifiers.
- Keep FQGate itself bound to loopback and never require opening inbound Windows Firewall ports.

## Hard boundaries

This repository is for **market-data access and operations only**.

- No order placement, cancellation, fund transfer, brokerage-account control, or other trading features.
- No blind proxy of unknown future FQGate endpoints.
- No Global Cloudflare API Key; use scoped API tokens only.
- No secrets committed to Git or written to normal application logs.
- No redistribution of the FQGate executable; download it from the official upstream release source and verify the upstream checksum.
- No assumption that FQGate will exist forever. Consumers must treat it as an optional provider.

## Planned user experience

Initial setup should converge toward one administrator command or installer that:

1. verifies Windows prerequisites;
2. installs/updates FQGate;
3. installs/updates the bridge;
4. creates or adopts a Cloudflare Tunnel;
5. installs `cloudflared` as a Windows service;
6. configures protected public hostnames;
7. installs Windows startup tasks for the interactive-user components;
8. verifies local FQGate health, bridge health, tunnel reachability, and Access protection.

Normal operation should require no manual intervention. When FQGate login expires, the protected web UI should show a QR code and restore the session without Remote Desktop.

## Implementation stack for the current phase

The implementation plan assumes:

- Node.js 22+ / TypeScript
- a small local lifecycle CLI; HTTP/UI layers are deferred
- PowerShell only for Windows bootstrap/service/task integration
- packaged Windows release artifacts so normal runtime does not depend on a developer checkout

Fastify, Vue, Cloudflare, QR login, and remote proxying remain later-phase work. The bridge should remain small enough to audit.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Upstream contracts and compatibility](docs/upstream-contracts.md)
- [Development roadmap](docs/roadmap.md)
- [Phase 0 + Phase 1 implementation task](docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md)
- [Phase 0 + Phase 1 Codex Goal prompt](docs/prompts/phase-0-1-codex-goal.md)
- [Agent/developer instructions](AGENTS.md)

## Current implementation handoff

The repository now implements **Phase 0 + Phase 1 only**: a TypeScript/pnpm foundation and a deterministic, tested local FQGate lifecycle manager for Windows. Cloudflare, remote HTTP, login UI, MCP, and other later-phase features are intentionally excluded.

Build and inspect it with:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
node dist/cli/main.js version
node dist/cli/main.js fqgate status
node dist/cli/main.js fqgate update --check
```

Use `config/example.json` as the no-secret starting point. The Windows bootstrap and real-host acceptance procedure are in [`scripts/windows`](scripts/windows).

The detailed acceptance contract remains in [`docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md`](docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md), and the handoff report is [`docs/status/phase-0-1-completion.md`](docs/status/phase-0-1-completion.md).

## Current upstream baseline

Planning was performed against FQGate `1.0.0` and the public `tonghuasun-agent` implementation as observed on **2026-09-16**. Upstream behavior is not treated as immutable; compatibility checks are a first-class requirement of this project.
