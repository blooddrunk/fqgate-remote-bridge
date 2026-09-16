# Phase 0 + Phase 1 Completion Report

Date: **2026-09-16**

Status: **Phase 0 and Phase 1 fully closed after successful Windows x64 acceptance**

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

The CLI creates these directories without administrator rights. FQGate is launched as the managed executable in the current interactive user session. The Windows acceptance below confirmed this managed desktop process and its loopback health boundary on one real host. A Windows service or permanent Task Scheduler deployment is deliberately not implemented or claimed.

The state file records identity metadata but is not trusted on its own. Current and previous executable hashes and candidate version probes remain authoritative. A staged file is never activated until its manifest size/hash, executable identity, manifest-version match, and compatibility gate all pass.

## Tests and CI

The repository includes fixtures and fakes for manifest, download, process, and health behavior. The required local checks completed successfully on the development host:

```text
pnpm typecheck  # passed
pnpm lint       # passed
pnpm test       # passed; 61 tests
pnpm build      # passed
pnpm format:check # passed
```

The GitHub Actions workflow runs frozen-lockfile install, typecheck, lint, tests, build, and format checks on both `ubuntu-latest` and `windows-latest`. The closure-fix CI passed on both Ubuntu and Windows, including the Windows `-VerifyCli` smoke step, without downloading or activating FQGate. CI is designed not to require a real FQGate binary, Cloudflare credentials, or private resources.

## Windows acceptance status

Real Windows x64 acceptance completed successfully on 2026-09-16 against
commit `8599bd8`. The repository was exercised from
`D:\code\research\fqgate-remote-bridge-closure-fixes` in the interactive
Windows x64 user session with Node.js `v24.15.0` and Corepack pnpm `11.23.0`.
The PowerShell commands were launched from the host's WSL development shell,
but install, process, filesystem, and health operations ran on Windows.

The final `acceptance.ps1 -ExecuteInstall` run started from a clean default
managed root and confirmed:

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test` (61 tests), and `pnpm format:check` passed;
- the official FQGate `1.0.0` Windows x64 artifact was downloaded, and its
  exact size (`22921728`) and SHA-256
  (`d2227dcf0c48f0bc428e3bfece444ba52a6938981d1ba143489be46a6add33c8`)
  plus executable version validation succeeded;
- the managed executable path was
  `C:\Users\xieyh\AppData\Local\FQGateRemoteBridge\fqgate\current\fqgate.exe`,
  and the running FQGate window was responsive; its listener was owned by
  that same managed executable on `127.0.0.1:17281`;
- the initial real health response after managed start returned HTTP 200 in
  the `{ code, message, data }` envelope and decoded successfully. The
  initial observed state was `networkReady=true`, `connected=false`,
  `session=unknown`, with nullable `login_method` and
  `level2_permission` accepted as unknown; a subsequent health check
  recovered to `connected=true`, `session=connected`, and
  `login_method=formal`;
- managed stop/start completed successfully and the final persisted activation
  state was `succeeded` for version `1.0.0`;
- a subsequent `fqgate update --check` was an exit-code-0 no-op, and
  `fqgate install --dry-run` was an exit-code-0 plan;
- the fixture-backed rollback proof passed with 8 test files and 61 tests.

No first-use acknowledgement prompt was presented during this run, and no
login/session data was entered. The acceptance procedure reached its final
manual-verification line; the WSL interop wrapper did not return after the
Windows GUI child remained running, so that wrapper was terminated only after
the final managed path, listener, state, and process responsiveness had been
verified. No acceptance assertion failed. A temporary pnpm wrapper outside
the repository delegated to the host's Corepack because the host did not
expose a standalone `pnpm` shim; no global package installation was performed.

The earlier failed-attempt managed root was retained recoverably at
`C:\Users\xieyh\AppData\Local\FQGateRemoteBridge.acceptance-failed-20260916`;
the final run used the normal default root and did not overwrite that backup.
The procedure did not install a Windows service or Task Scheduler entry and
does not prove headless service support.

## Known limitations and upstream discoveries

- The upstream stable manifest rechecked on 2026-09-16 remains FQGate `1.0.0`, published on the stable channel. Its Windows artifact is explicitly unsigned, so checksum and candidate validation remain mandatory. See [`docs/upstream-contracts.md`](../upstream-contracts.md), the [official stable manifest](https://raw.githubusercontent.com/zhuyifang/fqgate-releases/main/releases/stable.json), and the [official release page](https://github.com/zhuyifang/fqgate-releases/releases/tag/fqgate-v1.0.0).
- The manifest supplies `fileName`, size, and SHA-256 but no asset URL; the official adapter constructs the observed release-download URL from the version tag and filename and restricts it to the upstream repository.
- This package does not vendor or redistribute the FQGate executable. The real host run above downloaded only from the official release source; desktop first-use behavior remains limited to what was observed on that host.
- No DPAPI/Credential Manager secret store is needed yet because Phase 0/1 has no secrets. The redaction foundation is present for later phases.
- Without a bridge-owned PID record, status does not discover and control arbitrary externally started same-name FQGate processes. This is intentional for safety.

## Remaining Phase 2 work

Phase 2 must add the local Fastify bridge, explicit read-only route registry, FQGate compatibility adapter for approved routes, QR login begin/poll handling, minimal Vue status/login UI, and normalized bridge error/API behavior. It must preserve the Phase 0/1 loopback, route-allowlist, no-trading, and compatibility boundaries. No Phase 2 work is included in this commit.
