# Phase 7-B1 implementation handoff

Status: **implementation in progress; closure not yet claimed**.

The branch starts from FQGate 1.0.5 qualification commit `60ac0f64db2ce44f7629495e1a95af01a104c4d0`, which contains the Phase 7-A closure and the authorized B1 task. The B1 implementation adds a pure versioned recovery policy, fixed candidate action identifiers, bounded config, repo-external history and local-only `supervisor recovery-plan` command. Restart actions remain identifiers only. Existing Bridge routes and remote permissions are unchanged.

The policy defaults to three consecutive failures, five-minute cooldown, two attempts and a ten-minute healthy reset. Config validation accepts only bounded fields. Corrupt history, unresolved transaction, incompatible FQGate, login-required, missing tunnel, unknown state and ambiguous identity do not yield eligibility. The CLI currently cannot prove Bridge or tunnel identity and therefore forbids their restart eligibility. Phase 7-B2 must review identity proof and actuation separately.

Deterministic tests cover healthy, suppressed, eligible, exhausted and forbidden decisions, fake-clock thresholds/reset, history bounds/path safety, CLI option rejection and no actuator calls. The permanent-Windows gate is `scripts/windows/phase7b1-acceptance.ps1`; its procedure is `docs/operations/windows-phase-7-b1-acceptance.md`.

Closure evidence pending:

- exact implementation commit;
- permanent-Windows P7B1-01..P7B1-15 results and external evidence path;
- exact-final-commit Ubuntu and Windows CI run/job IDs.

Phase 7-B2 actuation/startup integration and Phase 7-C notifications remain unauthorized.
