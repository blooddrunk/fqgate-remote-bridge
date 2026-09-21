# Codex goal — qualify FQGate 1.0.2 and make patch releases evidence-compatible

Work in `blooddrunk/fqgate-remote-bridge` from current `main`.

Read and obey, in order: `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/upstream-contracts.md`, `docs/roadmap.md`, and `docs/tasks/post-phase-5-fqgate-release-compatibility-and-1-0-2-refresh.md`.

Goal: complete the active post-Phase-5 maintenance task. Qualify and upgrade the permanent Windows environment at `D:\code\research\fqgate-remote-bridge` from FQGate 1.0.1 to official stable 1.0.2, and refactor lookup compatibility so future patch releases do not require a literal hard-coded version match when the exact operation-scoped contract remains unchanged and the semantic probe passes.

Critical constraints:
- preserve all closed Phase 0-5 security behavior;
- keep FQGate 127.0.0.1:17281 and Bridge 127.0.0.1:17282 only;
- preserve Bridge-only Tunnel ingress;
- no generic/raw proxy, no new market operation, no trading/state mutation, no Cloudflare provisioning;
- keep fixed official manifest/source, exact package size/SHA-256, bounded download, stale-plan, concurrency, health, rollback and confirmation protections;
- do not weaken security controls just to accommodate frequent upstream releases;
- runtime OpenAPI is evidence, never authorization.

Official FQGate 1.0.2 Windows x64 evidence that must be independently re-read from the official stable manifest before use:
- file `FQGate-1.0.2-windows-x64-UNSIGNED.exe`
- size `23065088`
- SHA-256 `024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`

Implementation requirements:
1. Audit current code first, especially `src/fqgate/compatibility/policy.ts`, `src/fqgate/market/contract.ts`, `src/fqgate/market/lookup.ts`, release/update transaction code, and all Phase 5 acceptance harnesses.
2. Remove the literal `runtime.version !== "1.0.1"` style coupling from lookup. Replace it with explicit operation-scoped compatibility evidence: supported base runtime + approved lookup contract fingerprint/structural identity + successful bounded semantic probe + existing strict response decoder.
3. Keep changed contract fail-closed. Do not automatically bless a new fingerprint.
4. Make compatibility evidence deterministic and reviewable; do not store credentials, raw OpenAPI, raw market values or Access metadata.
5. Build or extend a bounded automated Windows qualification path that stages/activates/tests 1.0.2 and automatically rolls back to the known-good previous executable on failed health/OpenAPI/base-contract/lookup-contract/semantic checks.
6. If current lifecycle design blocks candidate qualification solely because 1.0.2 is not prelisted in `validatedVersions`, introduce a quarantined candidate-qualification boundary rather than pre-blessing 1.0.2 before evidence.
7. Use only the permanent Windows repo/environment under `D:\code\research`; do not substitute a temp checkout.
8. After successful qualification, leave 1.0.2 active and re-run the full local Phase 5-B/5-C regression plus real remote-machine service-token matrix.
9. Automate every machine-verifiable step. Never ask the operator to inspect JSON, copy a fingerprint, compare an OpenAPI document, inspect logs by eye, or manually decide whether compatibility is acceptable.
10. Human intervention is allowed only for:
   - existing service-token Client ID/Secret via hidden `Read-Host -AsSecureString` prompts; once entered, continue automatically;
   - physical FQGate QR approval only if a machine-readable check reports exact `LOGIN_REQUIRED`; provide the exact local URL/step and exact command to rerun.
11. Never expose or persist those secrets. Evidence files under `D:\code\research` must be bounded and non-secret.
12. Add deterministic tests for unchanged fingerprint on a new patch version, changed fingerprint denial, matching fingerprint + semantic failure denial, unsupported major denial, update hash/size failure, rollback path, unchanged Phase 5 context x operation matrix, raw/path denial and deterministic machine OpenAPI.
13. Run all repository quality gates and Windows acceptance. Require final Ubuntu + Windows GitHub Actions green on the exact final commit.
14. Update source-of-truth docs, task status and handoff evidence. Do not claim completion from prose alone: quote machine-counted totals/check IDs and the exact final commit/run IDs.

Do not move on to Phase 6 or add unrelated features. Finish with: exact code/docs changed, current active FQGate version and artifact identity, compatibility model before/after, automated validation results, any human-only steps actually needed, evidence paths, CI run IDs, and any genuine remaining blocker.