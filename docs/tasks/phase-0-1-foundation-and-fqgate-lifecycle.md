# Phase 0 + Phase 1 Task Package — Foundation and FQGate Lifecycle

Status: **ready for implementation**  
Target executor: Codex Goal / coding agent  
Scope owner: `fqgate-remote-bridge`  
Baseline: 2026-09-16

## 1. Objective

Build the first executable version of `fqgate-remote-bridge`, limited to repository foundations and safe local FQGate lifecycle management on Windows.

At the end of this package, a supported Windows x64 host should be able to:

1. inspect the official FQGate stable release manifest;
2. determine the applicable Windows package;
3. download it from the official upstream release asset;
4. verify expected file size and SHA-256 before activation;
5. verify the candidate executable reports a compatible FQGate version;
6. install/update it into a deterministic per-user application directory;
7. preserve a known-good previous executable before replacement;
8. start, stop, restart, and inspect the managed FQGate process safely;
9. probe `GET http://127.0.0.1:17281/v1/market/health`;
10. distinguish process state, upstream compatibility, network readiness, and market-session/login state;
11. roll back after a failed update activation when a known-good previous binary exists;
12. expose the above through a small CLI suitable for later bootstrap/supervisor reuse.

This task does **not** expose anything remotely.

## 2. Source of truth

Before implementation, read and follow:

1. `AGENTS.md`
2. `README.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. this task package

If current upstream behavior differs from `docs/upstream-contracts.md`, do not silently code around it. Record the verified change in `docs/upstream-contracts.md` and keep the implementation behind the compatibility adapter.

## 3. Scope boundaries

### In scope

- Node.js 22+ / TypeScript project foundation
- pnpm package management
- build/typecheck/lint/test scripts
- CI baseline
- typed configuration model
- structured logging + secret redaction foundation
- FQGate release manifest client/parser
- package selection for the initial supported target: Windows x64
- safe downloader with timeouts/retry policy
- file size + SHA-256 verification
- FQGate candidate version probe (`--version`)
- explicit version compatibility policy
- install/stage/activate/rollback mechanics
- managed process lifecycle
- local FQGate health probe
- normalized FQGate/session state
- local CLI
- PowerShell bootstrap only where Windows integration cannot reasonably live in TypeScript
- automated unit/integration tests with fakes/fixtures
- Windows acceptance procedure
- documentation updates reflecting implementation reality

### Explicitly out of scope

Do **not** implement any of these in this goal:

- Fastify bridge server
- Vue UI
- QR/SMS login UI or login adapter
- read-only market-data proxy
- Cloudflare Tunnel provisioning
- `cloudflared` installation/management
- Cloudflare Access
- public hostnames or DNS
- MCP proxying
- WebSocket proxying
- notification providers
- background supervisor daemon
- Windows service installation
- permanent Task Scheduler deployment automation
- `turtle-value-engine` integration
- trading, brokerage, order, cancel, transfer, or other state-changing financial features

Do not opportunistically start Phase 2+ work.

## 4. Keep the repository simple

For Phase 0 + 1, prefer a **single TypeScript package**, not a monorepo.

A reasonable starting shape is:

```text
.
├─ src/
│  ├─ cli/
│  ├─ config/
│  ├─ fqgate/
│  │  ├─ release/
│  │  ├─ compatibility/
│  │  ├─ install/
│  │  ├─ process/
│  │  └─ health/
│  ├─ platform/
│  │  └─ windows/
│  └─ shared/
├─ tests/
│  ├─ fixtures/
│  └─ integration/
├─ scripts/
│  └─ windows/
├─ docs/
└─ .github/workflows/
```

This tree is guidance, not a requirement. Preserve separation of concerns from `AGENTS.md`; do not create empty abstractions merely to match this example.

## 5. Phase 0 deliverables — project foundation

### 5.1 Runtime/tooling

Create a Node.js 22+ TypeScript project using pnpm.

Required repository commands should include equivalents of:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Add formatting/check tooling only if it stays lightweight. Normal CI must not require FQGate, Cloudflare credentials, or network access to private resources.

Commit the lockfile.

### 5.2 CI

Add GitHub Actions CI that at minimum runs:

- dependency install with frozen lockfile
- typecheck
- lint
- tests
- build

Use Windows CI for Windows-path/platform-sensitive behavior. Cross-platform unit tests may additionally run on Ubuntu if useful, but do not pretend Ubuntu tests replace Windows acceptance.

### 5.3 Configuration

Create a typed, runtime-validated configuration layer.

The first implementation only needs settings necessary for local FQGate lifecycle, such as:

- upstream stable manifest URL
- install directory override
- FQGate local base URL (default must remain loopback)
- compatibility policy/pin
- download timeout/retry limits
- activation health timeout
- log level

Requirements:

- safe defaults;
- reject malformed config early;
- no secrets are required in Phase 0/1;
- local FQGate base URL defaults to `http://127.0.0.1:17281`;
- do not normalize an arbitrary remote FQGate URL into an accepted configuration without an explicit future design change.

