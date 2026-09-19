# Phase 4 Implementation Handoff — Secure Remote Human Access

Date: 2026-09-17

Status: **CLOSED / live Windows + Cloudflare acceptance completed**

This handoff describes the code, deterministic verification, and bounded live
Windows + Cloudflare evidence completed for the deployment copy under
`D:\code\research\fqgate-remote-bridge`. The operator
completed the authenticated UI, QR, remote-denial, local-maintenance, and
restart/reconnect checks; Phase 4 is CLOSED.

## Delivered implementation

### Request context and Bridge authorization

- Added `src/bridge/policy/request-context.ts` with explicit local versus
  `remote_human` classification.
- Accepted local Host forms are IPv4 loopback/localhost with no port or the
  configured Bridge port. Exactly one configured DNS hostname is accepted as
  remote-human; unknown Host values fail with HTTP 421.
- `X-Forwarded-Host`, `Forwarded`, source IP, and similar metadata are not
  consulted. Remote-human requests require a non-empty
  `Cf-Access-Jwt-Assertion`; its value is not parsed or logged.
- Applied the same gate at `src/server.ts` for page/static requests and at
  `src/bridge/transport/http.ts` before operation dispatch.
- Evolved the registry to `local_and_remote_human` and kept the exact Phase 4
  `local_only` set: `updates.check`, `updates.plan`, `updates.apply`, and
  `openapi.refresh`.
- Raw/unregistered upstream paths remain denied and no market-data, trading,
  MCP, WebSocket, or service-token operation was added.

### Configuration, UI, and CLI

- Added constrained `remoteAccess.remoteHostname` configuration and fixed
  `cloudflared.origin = http://127.0.0.1:17282`.
- Added repo-external absolute token-file validation and default Windows
  locations under `ProgramData`; no token value is accepted in normal JSON
  configuration.
- Reused the existing React/TanStack UI. Remote context exposes Dashboard,
  QR, read-only update status, and reference catalog while showing clear
  Chinese local-maintenance messaging and omitting/disabled local controls.
- Added explicit CLI commands for cloudflared release metadata, dry-run/manual
  install, status, and Windows service install/start/stop/restart/status.

### cloudflared lifecycle and secret boundary

- Added `src/cloudflared/` as a framework-agnostic release, staging,
  candidate-identity, lifecycle, token-file, and Windows service boundary.
- The release source is fixed to official `cloudflare/cloudflared` GitHub
  release metadata and the exact Windows x64 asset. Tag, URL, asset size,
  official SHA-256/digest, and candidate `--version` are checked. Arbitrary
  binary/manifest URLs are not accepted.
- Windows service invocation is built as
  `cloudflared tunnel run --token-file <protected-path>`. The raw Tunnel token
  is not put in service command arguments, logs, diagnostics, UI, browser
  storage, tests, or Git.
- Token-file reads/creation and Windows `icacls`/service identity checks fail
  closed. Service changes are explicit; no background update loop or
  Cloudflare API provisioning exists.

### Acceptance material and docs

- Added `-VerifyPhase4` and optional unauthenticated `-RemoteUrl` handling to
  `scripts/windows/acceptance.ps1`.
- The Windows acceptance script resolves the installed `node.exe` directly so
  hosts whose PowerShell command resolver does not expose the `node` alias can
  still run the bounded checks.
- The live Access check uses a no-redirect .NET request helper so Windows
  PowerShell 5.1 records a real 302 challenge instead of treating it as an
  unhandled redirection error.
- Added `docs/operations/windows-phase-4-acceptance.md` with the manual
  Cloudflare contract, token/service checks, authenticated human checks,
  restart/reconnect procedure, evidence redaction rules, and closure gate.
- Updated README, AGENTS, architecture, security, upstream contracts,
  roadmap, agent guide, Phase 4 task/design notes, and config example.

## Security/architecture decisions

1. Cloudflare Access is the edge authentication mechanism. The Bridge only
   performs assertion-presence/drift detection and never implements a second
   JWT verifier in this phase.
2. Host is explicit and fail-closed because cloudflared makes origin source IP
   unsuitable for context selection. Forwarding headers are untrusted.
3. The operation registry, not UI visibility, is the authorization boundary.
4. The remotely managed Tunnel token is a protected file reference, not a
   command-line secret. The local origin is a code/config invariant for
   `127.0.0.1:17282`; FQGate `127.0.0.1:17281` is never a Tunnel origin.
