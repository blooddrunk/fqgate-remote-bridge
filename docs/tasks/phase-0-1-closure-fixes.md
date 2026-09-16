# Phase 0 + Phase 1 Closure Fixes

Status: **required before Phase 0/1 closure**  
Baseline implementation commit reviewed: `e9f0f4e53dd97b77ad1723a33279f0429cf43cf4`  
Review date: 2026-09-16

## Objective

Close the two integration gaps discovered during post-implementation review, then run the real Windows x64 acceptance procedure. Do not start Phase 2 in this task.

## Blocker 1 — FQGate HTTP envelope compatibility

### Finding

The current `FqgateHealthProbe` parses the body returned by `GET /v1/market/health` as if the health fields are directly at the top level:

```json
{
  "status": "connected",
  "network_ready": true,
  "connected": true
}
```

The current upstream `tonghuasun-agent` local API client instead treats normal FQGate HTTP API responses as an envelope:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "connected",
    "network_ready": true,
    "connected": true
  }
}
```

The upstream UI QA fixtures also return the envelope shape for `/v1/market/health`.

This means the existing Phase 0/1 health fixtures do not represent the observed upstream wire response and a real FQGate health response can be rejected as `HEALTH_INVALID`.

### Required fix

Introduce an explicit FQGate HTTP envelope decoding boundary rather than embedding ad-hoc unwrapping in future route code.

For the Phase 0/1 scope it is acceptable to implement a small reusable decoder used by the health probe. It should:

- require a JSON object for the envelope;
- validate `code` as the upstream success/error indicator;
- accept `code === 0` only as the normal success path;
- extract `data` and pass that object to the existing health normalizer;
- preserve a sanitized upstream `message` for diagnostics where useful;
- fail closed for malformed envelopes, missing/invalid `data`, or unexpected success structure;
- handle non-zero upstream `code` deterministically without treating the payload as healthy;
- keep HTTP availability, envelope validity, data-schema validity, network readiness, and session state conceptually distinct;
- remain bounded by the existing response size and timeout controls.

Do not add Phase 2 proxy/server functionality while introducing this reusable protocol boundary.

### Required tests

Update/add fixtures and tests for at least:

- `code: 0` + valid health `data`;
- `code: 0` + guest/login-required observations inside `data`;
- `code: 0` + malformed/missing/null `data`;
- non-zero `code` + message;
- malformed envelope;
- non-JSON body;
- HTTP non-2xx response;
- activation wait using the canonical envelope shape.

The canonical health fixtures used by Phase 0/1 tests should model the observed upstream wire format, not the already-unwrapped application object.

### Documentation

Update `docs/upstream-contracts.md` to explicitly document the observed FQGate HTTP envelope and distinguish:

```text
wire response envelope
        ↓
envelope decoder
        ↓
health data object
        ↓
normalized HealthObservation
```

## Blocker 2 — Windows scripts must invoke the local CLI deterministically

### Finding

`scripts/windows/bootstrap.ps1` and `scripts/windows/acceptance.ps1` currently invoke:

```powershell
pnpm exec fqgate-remote-bridge ...
```

`fqgate-remote-bridge` is the current root package's own `bin` entry, not a dependency binary. The CI workflow exercises TypeScript/build/tests on Windows but does not execute these PowerShell entry points against the built CLI.

The scripts should not depend on package-manager self-bin linking behavior.

### Required fix

Make both scripts resolve and invoke the built CLI deterministically from the repository/package location.

Preferred approach for this phase:

```text
node <resolved-repo-root>/dist/cli/main.js ...
```

Requirements:

- resolve paths relative to `$PSScriptRoot`, not the caller's current working directory;
- verify the built CLI file exists and give an actionable message if `pnpm build` has not been run;
- keep argument forwarding intact;
- keep `--config` paths working;
- do not globally install/link the package as part of acceptance;
- do not add permanent Windows service/Task Scheduler behavior.

An explicit package script such as `pnpm run cli -- ...` is also acceptable if it is demonstrably deterministic and does not rely on the root package self-bin appearing in `node_modules/.bin`.

### Required tests/checks

Where practical, add a lightweight static/unit check for the script command construction. At minimum, run the PowerShell scripts on `windows-latest` in a safe **dry-run-only** CI step after `pnpm build`, so CI proves the script can locate and invoke the CLI without installing the real FQGate executable.

The CI dry-run must not download/activate FQGate if avoiding network/upstream coupling is required. If the current `install --dry-run` necessarily fetches the public manifest, separate script invocation validation from live upstream integration so normal CI remains deterministic.

## Real Windows acceptance

After the fixes pass CI, run on the intended always-on Windows x64 host from an interactive user session:

```powershell
pnpm install --frozen-lockfile
pnpm build
pwsh -File .\scripts\windows\acceptance.ps1
pwsh -File .\scripts\windows\acceptance.ps1 -ExecuteInstall
```

Confirm manually:

1. FQGate is downloaded from the official source and checksum/version validation succeeds.
2. Managed install path is under `%LOCALAPPDATA%\FQGateRemoteBridge` by default.
3. FQGate starts in the interactive user session.
4. Complete any first-run acknowledgement FQGate requires.
5. Real `/v1/market/health` is successfully decoded through the envelope adapter.
6. `status` exposes process state separately from `networkReady` and session state.
7. stop/start/restart target only the managed executable.
8. reinstall/update check is idempotent.
9. no LAN/public listener, Cloudflare, service, Task Scheduler, trading feature, or Phase 2 behavior was introduced.

## Closure documentation

After successful implementation and real Windows acceptance:

- update `docs/status/phase-0-1-completion.md` with the review fixes and actual Windows acceptance evidence;
- update `docs/roadmap.md` so Phase 0 and Phase 1 are marked fully closed only if the real-host acceptance succeeds;
- record any observed real FQGate health payload details in `docs/upstream-contracts.md` without storing sensitive/session data;
- keep Phase 2 unstarted.

## Definition of done

This closure task is complete when:

- the health adapter correctly handles the observed FQGate HTTP envelope;
- tests use canonical wire-shape fixtures and pass;
- Windows bootstrap/acceptance CLI invocation is deterministic;
- Linux and Windows CI pass;
- the real Windows x64 acceptance procedure has been executed successfully and documented;
- Phase 0 + Phase 1 can be truthfully marked closed;
- no Phase 2 functionality was added.
