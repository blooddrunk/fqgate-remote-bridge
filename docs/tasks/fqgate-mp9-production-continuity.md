# MP-9 — production exact-2.0.5 observable continuity repair

Authorized by [Issue #34](https://github.com/blooddrunk/fqgate-remote-bridge/issues/34),
after reviewed MP-8 PR #33 merged at `7413604e7a055c493c7b006e898fe8c6e59c05c2`.
Baseline: newest accepted main `ec3b0bf4c820a7a469bb22c073ea1d5288e58023`
(includes CI PR #35). This separate security task supersedes MP-8's prohibition
on repairing production account-display continuity; it grants no other authority.

## Contract

Repair only the existing `src/fqgate/market/v2.ts` exact-2.0.5 lookup. Reproduce
the defect first with an ordinary failing regression; retain source/test hashes,
UTC, argv, exit and log externally. Convert the expected failure and retire the
permissive characterization. Use the reviewed native account schema, never the
MP-8 synthetic Source lifetime/identity model. See the
[design and field policy](../plans/fqgate-mp9-production-continuity.md).

Require one connected Source, bounded inventory, all peer Source/worker and
sanitized account continuity, unchanged process/version/OpenAPI and one total
5000 ms deadline including identity, HTTP, parsing and final fences. No retries,
partial results or sensitive errors. Preserve v1, exact pins, QR/status,
permissions and production import boundaries. Never activate admission candidates
or preserved 2.0.6/2.0.7 code.

## Acceptance and stop

Run frozen install, typecheck, lint, full unit, import/permission audit, isolated
CLI/SSR builds, formatting, Linux Chromium E2E, native Windows inert suites
(MP-2..8, state-0, QR/no-approval and Vault fake) and exact-head Ubuntu/Windows CI.
Inspect actual test markers and child statuses. Windows browser E2E is SKIPPED.
Keep commands, source inventories, tool versions, UTC, exit/duration/counts,
original failures and protected-file comparisons outside Git. Use PASS, FAIL,
BLOCKED, SKIPPED and NOT_EXECUTED separately.

Preserve permanent Windows c06fbcf, dist/.output, private configurations and
artifacts. No service/native start/stop, repair/deploy, Cloudflare mutation,
credential access, account/QR/SMS/MFA/Saved Login/L2/two-account action or upstream
inquiry send. Real host/local/remote acceptance is NOT_EXECUTED here. MP-6 decision
sheets remain drafts. Deliver one focused PR and stop for independent review;
no merge, tag, release or deployment.

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
