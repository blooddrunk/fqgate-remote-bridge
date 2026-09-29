# Coding-agent goal — Phase 6-B2 bounded Tunnel/Access provisioning

Implement and close `docs/tasks/phase-6-b2-bounded-tunnel-access-provisioning.md` in
`blooddrunk/fqgate-remote-bridge`.

Start by reading AGENTS.md, the Phase 6 design, the closed Phase 6-A/B1 task + handoff, Phase
4/4.5/5 security/acceptance records, and the FQGate 1.0.4 closure. Treat the task file as the
executable scope contract.

Requirements:

- Preserve loopback-only FQGate `127.0.0.1:17281` and Bridge
  `127.0.0.1:17282`.
- Reuse B1 stale-plan/fingerprint/one-action transaction semantics. Do not create a second generic
  apply engine.
- Keep Phase 6-A transport GET-only. Add only typed fixed Cloudflare write calls needed for the
  exact authorized Tunnel ingress and Access application/policy mutations.
- Never add arbitrary method/path/resource execution, broad DNS mutation, Tunnel deletion/token
  rotation, Access app deletion, Bypass/Everyone widening, wildcard ingress, direct 17281 ingress,
  background reconciliation or Phase 6-C behavior.
- Human/admin/machine hostname, app, AUD and policy identity must remain distinct and fail closed
  on ambiguity.
- Automate verification first. Add fixture/contract tests that assert exact Cloudflare write
  counts, fixed endpoint families, stale-plan refusal, ambiguity refusal, unsafe widening refusal,
  cross-profile isolation, redaction, partial-failure behavior and one-action-per-invocation.
- Run all repository quality gates automatically.
- Use the permanent Windows checkout `D:\code\research\fqgate-remote-bridge`; do not create
  another checkout and do not discard operator changes.
- Real Windows acceptance must first run live read-only discovery/plan. If production is already
  in sync, do NOT manufacture drift. Prove zero-write no-op live and use deterministic fixtures or
  a genuinely isolated temporary canary only if it cannot affect production hostnames/policies.
- If natural supported drift exists, apply only one reviewed action at a time and automatically
  rediscover/prove its postcondition.
- After mutation/no-op verification, automatically rerun Phase 6-A live acceptance, Phase 5-C
  service-token matrix, Phase 4.5 ordinary/admin headed browser matrix, local Phase 5 regressions,
  listener checks and full repository gates.
- Human input is permitted only for hidden least-privilege B2 write-token entry, existing Access
  login/MFA, exact `LOGIN_REQUIRED` QR, or a truly non-automatable Cloudflare limitation. Any
  other manual boundary must emit `MANUAL_REQUIRED` with exact dashboard path, resource,
  field/value, reason, do-not-change boundary and exact resume command.
- Never close with vague language such as "evidence not fully recorded".
- Record a secret-free `docs/status/phase-6-b2-implementation-handoff.md` containing the exact
  final runtime commit, bounded test/live results, mutation count, plan fingerprints, CI run/job
  IDs and explicit remaining Phase 6-C boundary.
- Update roadmap/design/task status only when the evidence supports it.
- Push the implementation branch and open a PR. Do not merge if any required automated gate,
  permanent-Windows live regression or exact-final-commit Ubuntu/Windows CI is unresolved.

Definition of done: Phase 6-B2 is reproducible, bounded, fail-closed, ends the real deployment at
a deterministic no-op plan, preserves all remote identity/authorization boundaries, and has
complete machine-verifiable evidence with any unavoidable human steps precisely documented.
