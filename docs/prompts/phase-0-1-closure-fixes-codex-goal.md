# Codex Goal Prompt — Phase 0 + Phase 1 Closure Fixes

```text
Work in the repository:
https://github.com/blooddrunk/fqgate-remote-bridge

Perform the Phase 0 + Phase 1 closure-fix task only. Do not start Phase 2.

Before changing code, read:
1. AGENTS.md
2. README.md
3. docs/architecture.md
4. docs/security.md
5. docs/upstream-contracts.md
6. docs/roadmap.md
7. docs/status/phase-0-1-completion.md
8. docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md
9. docs/tasks/phase-0-1-closure-fixes.md

Treat docs/tasks/phase-0-1-closure-fixes.md as the acceptance contract for this goal.

There are two required closure fixes:

A. Correct the FQGate HTTP health protocol boundary.
The current health fixtures/adapter treat /v1/market/health as a top-level health object, but current upstream tonghuasun-agent code treats normal FQGate HTTP responses as an envelope shaped like { code, message, data }, and its QA mocks health that way. Introduce a small explicit reusable envelope decoder, unwrap successful data before health normalization, fail closed on malformed/nonzero responses, update tests to canonical wire-format fixtures, and document the observed contract. Do not add a Phase 2 HTTP proxy/server.

B. Make Windows bootstrap/acceptance scripts invoke this repository's built CLI deterministically.
Do not rely on `pnpm exec fqgate-remote-bridge` resolving the current root package's own bin. Resolve the repository/package root from $PSScriptRoot and invoke the built CLI directly with Node (preferred) or another demonstrably deterministic method. Give a clear error if dist/cli/main.js has not been built. Preserve argument/config forwarding. Add safe Windows CI coverage proving the script can locate and execute the CLI, without activating a real FQGate binary in normal CI.

Constraints:
- No Fastify/Vue, QR login implementation, proxy, Cloudflare/cloudflared, Access, DNS, notifier, supervisor daemon, MCP/WebSocket remote support, turtle-value-engine integration, service installation, permanent Task Scheduler setup, or trading feature.
- Preserve loopback-only FQGate configuration.
- Preserve checksum/version/compatibility/update/rollback invariants from Phase 0/1.
- Update docs/upstream-contracts.md with the observed HTTP envelope contract.
- Run and fix typecheck, lint, tests, build, format check, and both-platform CI.

After code/CI are green, do not falsely claim real Windows acceptance if your execution environment did not use the intended real Windows host. Update docs/status/phase-0-1-completion.md to state the fix status accurately and leave the real-host acceptance pending if necessary.

If you can execute on the intended real Windows x64 host, run the acceptance procedure documented in docs/tasks/phase-0-1-closure-fixes.md and record the evidence. Only then mark Phase 0 and Phase 1 fully closed in docs/roadmap.md.

At the end report:
1. exact protocol fix made;
2. exact Windows-script invocation fix made;
3. tests/CI results;
4. whether real Windows acceptance was executed;
5. whether Phase 0/1 is fully closed or still waiting only on real-host acceptance;
6. remaining blockers, if any.
```
