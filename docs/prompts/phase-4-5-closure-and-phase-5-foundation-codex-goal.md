Work in https://github.com/blooddrunk/fqgate-remote-bridge on the latest main. Read and obey AGENTS.md and all source-of-truth docs first, especially docs/tasks/phase-4-5-closure-and-phase-5-foundation.md and docs/operations/windows-phase-4-5-acceptance.md.

Your goal is NOT to rush into Phase 5. First establish a trustworthy green baseline and close Phase 4.5 correctly.

1. Verify the cross-platform CI regression fixed at/after commit 82fefffc92269f4a68cbf7689caacf417b6cb936. Run pnpm install --frozen-lockfile, typecheck, lint, test, build, format:check, and test:e2e, then inspect the actual GitHub Actions Ubuntu and Windows jobs. If Actions is red, read the failed job logs and fix the exact defect. Do not weaken production ACL/security logic merely to make tests pass.

2. Audit every remaining Phase 4.5 T1-T17 acceptance item. Automate every check that can be safely automated. Extend scripts/windows/phase45-acceptance.ps1 or add a bounded companion harness for the authenticated request matrix if this can be done without persisting/printing Access JWTs, cookies, confirmation grants, QR payloads, Tunnel tokens, or credentials. Output only PASS/FAIL, bounded HTTP/error codes, redacted labels, and timestamps.

3. Explicitly prove ordinary-human denial of updates.check/plan/apply and openapi.refresh; admin success for check/plan/openapi.refresh; wrong-app denial; unknown/raw route denial; confirmation missing/expired/replay/wrong-principal/operation-mismatch/plan-mismatch cases; and concurrent/double redemption with exactly one successful consumer. Use deterministic/non-side-effecting paths for negative tests. Do not trigger a real update while proving negative cases.

4. Reduce human work to genuine human-presence boundaries only. If operator login/MFA is required, write exact browser steps and expected result; never ask for JWT/cookie/OTP/token values. If a real remote-admin update is required for T13, first prove every safe prerequisite automatically, verify a known-safe candidate, then provide exact operator steps, expected success criteria, rollback behavior, and exactly what non-secret evidence to record.

5. Do not mark Phase 4.5 CLOSED until every T1-T17 item is actually evidenced, including one real authenticated remote-admin apply. Keep README/AGENTS/roadmap/security/architecture/agent-guide/status/operations docs consistent with the real state.

6. Only after Phase 4.5 is CLOSED may you begin Phase 5-A. The first Phase 5 checkpoint is identity/context foundation only: add a distinct remote_machine hostname/AUD/service identity, recognize it with fail-closed verification, but grant zero market-data operations at that checkpoint. Prove machine identity cannot inherit QR/session/update/OpenAPI-refresh/admin permissions and human/admin identities cannot become machine. Do not add broad market APIs yet.

Preserve the hard boundaries: FQGate 127.0.0.1:17281 only, Bridge 127.0.0.1:17282 only, cloudflared -> Bridge only, no catch-all FQGate proxy, upstream OpenAPI never authorizes routes, no Cloudflare provisioning in this work, no trading/order/cancel/fund-changing operations, and no secret material in logs/docs/tests.

At completion, report exact starting/final SHAs, GitHub Actions run IDs/results, test counts, the full T1-T17 evidence matrix, the exact manual actions the operator had to perform, any concrete non-automatable blockers, Phase 4.5 CLOSED/OPEN decision, and—only if CLOSED—the exact Phase 5-A next slice. Do not use vague phrases like “evidence incomplete”; for every non-automated item state the exact steps, expected result, and technical reason automation is unsafe or impossible.