5. Cloudflare resource provisioning remains manual and Phase 6 work. No
   Global API Key, broad API token, service-token machine auth, or DNS/drift
   workflow was added.

## Automated checks actually run

The following commands were run in this implementation workspace during final
verification:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Results:

- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 14 files, 108 tests.
- `pnpm build` — passed: CLI, client, SSR, and Nitro output generated.
- `pnpm format:check` — passed.
- `pnpm test:e2e` — passed: 7 tests.

Phase 4 deterministic coverage is in `tests/phase4.test.ts` and
`tests/e2e/phase4.spec.ts`, with Phase 2/3 regression coverage retained.

## Windows/Cloudflare evidence

The following bounded live evidence was obtained on the supported Windows x64
host; no secret, assertion, cookie, QR payload, or full session identifier was
recorded:

- Deployment copy: `D:\code\research\fqgate-remote-bridge`.
- Windows Node.js: `v24.15.0`; FQGate listener exactly
  `127.0.0.1:17281`; Bridge listener exactly `127.0.0.1:17282`.
- Dedicated remotely managed Tunnel: `fqgate-remote-bridge`, UUID
  `947df8a3-094d-439c-82dd-db43195ab99e`, status `healthy`, four active edge
  connections at the time of verification.
- Published origin is exactly `http://127.0.0.1:17282`; no FQGate route is
  present on the unrelated `home-services` Tunnel.
- Public hostname DNS is a proxied CNAME to the dedicated Tunnel target.
- Dedicated self-hosted Access application protects `fqgate.haoqi90.top`;
  the human Allow policy is restricted to the intended operator identity;
  Tunnel-side Access assertion verification is required.
- Unauthenticated public request returned HTTP 302 to the Cloudflare Access
  login host. The operator confirmed authenticated Dashboard/status, QR
  begin/poll, read-only update status, and reference-only API Catalog access.
- Windows service `FQGateRemoteBridgeCloudflared` is installed as
  `LocalSystem`, set to automatic start, and running. Invocation uses
  `tunnel run --token-file <protected-path>`; raw token is absent from the
  service command line. Token-file ACL is reported `secure` by the built CLI.
- Official cloudflared `2026.9.0`, Windows x64 asset size `54967280`,
  SHA-256
  `547057326266f0e1c7d50d102dbd22ff283d740c055bd61e94f10e2c606f89af`.
- The transient 1033 condition was traced to the OpenWrt `daed` outbound path
  and cleared after its restart. The host's reversible outbound firewall
  blocker was disabled so cloudflared could reach Cloudflare edge.
- The Windows Phase 4 acceptance script passed service, token-file,
  loopback, origin-isolation, and unauthenticated Access checks.
- A real Windows reboot/recovery pass showed the expected lifecycle split:
  cloudflared returned to `Running`, while the interactive FQGate and Bridge
  processes were absent and the public hostname returned HTTP 502. Starting
  FQGate through the managed lifecycle and the production Bridge launcher
  restored `127.0.0.1:17281`/`127.0.0.1:17282`; the public unauthenticated
  check then returned the Access HTTP 302 challenge. The Windows launcher was
  hardened to resolve `node.exe` directly and use bounded ProcessStartInfo
  probes in this PowerShell environment.

The operator also confirmed remote local-admin denial, raw/unregistered path
denial, local maintenance through loopback, and cloudflared restart/reconnect
after the outbound-route fix. These results satisfy the live closure gate;
Phase 4 is **CLOSED**.

## Remaining blockers and future-plan handoff

There are no remaining Phase 4 acceptance blockers. The following items are
intentionally deferred and require separate planning before implementation:

- design a separate remote-administrator policy with stronger authentication,
  device restrictions, and explicit second confirmation; and
- optimize the existing Dashboard UI for mobile screens without creating a
  second frontend or weakening the server-side operation policy.

Neither item is implemented by this Phase 4 handoff, and neither authorizes
Phase 5+ work to be added opportunistically.

## Source files for follow-up

- [request context policy](../../src/bridge/policy/request-context.ts)
- [operation registry](../../src/bridge/policy/registry.ts)
- [Bridge HTTP authorization handler](../../src/bridge/transport/http.ts)
- [cloudflared manager](../../src/cloudflared/manager.ts)
- [Windows service adapter](../../src/cloudflared/windows/service.ts)
- [Windows Phase 4 acceptance](../operations/windows-phase-4-acceptance.md)
