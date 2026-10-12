# Phase 7-A implementation handoff

Status: **CLOSED — permanent-Windows live acceptance and exact-commit CI passed**.

## Implementation and verified gates

Implementation commit `4ad9c6abd2348bb0c8c1355f940421677ef786ac` adds the local read-only `supervisor inspect` and `supervisor watch` commands, fixed four-component normalization, transition and probe-failure deduplication, and a fixed-schema journal under the configured install directory. The journal has a 512-byte record limit, four 64-KiB files, link/path checks and an exclusive watcher lock. No Bridge HTTP route, remote operation, recovery action or notification adapter was added.

The existing permanent Windows checkout at `D:\code\research\fqgate-remote-bridge` passed fixed checks `P7A-01-CHECKOUT` through `P7A-08-E2E` on that implementation commit: frozen pnpm 11.23.0 install, typecheck, lint, 288 unit/integration tests, production build, format check and 15 Playwright E2E tests. A separate three-cycle live watch wrote four initial records, zero steady-state duplicates and zero rotated files. No production component was stopped to prove a transition; failure and recovery transitions are covered by deterministic fixtures.

The implementation commit passed [GitHub Actions CI run 36662097451](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/36662097451): Ubuntu job `109718876661` and Windows job `109718876394`. The docs-only final commit's exact CI run and job IDs are kept in the repo-external evidence to avoid a self-referential commit hash.

## Resolved live blocker

The first native Windows acceptance run failed `P7A-09-INSPECT` with normalized states `bridge=unavailable`, `fqgate=stopped`, `session=unknown`, `tunnel=running`. Both application ports had zero listeners. After the operator explicitly authorized a separate startup operation, the existing `fqgate start` command returned `ready`; Bridge was launched through `scripts/start-bridge.mjs`. Read-only checks then confirmed exactly one listener at each of `127.0.0.1:17281` and `127.0.0.1:17282`.

During the second acceptance run, `P7A-09-INSPECT` failed with `bridge=ready`, `fqgate=incompatible`, `session=connected`, `tunnel=running`. Read-only lifecycle status found the managed executable had changed from the previously qualified 1.0.4 to official FQGate 1.0.5, with `supported_unvalidated` compatibility and `process.state=not_running`, although a FQGate process still listened on 17281. The operator confirmed this was an FQGate-native update. The official 1.0.5 stable manifest identifies a 23,707,648-byte Windows x64 artifact, SHA-256 `2b9613dbf2d0f10b1672684f2e24ac8917d2d8d3fa9bd7fbbae04d57dd73d83c`; the managed file matched this size and hash. This is an observed current install, **not Bridge qualification**. Static validation and the managed qualification record were not widened.

The blocker was resolved by the separate FQGate 1.0.5 external-update qualification workflow. On the qualified 1.0.5 runtime, the same permanent Windows checkout passed the complete P7A-01 through P7A-13 chain, including live inspect/watch/journal, exact loopback listeners and unchanged remote surface. The acceptance run used the existing deployment; no production outage was manufactured.

The external bounded evidence file is `D:\code\research\fqgate-phase7a-acceptance-evidence.json`. The repeatable procedure is in `docs/operations/windows-phase-7-a-acceptance.md`.

The combined Phase 7-A + FQGate 1.0.5 branch commit `cf7153d2f366104d36a272fa39fd387edd7e6442` passed GitHub Actions CI run `36664597157` on Ubuntu and Windows after the full live acceptance. Phase 7-A is therefore closed.

Phase 7-B1 policy/dry-run planning is separately authorized. Phase 7-B2 recovery actuation and Phase 7-C notifications remain unauthorized.
