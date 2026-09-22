# Codex goal — Phase 6-A Cloudflare read-only discovery and plan

Implement only `docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md`.
Read the repository source-of-truth documents in the order required by
`AGENTS.md`, preserve all Phase 0–5 behavior, and keep the work framework
independent. Use the permanent Windows tree when live verification is possible.

The only Cloudflare control-plane behavior allowed in this goal is fixed-base,
bounded GET-only discovery plus deterministic reconciliation/fingerprint. Do not
add mutation methods, token retrieval, Global API Key handling, generic REST
proxying, a Bridge route, a new market operation, or any Phase 6-B behavior.

If live credentials/evidence or exact-commit CI are unavailable, leave Phase 6-A
OPEN and record exact blockers, check IDs and the next executable command. Never
fabricate closure.
