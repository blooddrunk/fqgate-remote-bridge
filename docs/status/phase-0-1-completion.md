# Phase 0 + Phase 1 Completion Report

Date: **2026-09-16**

Status: **implementation and closure fixes complete; real Windows x64 acceptance pending**

## Implemented behavior

This phase is a single Node.js 22+ TypeScript package managed by pnpm. It is local-only and does not start an HTTP listener, Cloudflare connector, service, scheduler task, UI, proxy, login adapter, MCP endpoint, WebSocket proxy, notifier, or trading feature.

The implementation provides:

- strict parsing of the official `releases/stable.json` manifest and deterministic Windows x64 package selection;
- HTTPS-only release downloads from the official GitHub release asset layout, bounded timeout/retries, temporary staging, exact byte-size verification, SHA-256 verification, and cleanup of rejected artifacts;
- conservative `FQGate --version` identity parsing and explicit compatibility states: validated, supported-but-unvalidated, unsupported, and pinned-mismatch;
- a transactional per-user installation layout with atomic state files, a known-good `previous` executable, one-shot activation rollback, and explicit rollback-failure diagnostics;
- managed process start/stop/status/restart boundaries that persist a PID and verify the executable path before control; Windows inspection uses machine-readable PowerShell/CIM output and does not kill all same-name processes;
- a bounded loopback health probe for `/v1/market/health` that decodes the observed `{ code, message, data }` envelope, fails closed on malformed/non-zero responses, validates the health data object, and conservatively normalizes network readiness and connected/guest/login-required/unknown session states;
- structured logging with central redaction and no Phase 0/1 secret configuration;
- human-readable and `--json` CLI output with non-zero failure categories and safe `--dry-run`/`update --check` behavior;
- Windows bootstrap and acceptance scripts that resolve `dist/cli/main.js` from `$PSScriptRoot` and invoke it directly with Node while keeping lifecycle policy in TypeScript;

## Final CLI

```text
fqgate-remote-bridge version
fqgate-remote-bridge fqgate release [--json]
fqgate-remote-bridge fqgate status [--json]
fqgate-remote-bridge fqgate health [--json]
fqgate-remote-bridge fqgate install [--dry-run] [--json]
fqgate-remote-bridge fqgate update --check [--json]
fqgate-remote-bridge fqgate update --apply [--dry-run] [--json]
fqgate-remote-bridge fqgate start [--json]
fqgate-remote-bridge fqgate stop [--json]
fqgate-remote-bridge fqgate restart [--json]
```

The no-secret example is [`config/example.json`](../../config/example.json). The CLI accepts `--config <path>` for a JSON configuration file, but its default FQGate base URL remains `http://127.0.0.1:17281` and remote hosts are rejected.

## Install and process model

On Windows, the default root is:

```text
%LOCALAPPDATA%\FQGateRemoteBridge\
  fqgate\current\fqgate.exe
  fqgate\previous\fqgate.exe
  fqgate\state.json
  fqgate\process.json
  downloads\
  logs\
```

The CLI creates these directories without administrator rights. FQGate is launched as the managed executable in the current interactive user session. A Windows service or permanent Task Scheduler deployment is deliberately not implemented or claimed; FQGate's desktop/first-use behavior must be proven on a real host first.

The state file records identity metadata but is not trusted on its own. Current and previous executable hashes and candidate version probes remain authoritative. A staged file is never activated until its manifest size/hash, executable identity, manifest-version match, and compatibility gate all pass.

## Tests and CI

The repository includes fixtures and fakes for manifest, download, process, and health behavior. The required local checks completed successfully on the development host:

```text
pnpm typecheck  # passed
pnpm lint       # passed
pnpm test       # passed; 60 tests
pnpm build      # passed
pnpm format:check # passed
```

The GitHub Actions workflow runs frozen-lockfile install, typecheck, lint, tests, build, and format checks on both `ubuntu-latest` and `windows-latest`. The Windows job also runs both PowerShell entry points in `-VerifyCli` mode after build; the final closure-fix run [35092128468](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/35092128468) passed this smoke step without downloading or activating FQGate. CI is designed not to require a real FQGate binary, Cloudflare credentials, or private resources.

## Windows acceptance status

Real Windows x64 acceptance was **not executed**. Development commands ran in
Linux/WSL2. The underlying Windows x64 host has an existing unmanaged FQGate
that answered the live health probe, but it has no Windows Node.js/pnpm and no
managed bridge installation. It is not a clean/disposable target on which to
replace or start another FQGate binary, so this observation is not acceptance.
Real Windows x64 acceptance remains the only product-level step before Phase
0/1 can be considered fully closed.

The closure-fix protocol and script changes are covered by local automated tests and the passing Windows CI smoke step, but CI is not a substitute for the intended interactive Windows host acceptance.

Run the scripted procedure from a real Windows x64 interactive user session after building the package:

```powershell
pwsh -File .\scripts\windows\acceptance.ps1
pwsh -File .\scripts\windows\acceptance.ps1 -ExecuteInstall
```

The procedure must confirm clean install, manifest/hash/version inspection, current-user process launch, first-use acknowledgement behavior, loopback health reachability, distinct process/network/session status, managed stop/start, idempotent re-install, and a controlled rollback demonstration. It must not be used to claim headless Windows-service support.

## Known limitations and upstream discoveries

- The upstream stable manifest rechecked on 2026-09-16 remains FQGate `1.0.0`, published on the stable channel. Its Windows artifact is explicitly unsigned, so checksum and candidate validation remain mandatory. See [`docs/upstream-contracts.md`](../upstream-contracts.md), the [official stable manifest](https://raw.githubusercontent.com/zhuyifang/fqgate-releases/main/releases/stable.json), and the [official release page](https://github.com/zhuyifang/fqgate-releases/releases/tag/fqgate-v1.0.0).
- The manifest supplies `fileName`, size, and SHA-256 but no asset URL; the official adapter constructs the observed release-download URL from the version tag and filename and restricts it to the upstream repository.
- This package does not vendor or redistribute the FQGate executable. A real install/download and the desktop first-use flow therefore remain host acceptance concerns.
- No DPAPI/Credential Manager secret store is needed yet because Phase 0/1 has no secrets. The redaction foundation is present for later phases.
- Without a bridge-owned PID record, status does not discover and control arbitrary externally started same-name FQGate processes. This is intentional for safety.

## Remaining Phase 2 work

Phase 2 must add the local Fastify bridge, explicit read-only route registry, FQGate compatibility adapter for approved routes, QR login begin/poll handling, minimal Vue status/login UI, and normalized bridge error/API behavior. It must preserve the Phase 0/1 loopback, route-allowlist, no-trading, and compatibility boundaries. No Phase 2 work is included in this commit.
