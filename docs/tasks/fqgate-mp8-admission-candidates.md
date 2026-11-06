# MP-8 — exact-version operation candidates

Authorized by [Issue #32](https://github.com/blooddrunk/fqgate-remote-bridge/issues/32)
after reviewed PR #31 merged at `2410e86334f9c498cd5a1023f06153e48407629b`.
Use a fresh isolated worktree; preserve permanent Windows c06fbcf and outputs.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / PROD_NO_GO**.

## Design before implementation

`src/fqgate/admission/` is an isolated research domain, unreachable from any
production module, configuration, route or operation registry. Its typed ledger
models only `market.instruments.lookup`, Windows x64, exact package/EXE/tree/client
hashes, five fixed GET contracts with transitive schema fingerprint, parser/probe
revisions, Source lifetime, native process/listener and evidence provenance.
Unknown/incomplete entries deny before query. No semver/latest/fallback authority.

Real-byte entries are review records and can never issue an execution permit.
The only executable path is an explicitly synthetic fixture harness with injected
ports; its success is OFFLINE_TESTED, always runtimeQualified=false and
productionAllowed=false. It has no HTTP/native/config implementation. Synthetic
lifetime counters test detectable Source ABA; no existing native Source lifetime
or monotonic login epoch is asserted. Missing native lifetime evidence denies.

One absolute 5000 ms deadline includes identity, protocol, inventory/account and
query work plus final fences. Abort on deadline; no retry or partial data. Every
await checks the remaining deadline. Snapshot full inventory, exact worker/process
creation and Source lifetime before dispatch and after result; compare all peers
and visible account state excluding observation time. Require one connected Source,
unique IDs/worker PIDs, ready selected worker, exact native listener state and
seven-digit creation precision. Reject unknown/sensitive fields and malformed
envelopes. Strict output projection retains only the four public instrument fields.

Display/hash, observed_at, worker lifetime and legacy session_epoch cannot prove
native account identity or a monotonic login epoch. Same-display account swaps and
hidden ABA without trusted native lifetime remain blind spots. The production
2.0.5 drift gap is reproduced first and left as an explicit expected-failure
regression; any production repair needs a separate security PR and authorization.

## Acceptance / stop boundary

Run frozen install, targeted negative/race/leak tests, full unit, typecheck, lint,
isolated CLI/SSR build, format, production-import/permission audit, Linux Chromium,
Windows inert fixtures (MP-6/7 included) and exact-final-head Ubuntu/Windows CI.
Keep exact command/UTC/cwd/exit/duration/source/tool/log hashes and protected
inventories outside Git; retain initial failures. Windows browser E2E stays SKIPPED.
Deliver code, version/operation/evidence matrix, operations and handoff, one PR;
stop for independent review, never merge/tag/release/deploy.

Re-run MP-7 GET-only release observer; a newer version only requests review.
Review preserved 2.0.6 objects/diffs read-only; preserve main MP-6 state-0 UNKNOWN,
listener authority and timestamp precision. No whole-branch replay or deletion.

Native host ownership/build/backup/rollback not established => HOST_BLOCKED /
NOT_EXECUTED; finish offline work. No native start/stop, service, repair, Cloudflare,
account/QR/phone/MFA/Saved Login/L2/second-account action or upstream inquiry send.
Existing MP-6 decision sheets remain drafts requiring separate authorization.