Provide a safe example configuration if a file-based config is used.

### 5.4 Logging

Introduce structured logging with a central redaction facility.

Even though Phase 0/1 has few secrets, build the redaction mechanism now so future Cloudflare tokens cannot accidentally be logged.

Tests should prove configured sensitive keys/authorization-like values are redacted.

### 5.5 Version/build metadata

The CLI/build should be able to report bridge version/build information. A commit SHA may be included when available, but tests must remain deterministic.

## 6. Phase 1 deliverables — FQGate release and lifecycle manager

### 6.1 Release-source adapter

Implement an explicit release-source interface and an official FQGate implementation.

Default official source:

```text
https://raw.githubusercontent.com/zhuyifang/fqgate-releases/main/releases/stable.json
```

Do not scrape the GitHub Releases HTML page.

Parse only the fields the bridge needs and validate them at runtime. Treat malformed or incomplete manifests as hard failures.

Expected useful upstream fields are recorded in `docs/upstream-contracts.md`.

### 6.2 Package selection

Initial supported production target:

```text
platform = windows
architecture = x86_64
```

The selector must:

- reject no-match;
- reject ambiguous multiple matches unless the manifest contract explicitly allows and handles them;
- return version, filename, size, SHA-256, and official asset URL inputs needed for download;
- never choose a package based only on filename guessing.

Keep the selector testable independently from the network.

### 6.3 Compatibility policy

Represent compatibility separately from "latest release".

At minimum support concepts equivalent to:

```text
supported range
validated versions
optional pinned version
```

For the current baseline, FQGate `1.0.0` is the observed validated version. Do not silently claim all future `1.x` versions are validated.

A newer manifest version can be discovered and reported without automatically being considered safe to activate.

Unknown/incompatible versions must produce an explicit state/result rather than triggering transparent use.

### 6.4 Downloader and integrity verification

Download into a staging/temp path, never directly over the active executable.

Requirements:

- HTTPS only for the official release asset;
- request timeout;
- bounded retries for transient failures;
- write to a temporary candidate file;
- verify exact expected size;
- compute and verify SHA-256;
- remove rejected/incomplete candidates;
- never activate a checksum mismatch;
- error messages must be actionable without leaking sensitive headers/config.

Use dependency injection or a similarly testable boundary so normal tests do not repeatedly download the real FQGate binary.

### 6.5 Candidate executable validation

Before activation, invoke the staged candidate with `--version` through a process-runner abstraction.

Requirements:

- finite timeout;
- capture exit code/stdout/stderr with bounded output;
- parse version conservatively;
- fail if the executable does not identify itself as FQGate in the expected form;
- apply compatibility policy to the reported version;
- never trust the manifest version alone.

Tests should use fake process runners; do not commit a copied FQGate executable as a fixture.

### 6.6 Installation layout

Use a deterministic per-user application data directory by default, consistent with the Windows-first architecture.

An acceptable conceptual layout is:

```text
<FQGATE_REMOTE_BRIDGE_HOME>/
  fqgate/
    current/fqgate.exe
    previous/fqgate.exe
    state.json
  downloads/
  logs/
```

The exact path may use `%LOCALAPPDATA%` or another documented per-user application-data convention.

Requirements:

- no admin rights merely to store FQGate;
- state writes should be crash-safe where practical (temp + rename/replace);
- recorded state must not be the sole authority for executable identity: hashes/version probes remain authoritative;
- never overwrite `previous` until the current version is known-good enough to become the rollback source.

### 6.7 Activation/update transaction

Implement activation as an explicit transaction/state machine, not scattered file copies.

