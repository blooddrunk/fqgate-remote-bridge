# Coding-agent goal — Phase 7-A supervisor observation and event journal

Implement and close
`docs/tasks/phase-7-a-supervisor-observation-and-event-journal.md` in
`blooddrunk/fqgate-remote-bridge`.

Treat the task package as the executable scope contract. Before changing code, read AGENTS.md,
docs/architecture.md, docs/security.md, docs/roadmap.md, the closed Phase 6-C task/handoff, the
current lifecycle/health/cloudflared service code, and the existing logger/redaction utilities.

Primary goal: add a deterministic **read-only** supervisor observer and bounded local event journal.
Do not implement recovery or notifications in this task.

Implementation constraints:

- Prefer a small `src/supervisor/` domain with injected observation adapters, pure state
  normalization/transition logic, fake clocks in tests, and a fixed-schema journal writer.
- Add a narrow local CLI for one-shot inspect and read-only watch. Do not add a new Bridge HTTP
  route and do not change any remote operation allowlist.
- Initial normalized components are Bridge, FQGate, session and cloudflared service only.
- Reuse existing typed health/lifecycle/service status logic; do not create a generic raw process,
  HTTP or Windows-service proxy.
- Journal only schema-allowlisted bounded metadata. Never persist raw payloads, JWT/assertions,
  cookies, QR/session data, credentials, Tunnel token contents, raw OpenAPI/market data, Cloudflare
  bodies, arbitrary exception stacks or environment dumps.
- Deduplicate unchanged steady state, bound record size, bound retention/rotation, reject path
  escape/reparse/symlink hazards as appropriate, and prevent concurrent watcher instances against
  the same state directory.
- Keep the watcher observation-only. There must be no restart/recovery adapter, no update action,
  no QR/login action, no Cloudflare apply, and no webhook/notification send.
- Preserve FQGate `127.0.0.1:17281`, Bridge `127.0.0.1:17282`, cloudflared -> Bridge only,
  current human/admin/machine authorization, remote-admin confirmation, and every closed
  Phase 0-6 safety boundary.
- Do not implement Windows service/Scheduled Task/autostart integration in 7-A.
- Do not implement Phase 7-B/7-C, automatic updates, MCP/WebSocket, packaging or
  turtle-value-engine integration.

Automation-first validation is mandatory.

On the permanent Windows environment, use only:

`D:\code\research\fqgate-remote-bridge`

Never create a second checkout and never overwrite operator changes.

Automatically run and record fixed check IDs for:

1. clean checkout;
2. frozen install;
3. typecheck;
4. lint;
5. unit/integration tests;
6. build;
7. format check;
8. Playwright E2E;
9. live one-shot supervisor inspect;
10. short bounded live watch proving journal write + steady-state deduplication without stopping
    production services;
11. journal schema/secret/size/rotation validation;
12. exact loopback listeners 17281/17282;
13. proof that Bridge remote operation/authorization surface did not change;
14. exact-final-commit Ubuntu and Windows GitHub Actions CI.

Use deterministic fixtures to prove failure -> recovery transitions. Do **not** stop FQGate,
Bridge, cloudflared or create production faults merely for acceptance.

Phase 7-A should require no human login. Treat FQGate `login_required` as an observed state, not
a reason to request QR. Do not require Cloudflare Access login/MFA and do not request B1/B2
provisioning credentials. If a truly unavoidable OS read permission blocks a check, print the exact
reason, exact command/location, required privilege, expected result, forbidden changes and exact
resume command. Otherwise fix the automation instead of delegating verification to the operator.

Do not write vague closure language such as “evidence incomplete”. A failed automated gate must
name the exact check, observed result and next action.

At completion:

- add a repeatable permanent-Windows runbook if needed;
- create `docs/status/phase-7-a-implementation-handoff.md` with exact commit, Windows evidence and
  CI run/job IDs;
- update roadmap/README/AGENTS/agent-guide/architecture/security only where the implementation
  changes their current source-of-truth state;
- mark 7-A CLOSED only after permanent-Windows acceptance and exact-final-commit dual-platform CI;
- keep Phase 7-B recovery and Phase 7-C notifications explicitly unauthorized.
