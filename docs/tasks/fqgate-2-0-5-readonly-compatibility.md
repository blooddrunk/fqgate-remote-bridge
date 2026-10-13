# FQGate 2.0.5 read-only compatibility and recovery readiness

Authorized by the operator objective on 2026-10-13. Implement one version-specific
read-only adapter for the existing `market.instruments.lookup`, exactly local +
remote_machine. Preserve v1, all registry permissions and the v1 lifecycle range.
Do not install, restart FQGate/cloudflared, mutate Cloudflare, add recovery
actuators, notifications, automatic updates, arbitrary source selection or routes.
No Issues or planning-only PRs.

The actual Windows census found the canonical system version/health, source
inventory/account and instrument search GET contracts. The adapter must bind the
exact manually installed nine-file 2.0.5 payload, managed process and IPv4
listener; check exact system version and reviewed operation-scoped OpenAPI
fingerprint. Discover exactly one connected tonghuashun source and verify its
account is connected. Bind its ID, provider, instance number, worker PID and
restart counter; never use the default source. Recheck selection/account/version/
protocol/process/payload after querying and discard results on drift. This
observational guard cannot prove an undetectable disconnect/reconnect between
samples; it does not grant account mutation or full session-epoch guarantees.

GET `/v2/instruments/search?query=<six-digit-code>` carries only the server-chosen
instance header and a shared bounded request deadline. No retries or fallback.
64 KiB / 16 items; validate envelope, row count, data state and coverage. Exact
code matches map security market/code and name to the existing Bridge shape;
v2 instrumentId is `market:code`, an explicit canonical identity, not a v1 ths_code.
No account/session/source identifiers enter responses or logs.

The exact artifact/protocol observation qualifies only this read-only operation;
it does not mark the global lifecycle supported/validated or prove signature,
authenticated replay, installer safety or actual rollback. Real runtime remains
running throughout acceptance. Directory crash/rollback tests use inert fixtures.

Required verification: frozen install, typecheck/lint/unit/build/format/E2E,
v1 deterministic regressions, native permanent-Windows checks, existing local
6-case and remote 22-case matrices, per-gate external redacted evidence with UTC,
commit, command/exit/count/reason/path/hash, final Ubuntu/Windows CI. Failures and
NOT_EXECUTED are never PASS. A Bridge deployment/restart requires an explicit
operator boundary if the existing running process cannot consume the build.
