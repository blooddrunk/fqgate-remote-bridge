# Codex Goal Prompt — Phase 0 + Phase 1

Use the following prompt as the first implementation handoff for this repository.

```text
Work in the repository:
https://github.com/blooddrunk/fqgate-remote-bridge

Implement Phase 0 + Phase 1 completely: repository foundation plus safe local FQGate lifecycle management for Windows.

Before changing code, read these files in order and treat them as the project source of truth:
1. AGENTS.md
2. README.md
3. docs/architecture.md
4. docs/security.md
5. docs/upstream-contracts.md
6. docs/roadmap.md
7. docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md

The detailed task package in docs/tasks/phase-0-1-foundation-and-fqgate-lifecycle.md is the acceptance contract for this goal. Do not merely produce another plan: implement the code, tests, CI, CLI, Windows integration boundary, and completion documentation required by that file.

Important constraints:
- Phase 0 + Phase 1 only. Do not implement Fastify/Vue UI, QR login UI, market-data proxy, cloudflared, Cloudflare Tunnel/Access, notifications, MCP/WebSocket proxying, turtle-value-engine integration, or any other Phase 2+ feature.
- Keep the repository simple. Prefer a single Node.js 22+ TypeScript package with pnpm for this phase; do not introduce a monorepo unless an actual implementation requirement makes it necessary and you document why.
- FQGate remains local-first. Nothing in this goal should expose or listen on a public/LAN interface.
- Never implement trading/brokerage/order/cancel/fund-transfer behavior.
- Never vendor or commit the FQGate executable.
- Download FQGate only from its official upstream release source, stage it, verify exact size and SHA-256, validate the candidate with `--version`, apply explicit compatibility policy, and only then activate it.
- Preserve a known-good rollback path. Updates must be transactional and fail closed.
- Process control must target the bridge-managed FQGate executable and avoid killing unrelated same-name processes.
- Process-running state, HTTP health, network readiness, and market login/session state are different concepts and must remain distinguishable.
- Treat docs/upstream-contracts.md as an observed compatibility baseline, not an immutable protocol specification.

At the start of implementation, verify the current public FQGate stable manifest/release metadata. If current upstream behavior differs materially from the repository baseline, update docs/upstream-contracts.md and adapt behind the release/compatibility boundary rather than spreading upstream assumptions through the code.

Testing requirements:
- Normal CI must not require a real FQGate binary, Cloudflare credentials, or private resources.
- Use fixtures/fakes for manifest, download, process runner/control, and health cases.
- Add Windows CI where platform/path behavior matters.
- Cover integrity failures, candidate validation, compatibility gating, install/update idempotency, activation failure, rollback, process lifecycle, health normalization, malformed config, and redaction as specified by the task package.
- Do not fake real Windows acceptance. If your execution environment cannot perform the real target-host acceptance steps, implement everything testable, provide/script the acceptance procedure, and record Windows acceptance as pending in the completion report.

Required completion work:
- Run and fix all build/typecheck/lint/test checks.
- Add docs/status/phase-0-1-completion.md with implemented behavior, final CLI commands, test/CI results, Windows acceptance status, real install/process model, known limitations, upstream discoveries, and remaining Phase 2 work.
- Update docs/roadmap.md only for exit criteria that are genuinely satisfied.
- Update README/other docs where the implementation has made planning language stale.
- Keep the working tree clean and leave the repository in a coherent handoff state.

Use good engineering judgment inside the task-package boundaries. Resolve implementation details yourself rather than stopping for minor choices. If a requirement is impossible or unsafe because of verified upstream/Windows behavior, implement the safest viable behavior, document the evidence and limitation, and do not silently weaken the security/lifecycle invariants.

At the end, report:
1. what you implemented;
2. important design decisions;
3. tests/checks run and their results;
4. whether real Windows acceptance was executed;
5. any remaining blockers before Phase 0/1 can be considered closed;
6. the recommended next task, but do not implement Phase 2.
```
