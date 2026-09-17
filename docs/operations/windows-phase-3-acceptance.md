# Windows Phase 3 Acceptance Procedure

This procedure validates the local Phase 3 upgrade center and Runtime OpenAPI
foundation on the supported Windows x64 host. It is operator-driven and does
not install a Windows service, create a Task Scheduler entry, log out an
existing FQGate account, or apply a release merely because the Dashboard was
opened.

## Preconditions

- Windows x64, Node.js 22+, Corepack/pnpm 11.23.0, and an interactive desktop
  user session;
- FQGate is managed by this repository and, for the live OpenAPI checks, is
  running on `127.0.0.1:17281`;
- no unrelated process is using bridge port `17282`;
- the repository is a clean, built checkout. Do not record QR/session material.

FQGate remains a desktop process in an interactive session. This procedure does
not claim headless Windows-service support.

## Build and deterministic checks

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

The normal test suite uses deterministic fakes. It covers invalid candidates,
size/hash/version failures, health failure rollback, Runtime OpenAPI failure
rollback, stale confirmations, update concurrency, and unregistered upstream
route denial.

## Safe live Phase 3 smoke test

After `pnpm build`, run:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\windows\acceptance.ps1 -VerifyPhase3
```

PowerShell 7 may use the equivalent `pwsh -NoProfile -NonInteractive -File
.\scripts\windows\acceptance.ps1 -VerifyPhase3` command.

`-VerifyPhase3` is an explicit operator request. It implies `-VerifyCli` and
`-VerifyBridge`, then performs these non-mutating checks:

1. `fqgate update --check --json` uses the code-registered GitHub source;
2. bridge has exactly one `127.0.0.1:17282` listener;
3. FQGate has exactly one `127.0.0.1:17281` listener;
4. raw `/v1/market/health` and an unregistered upstream path return `404` from
   the bridge;
5. `GET /api/v1/updates/status` reports source `github` without causing a
   release check;
6. `GET /api/v1/openapi/catalog` reports the fixed endpoint
   `http://127.0.0.1:17281/openapi.json`, a 64-character SHA-256 fingerprint,
   and a live operation catalog;
7. an explicit Dashboard API `POST /api/v1/updates/check` still reports the
   fixed GitHub source.

The script does not call `updates/apply`. A real install/upgrade is performed
only after an operator has reviewed the Dashboard plan and explicitly checked
the confirmation box. It is safe to use the current/no-op path when no newer
trusted release exists.

## Dashboard evidence

With the bridge running, open:

- `http://127.0.0.1:17282/updates`;
- `http://127.0.0.1:17282/api-reference`.

Confirm that:

- the Updates page does not check GitHub on page load;
- clicking “检查更新” creates a plan containing source, candidate version,
  file name, size, SHA-256, compatibility and restart/session impact;
- the confirmation control is disabled until the operator explicitly confirms;
- changing the candidate invalidates the prior `planId`;
- an activation failure is shown as failed/rolled back according to the
  lifecycle result, with no fake byte-progress percentage;
- Upstream FQGate Reference, Bridge API, and Compatibility / Changes are
  separate views;
- the upstream view has no raw upstream `Try it out` execution control;
- a newly documented upstream path remains absent from Bridge API and returns
  `404` when requested through the bridge.

The API Reference page may fetch the fixed runtime OpenAPI document to render
the reference catalog. That discovery request is not an update check and does
not authorize or proxy any upstream route.

## Optional real update acceptance

Use a real newer release only when the official fixed manifest has one that is
supported and the operator has a rollback window. The safe sequence is:

```powershell
node .\dist\cli\main.js fqgate update --check --json
# review source, version, size, SHA-256 and compatibility
```

Then use `/updates` to generate the same plan, confirm it explicitly, and
record the resulting version, health, OpenAPI fingerprint, required-contract
coverage, and known-good previous version. Do not corrupt the live executable
to manufacture a rollback test; the fixture-backed tests are the rollback
proof. Do not log out an already connected account to force a QR test.

## Evidence record

Record only bounded metadata:

```text
date:
repository revision:
Windows version/architecture:
Node/pnpm versions:
FQGate version:
bridge listener:
FQGate listener:
runtime OpenAPI version/byte count/fingerprint/operation count:
required contract coverage:
update check result:
dashboard plan/apply result:
raw route 404 result:
rollback result (fixture or safe real candidate):
```

Do not record QR images, QR base64, accounts, cookies, credentials, tokens,
authorization headers, upstream flow IDs, full session IDs, or a full live
OpenAPI dump unless it is intentionally converted into a safe fixture.

## Recorded Windows acceptance evidence

Recorded on 2026-09-17 from the target Windows host using a temporary copy of
the built checkout. The repository baseline was `796a916`; the implementation
worktree was the source of the copied build. No secrets, QR/session material, or
full OpenAPI document were recorded.

```text
Windows: 10.0.26200.0 x64
Windows PowerShell: 5.1.26100.9444
Node.js: v24.15.0 win32/x64
FQGate: 1.0.0
FQGate package size: 22921728 bytes
FQGate package SHA-256: d2227dcf0c48f0bc428e3bfece444ba52a6938981d1ba143489be46a6add33c8
FQGate listener during acceptance: exactly 127.0.0.1:17281
Bridge listener during acceptance: exactly 127.0.0.1:17282
Runtime OpenAPI: 3.1.0 / 263513 bytes / 794a4d5436e991edd3cb0fce7411f1b3ff3a8a5f8fa1f457d6616d2d5f85d17e / 89 operations
Required contract coverage: 3/3; missing_required=0
Trusted update check: GitHub fixed source; version 1.0.0; action=noop
Raw /v1/market/health through bridge: 404
Unregistered /v1/new/unregistered through bridge: 404
Post-acceptance cleanup: managed FQGate processes=0; phase listeners=0; temp acceptance dirs=0
```

The live command completed both the trusted update no-op check and the
Runtime OpenAPI/catalog/contract/deny-by-default checks. No mutating install or
upgrade was performed because the fixed trusted source matched the managed
1.0.0 artifact; invalid-candidate and rollback behavior remains covered by the
fixture-backed lifecycle tests. Phase 3 acceptance is closed; future work must
open a new phase before adding remote exposure.