Conceptual flow:

```text
resolve release
  -> download candidate
  -> size/hash verify
  -> candidate --version verify
  -> compatibility gate
  -> stop managed current process
  -> preserve known-good current as previous
  -> activate candidate as current
  -> start current
  -> health probe until deadline
  -> mark activation successful
```

If activation fails after replacement and a known-good previous executable exists:

```text
stop failed candidate
  -> restore previous
  -> start previous
  -> verify previous health
  -> record rollback outcome
```

Do not create infinite restart/rollback loops.

If no previous binary exists, fail clearly and leave enough diagnostics for manual recovery.

### 6.8 Managed process lifecycle

Provide a Windows-aware process abstraction for:

- status
- start
- stop
- restart

Important safety properties:

- operate on the bridge-managed executable path, not every process named `fqgate`;
- avoid terminating an unrelated FQGate installation where possible;
- use bounded stop/start waits;
- distinguish `not installed`, `installed but stopped`, `starting`, `running`, and `failed/unhealthy`;
- FQGate may require an interactive user session: do not claim Windows-service/headless support in this phase.

If existing-process discovery requires a small PowerShell/CIM adapter on Windows, keep its output machine-readable and keep policy/business logic in TypeScript.

### 6.9 Health and session model

Probe:

```http
GET http://127.0.0.1:17281/v1/market/health
```

Use a bounded timeout and schema validation.

Normalize observed upstream fields behind an adapter. At minimum distinguish:

#### FQGate lifecycle

```text
not_installed
stopped
starting
ready
unhealthy
incompatible
```

#### Market/session condition

Use a conservative model based on actually observed fields, for example:

```text
connected
guest
login_required
unknown
```

Do not infer more precision than the upstream health payload supports.

`process running` must **not** be treated as equivalent to `market data ready`.

`health endpoint responds` must **not** automatically be treated as `authenticated account connected`.

Store the raw upstream version and selected non-sensitive diagnostic fields for troubleshooting, while exposing normalized state to the rest of the application.

### 6.10 CLI surface

Implement a small local CLI. Exact naming may vary, but it should provide equivalent operations to:

```text
fqgate-remote-bridge version
fqgate-remote-bridge fqgate release
fqgate-remote-bridge fqgate status
fqgate-remote-bridge fqgate health
fqgate-remote-bridge fqgate install
fqgate-remote-bridge fqgate update --check
fqgate-remote-bridge fqgate update --apply
fqgate-remote-bridge fqgate start
fqgate-remote-bridge fqgate stop
fqgate-remote-bridge fqgate restart
```

Requirements:

- useful human-readable default output;
- `--json` machine-readable output for operations that will later be used by bootstrap/supervisor code;
- meaningful non-zero exit codes on failure;
- update check must not imply activation;
- support `--dry-run`/plan output for install/update where practical;
- never output the full contents of upstream binaries or future secret-bearing config.

Do not add Cloudflare commands yet.

### 6.11 PowerShell bootstrap boundary

A small Windows bootstrap/acceptance script may:

- verify Node/pnpm or invoke the built CLI;
- create expected application directories;
- invoke CLI install/status/health commands;
- assist with Windows-specific process inspection if needed.

Do not duplicate manifest parsing, hashing, compatibility policy, download selection, or rollback logic in PowerShell.

## 7. Tests

### 7.1 Required automated tests

At minimum cover:

#### Manifest/release

- valid stable manifest
- unpublished/non-stable status
- missing required field
- unsupported architecture
- ambiguous package selection
- invalid size/hash/version format

#### Compatibility

- validated version
- supported-but-not-validated version if that distinction exists
- explicitly unsupported version
- pinned-version mismatch

#### Download/integrity

- successful staged download
- timeout/transient retry
- truncated file / size mismatch
- SHA-256 mismatch
- cleanup of rejected partial file

#### Candidate validation

- correct `fqgate --version`
- wrong executable identity
- non-zero exit
- timeout
- malformed version output

#### Install/update/rollback

- clean first install
- install/update no-op when active hash already matches selected release
- successful update preserving previous
- activation start failure
- activation health timeout
- rollback success
- rollback failure reported without loop
- interrupted/stale staging artifacts do not become active accidentally

#### Process/health

