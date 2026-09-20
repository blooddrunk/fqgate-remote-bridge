# Codex Goal — Phase 5-C filtered machine OpenAPI + final remote closure

Execute `docs/tasks/phase-5-c-filtered-machine-openapi-and-remote-closure.md` against current `main`.

Start by reading the complete source-of-truth chain listed in that task. Treat the task package as the executable acceptance contract. Preserve every closed Phase 0–5-B security and behavior boundary.

The objective is narrow: generate a machine-facing OpenAPI document only from Bridge operation-registry entries explicitly allowed for `remote_machine`, then close Phase 5 with deterministic tests, permanent-Windows acceptance under `D:\code\research\fqgate-remote-bridge`, real Cloudflare service-token remote acceptance, and final Ubuntu/Windows CI. Do not add quote/history/bars or any second market operation in this goal.

The machine OpenAPI must be Bridge-owned and registry-derived, not a passthrough or path-filtered copy of FQGate runtime `/openapi.json`. At the current baseline it should document exactly the machine-authorized lookup plus the machine documentation route itself if that route is policy-registered for machine access. It must exclude upstream/internal schemas, raw FQGate routes, human/admin/session/update operations, secrets, runtime-only metadata, and compatibility fingerprints. Serialization and ordering must be deterministic and bounded.

Automation is mandatory wherever machine-verifiable. On the permanent Windows checkout run frozen install, typecheck, lint, tests, build, format check, browser E2E, existing CLI/loopback smoke, Phase 5-A local regression, Phase 5-B census/local regression, then the new Phase 5-C acceptance. Calculate acceptance totals from emitted machine records; do not hand-write check counts.

Reuse the existing machine Access application, hostname, AUD, service token, Tunnel and ingress evidence. Do not create or mutate Cloudflare resources; provisioning remains Phase 6. For real remote acceptance, the only normal operator action is entering the existing Client ID/Secret into hidden `Read-Host -AsSecureString` prompts. After that, automatically verify the filtered machine OpenAPI, successful approved lookup, malformed/oversized rejection, old-operation denials, QR/session/update/admin/openapi-refresh denial, raw/page/static denial, human/admin isolation, Bridge-only Tunnel ingress, and loopback-only listeners. Never live-call `updates.apply` or any financial-state-changing operation merely to prove denial.

If a market probe returns `LOGIN_REQUIRED`, report the exact check ID first, instruct the operator to use the existing local Bridge QR login at `http://127.0.0.1:17282/login`, then rerun the exact same acceptance command and resume automation. Do not ask for manual JSON inspection or saved credentials.

Create/update the Phase 5-C implementation handoff, Windows acceptance evidence, and all affected source-of-truth docs. Keep Phase 5-C and Phase 5 OPEN unless every acceptance criterion passes and the final exact commit has green Ubuntu + Windows GitHub Actions. Do not implement Phase 6 provisioning, supervisor/notifications, automatic updates, MCP/WebSocket, packaging, consumer integration, trading, brokerage control, or any other financial state mutation.
