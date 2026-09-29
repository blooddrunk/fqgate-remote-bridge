# Coding-agent goal — Phase 6-C live closure and credential retirement

Implement and close `docs/tasks/phase-6-c-live-closure-and-credential-retirement.md` in
`blooddrunk/fqgate-remote-bridge`.

Treat that task as the executable scope contract. Read AGENTS.md, the Phase 6 design, the closed
Phase 6-A/B1/B2 task + handoff files, the closed credential-custody task, and the Phase 4.5/5
acceptance records before changing anything.

Primary goal: close Phase 6 by proving that the real deployment is in sync and that normal runtime,
read-only planning and human/admin/machine acceptance have **zero dependency on B1/B2 Cloudflare
write credentials**. Keep the existing guarded B1/B2 apply paths available for explicit future
drift repair; do not broaden them and do not delete them merely to claim retirement.

Implementation requirements:

- Prefer a deterministic Windows closure-audit script + automated tests. Do not add a new Bridge
  HTTP credential-management surface.
- Audit only fixed, known credential names/locations. Never print or persist secret values.
- Prove B1 DNS-write, B2 Tunnel/Access-write and B2 scope-read credentials are transient-only and
  absent from normal runtime/config/Vault/service/startup/evidence dependencies.
- Keep the existing Cloudflare read credential and Phase 5-C machine acceptance credentials within
  their already-authorized acceptance boundary when still needed.
- Do not rotate/delete the cloudflared runtime Tunnel token; prove the service still uses the
  protected token-file path and no raw token appears in service arguments/config/evidence.
- Do not invent or guess a remote token ID. Remote revocation is optional and separately authorized
  only if an exact retained token identity already exists through an authorized source.
- Do not manufacture Cloudflare drift. The expected real production result is an all-in-sync,
  zero-write plan.
- Preserve FQGate `127.0.0.1:17281`, Bridge `127.0.0.1:17282`, existing caller-context
  authorization, machine OpenAPI/lookup boundaries, remote-admin confirmation controls and all
  Phase 0-6-B2 fail-closed rules.
- Automate every machine-verifiable step and emit bounded secret-free evidence.

Permanent-Windows acceptance must use only
`D:\code\research\fqgate-remote-bridge` and must not overwrite operator changes or create a
second checkout.

Run automatically, in order where practical:

1. frozen install + typecheck + lint + tests + build + format + Playwright;
2. pre-run Phase 6-C credential-dependency audit;
3. real Phase 6-A discovery/plan and assert every check is `in_sync`;
4. Phase 5-C real remote-machine matrix;
5. Phase 4.5 headed ordinary/admin browser matrix;
6. local Phase 5-A/B/C regressions;
7. exact loopback listener checks for 17281/17282;
8. post-run Phase 6-C audit and compare policy outcome with pre-run audit;
9. exact-final-commit Ubuntu and Windows CI.

Human intervention is allowed only for the existing headed Access login/MFA flow, exact
`LOGIN_REQUIRED` FQGate QR, renewal of an expired already-authorized read/acceptance credential,
or a separately authorized exact-token revocation. For every such case, print the exact reason,
steps, expected result, forbidden changes and exact resume command.

If any automated gate fails, do not paper over it with “evidence incomplete”. Preserve the bounded
failure, fix the code or script when the cause is in-repo, and rerun the necessary automated checks.
If the failure is external, state the exact external blocker and leave Phase 6-C open.

At completion:

- create/update `docs/status/phase-6-c-implementation-handoff.md` with exact commit, evidence,
  CI run/job IDs, plan fingerprint and credential-class conclusions;
- update roadmap/README/AGENTS/security/Phase 6 design consistently to mark Phase 6-C and Phase 6
  CLOSED;
- keep any post-Phase-6 work unauthorized unless it has a separate reviewed task;
- ensure the final PR description distinguishes automatically proven facts from any human-only
  authentication step.