- absent executable
- stopped process
- running healthy process
- running but health endpoint unavailable
- health payload malformed
- network not ready
- connected vs guest/login-required/unknown normalization based only on fixtures actually supported by the adapter

#### Configuration/logging

- malformed config rejected
- loopback default retained
- sensitive key/header redaction

### 7.2 Test doubles and fixtures

Use fixtures for:

- stable manifest JSON
- health responses
- compatibility cases

Use fakes/test doubles for:

- HTTP transport/download
- filesystem edge cases where practical
- clock/timers where needed
- process runner
- process discovery/control

Do not commit the proprietary/closed FQGate executable as a test asset.

### 7.3 Windows acceptance

Document and, where practical, script a manual acceptance flow on a real Windows x64 host.

It must cover:

1. clean install into the project's managed directory;
2. version/hash inspection;
3. FQGate starts in the current user session;
4. first-use UI/risk acknowledgement limitation is documented if encountered;
5. `/v1/market/health` becomes reachable;
6. status distinguishes process and market-session state;
7. stop/restart works against the managed executable;
8. rerun install/update is idempotent;
9. rollback mechanics can be demonstrated safely with a controlled/fake failure path if a real prior upstream version is not available.

Do not mark headless Windows-service support as proven by this acceptance.

## 8. Error taxonomy

Create stable internal/CLI error categories rather than matching arbitrary message strings later.

At minimum distinguish concepts such as:

```text
CONFIG_INVALID
MANIFEST_FETCH_FAILED
MANIFEST_INVALID
PACKAGE_NOT_FOUND
PACKAGE_AMBIGUOUS
DOWNLOAD_FAILED
SIZE_MISMATCH
CHECKSUM_MISMATCH
CANDIDATE_INVALID
VERSION_INCOMPATIBLE
PROCESS_START_FAILED
PROCESS_STOP_FAILED
HEALTH_TIMEOUT
HEALTH_INVALID
ACTIVATION_FAILED
ROLLBACK_FAILED
```

Names may change, but the semantic separation should remain.

## 9. Safety/invariants that tests should enforce

The implementation must preserve these invariants:

1. Nothing in Phase 0/1 listens on a public or LAN interface.
2. FQGate base URL defaults to loopback.
3. A downloaded candidate is never activated before integrity + identity + compatibility checks.
4. Unknown FQGate versions never become silently "validated".
5. An update never overwrites the only known-good rollback binary prematurely.
6. Process control targets the managed executable, not arbitrary same-name processes.
7. No FQGate binary is committed to this repository.
8. No trading feature or route is implemented.
9. No Cloudflare integration is introduced in this goal.
10. Failure leaves explicit diagnostics and a deterministic recoverable state where possible.

## 10. Documentation deliverables

Update documentation in the same implementation change when reality differs from the plan.

At completion, add a status report such as:

```text
docs/status/phase-0-1-completion.md
```

It should record:

- what was implemented;
- final CLI commands;
- test/CI results;
- Windows acceptance status;
- actual install paths/process model;
- known limitations;
- any upstream FQGate behavior discovered during development;
- explicit remaining work for Phase 2.

Update `docs/roadmap.md` to mark Phase 0 and Phase 1 complete only when their exit criteria are actually satisfied.

## 11. Definition of done

This goal is complete only when all of the following are true:

- repository has a working TypeScript/pnpm foundation;
- CI passes;
- build/typecheck/lint/tests pass;
- FQGate manifest parsing/package selection is deterministic and tested;
- download integrity checks are mandatory and tested;
- candidate executable identity/version validation exists;
- compatibility is explicit and fail-closed;
- safe install/update/rollback transaction exists and is tested;
- managed process start/stop/restart/status exists for Windows;
- local health probe and normalized lifecycle/session state exist;
- local CLI supports human + JSON output needed for later phases;
- no Phase 2+ feature has been implemented accidentally;
- documentation accurately describes actual behavior;
- `docs/status/phase-0-1-completion.md` is present;
- real Windows acceptance is either completed and recorded, or clearly marked as the only remaining external acceptance step rather than falsely claimed complete.

## 12. Implementation philosophy

Prefer correctness and auditability over clever automation.

The important artifact from Phase 1 is not merely "a script that downloads fqgate.exe". It is a deterministic lifecycle boundary that later Cloudflare, UI, supervisor, and consumer layers can safely trust.
