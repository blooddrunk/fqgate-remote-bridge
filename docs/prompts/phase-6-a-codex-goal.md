# Codex goal — Phase 6-A Cloudflare read-only discovery and deterministic plan

Historical goal: **Phase 6-A closed** on implementation commit `9c6babb` after
permanent-Windows live acceptance and exact-commit Ubuntu/Windows CI. This
handoff remains the original implementation contract, not a new task.

Start from latest `main`. Read and obey README.md, AGENTS.md, docs/architecture.md,
docs/security.md, docs/upstream-contracts.md, docs/roadmap.md,
docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md,
docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md, latest Phase 5-C and
post-Phase-5 handoffs/runbooks, and docs/agent-guide.md.

Goal: add a framework-independent fixed-base **GET-only** Cloudflare control-plane client;
discover exact account/zone Tunnel/config, DNS, Access applications and policies used by the
existing human/admin/machine deployment; reconcile against explicit repo-external desired state;
emit canonical stable plan + SHA-256 fingerprint.

Hard boundary: **do not mutate Cloudflare**. Do not implement or call POST/PUT/PATCH/DELETE. Do
not create/update/delete Tunnel, DNS, Access apps or policies. Do not create/rotate tokens. Never
request a Global API Key. Do not build a generic Cloudflare REST proxy. Phase 6-B is separate.

Preserve: FQGate `127.0.0.1:17281` only; Bridge `127.0.0.1:17282` only; Tunnel origin only
`http://127.0.0.1:17282`; runtime OpenAPI never authorizes; human/admin/machine Access contexts
stay separate; remote_machine remains only existing lookup + machine OpenAPI; no trading or
financial state-changing API.

Treat duplicate/ambiguous resources, direct 17281 ingress, wrong origins, wildcard/broad ingress,
unexpected AUD mapping, Bypass/broad Access policy and other security drift as explicit
conflicts. Never select an arbitrary first match. Safe drift may produce future
`create`/`adopt`/`update` plan actions, but 6-A never applies them.

Secret handling is mandatory. Cloudflare token is runtime-only. CI uses fixtures. On permanent
Windows use `Read-Host -AsSecureString`, decrypt only briefly in memory, pass only via child
environment, clear in `finally`, and never put it in Git, JSON config, CLI args, logs,
stdout/stderr or evidence. Existing machine Client ID/Secret uses existing hidden prompts.

Automate every machine-verifiable check. Permanent environment is
`D:\code\research\fqgate-remote-bridge`; use that checkout, inspect git status, preserve
operator changes, never create a temporary checkout to dodge local issues. Use the existing
acceptance config. Before FQGate regression ensure Bridge was launched with that exact config,
including
`FQGATE_REMOTE_BRIDGE_CONFIG=D:\code\research\fqgate-acceptance-config.json`
for `scripts/start-bridge.mjs`.

Run frozen install, typecheck, lint, all tests, build, format check, Playwright E2E, Windows
CLI/loopback smoke, Cloudflare fixture/security/reconciliation tests, permanent-Windows live
`cloudflare discover|plan`, existing Phase 5-C local + real remote-machine regression, and final Ubuntu/Windows
GitHub Actions on the exact final commit. Write bounded redacted live evidence only to
`D:\code\research\fqgate-phase6a-discovery-evidence.json`.

Human intervention allowed only at named boundaries:

1. If no read token exists, instruct operator to create a least-privilege token scoped to exact
   account/zone with only read capabilities needed for Tunnel/config, DNS and Access app/policy
   reads; then collect only via hidden prompt.
2. For Phase 5-C remote matrix, existing machine Client ID/Secret only via hidden prompts.
3. Only if FQGate regression returns exact normalized `LOGIN_REQUIRED`, instruct operator to
   open `http://127.0.0.1:17282/login`, complete physical QR flow, then rerun exact same command.
4. If any other required property truly cannot be read automatically, do not write "manual
   evidence incomplete". Emit `MANUAL_REQUIRED` with exact Cloudflare Dashboard navigation,
   exact field, expected value, why API cannot prove it, and exact resume command.

Keep Phase 6-A OPEN if permanent-Windows evidence, exact-final-commit CI, or any required
manual/unsafe conflict remains. Safe unambiguous future drift may remain in the plan for Phase
6-B but must not be applied now.

Update all source-of-truth docs and implementation handoff with exact automatic check IDs/results,
plan fingerprint, evidence path, final commit and CI run IDs. Never claim closure from vague prose.
