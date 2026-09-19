# Codex Goal — Phase 5-A remote-machine zero-privilege foundation

Work in `blooddrunk/fqgate-remote-bridge` from the latest `main`. Before
editing, read and obey `AGENTS.md`,
`docs/plans/phase-5-remote-machine-read-only-api.md`, and
`docs/tasks/phase-5-a-remote-machine-zero-privilege.md`. Treat the task
package as the executable acceptance contract.

Implement **Phase 5-A only**: add a distinct `remote_machine` request context
using a separate machine/API hostname, separate Cloudflare Access
application/AUD, and a service-token-specific Access JWT verifier. Preserve all
closed Phase 0-4.5 behavior and all loopback-only, deny-by-default, no-trading
security boundaries.

Do not reuse the administrator claim validator blindly. Cloudflare service-token
application JWTs have machine semantics: validate RS256, the fixed
team-domain-derived cert endpoint, exact issuer, exact machine AUD, temporal
claims, `type=app`, a bounded non-empty `common_name`, and the documented
empty-`sub` service-token shape. Return a minimal `kind: "machine"`
principal. Keep the existing human-admin non-empty-`sub` semantics unchanged.
Shared low-level JWK/signature code is fine; human and machine claim validation,
hostnames, audiences, config, principal kinds, and tests must remain separate.

The first checkpoint is deliberately **zero privilege**. Extend the policy model
to recognize `remote_machine`, but do not add it to the
`allowedContexts` of any existing Bridge operation and do not add any
market-data operation. Server-side tests must prove a valid machine identity is
denied for the complete current operation registry and cannot obtain
human/admin/session/update/OpenAPI-refresh privilege or bypass policy through
page/static/raw routes.

Prioritize automatic verification aggressively. The permanent Windows test
environment is under `D:\code\research`: resolve and use the existing Git
working tree there instead of creating a temporary acceptance checkout. Run all
deterministic quality gates, existing Windows CLI/loopback smoke checks, new
Phase 5-A checks, and the Ubuntu+Windows GitHub Actions matrix. Add a bounded
Phase 5-A Windows acceptance harness so machine-verifiable checks are automated.

Real Cloudflare service-token acceptance is required before closure. Cloudflare
resource provisioning itself remains manual because it belongs to Phase 6. If
the separate machine Access application/service token/Tunnel hostname do not
already exist, finish every automatic/local task first, then present the
operator with the exact numbered setup steps from the task package: separate
self-hosted app, Service Auth policy scoped to the service token, distinct AUD,
machine hostname, and Tunnel origin exactly
`http://127.0.0.1:17282`. Never ask the operator to paste a Client ID, Client
Secret, JWT, cookie, or Tunnel token into chat, logs, Git, command arguments, or
documentation.

The acceptance harness must support secret-safe interactive credential entry
(prefer `Read-Host -AsSecureString`, in-memory child-process environment, and
cleanup in `finally`) and then automatically prove: unauthenticated machine
requests are blocked/challenged; valid service credentials pass Access and
reach the Bridge; a safe existing operation is rejected with the Bridge's
operation-forbidden result, proving successful machine authentication plus zero
privilege; the token cannot gain human/admin privilege; raw FQGate paths remain
unreachable; and the machine Tunnel route targets Bridge port 17282 only. Do
not live-call `updates.apply` or another mutating operation merely to prove
denial.

Update source-of-truth docs and create a Phase 5-A implementation/acceptance
handoff with exact evidence. At the end report the baseline SHA, final SHA,
changed files, deterministic test counts, GitHub Actions run/job conclusions,
permanent Windows verification results, live service-token acceptance matrix,
and every manual operator action actually required. If a live item cannot be
completed, keep Phase 5-A OPEN and state the exact failed step/status/error and
the exact remaining manual action. Never use vague language such as “manual
evidence incomplete” or “verify Access configuration”.

Do not implement Phase 5-B market-data operations, generated machine OpenAPI,
Phase 6 Cloudflare provisioning automation, supervisor/notifications, automatic
updates, MCP/WebSocket, packaging, or any financial state-changing capability.
