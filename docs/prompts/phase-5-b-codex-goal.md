# Codex Goal — Phase 5-B live contract census + first read-only market slice

Execute docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md
against the current main branch.

Start by reading README.md, AGENTS.md, docs/architecture.md, docs/security.md,
docs/upstream-contracts.md, docs/roadmap.md,
docs/plans/phase-5-remote-machine-read-only-api.md, the Phase 5-B task package,
and the Phase 5-A closure/Windows evidence. Preserve every closed Phase 0–5-A
security and behavior boundary.

Use the permanent Windows environment under D:\code\research as the live
FQGate contract authority. Do not guess market endpoint names from examples.
First automate a bounded live /openapi.json census plus explicitly
non-mutating semantic probes. Only after evidence is recorded, select and
implement at most two smallest useful read-only market operations. Prefer a
narrow symbol/instrument lookup and bounded realtime quote when the live
contract supports them; historical/intraday bars may replace one only when
their contract and hard result/range bounds are clearer. If no candidate is
safe enough, stop before privilege expansion and record the exact blocker.

For every selected operation use a fixed upstream method/path, typed and
strictly validated Bridge request, normalized bounded Bridge response, explicit
compatibility gate, bounded timeout/body/result sizes, and a Bridge-owned
operation ID/path. Never forward a caller-supplied path/method/URL or expose raw
upstream envelopes. The new operations must have allowedContexts exactly
local + remote_machine. Do not grant remote_machine any old QR/session/update/
admin/openapi.refresh operation, and do not grant the new market operations to
remote_human or remote_admin.

Automation is mandatory wherever machine-verifiable. In the permanent Windows
checkout run install --frozen-lockfile, typecheck, lint, tests, build,
format:check, E2E, existing CLI/loopback smoke, Phase 5-A regression acceptance,
the new Phase 5-B census, and local live probes. Then verify the final GitHub
Actions Ubuntu + Windows run. Reuse the existing Phase 5-A machine Access/Tunnel
instead of creating Cloudflare resources.

If real remote acceptance needs the existing service-token credentials, the
only permitted operator action is entering Client ID/Secret into hidden
Read-Host -AsSecureString prompts; after that, automate the whole remote matrix
and print only bounded PASS/FAIL/status/error/shape metadata. If a market probe
requires an authenticated FQGate session, detect LOGIN_REQUIRED first and give
the exact local QR-login steps from the task package; after the operator
completes that physical approval, resume automation. Never reduce a blocker to
vague wording such as "manual evidence missing".

Create/update the Phase 5-B implementation handoff and Windows acceptance
evidence, update source-of-truth docs in the same change, and keep Phase 5-B
OPEN unless all closure criteria in the task package pass. Do not implement
Phase 5-C generated machine OpenAPI, Cloudflare provisioning, WebSocket/MCP,
trading/account mutation, supervisor/notifications, automatic updates,
packaging, or turtle-value-engine integration in this goal.
