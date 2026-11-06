# MP-8 engineering handoff — independent review boundary

2026-11-06 Asia/Taipei. [Issue #32](https://github.com/blooddrunk/fqgate-remote-bridge/issues/32).
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.

## Baseline and delivered code

First status was clean; fetch/prune advanced origin/main to accepted
`2410e86334f9c498cd5a1023f06153e48407629b`. PR #31 merged, open PR query empty.
Created isolated `codex/fqgate-mp8-admission` worktree at
`/home/jelinenaro/research/fqgate-mp8`. Original Linux working tree and permanent
Windows `codex/fqgate206-compatibility` at c06fbcf were not switched or rewritten.

`src/fqgate/admission/registry.ts` holds typed exact-version × lookup review
profiles. It binds Windows x64 package/EXE/tree/client and selected transitive
OpenAPI fingerprint, parser/probe revisions, identity policy and evidence origin.
Real-byte entries always deny; unknown operation/version/range/latest cannot query.
No production admission state or native/HTTP/config adapter exists. Synthetic
matching produces only OFFLINE_CANDIDATE, with productionAllowed/runtimeQualified
both false. Production imports/re-exports/type imports are statically audited.

`lookup.ts` exercises the synthetic candidate with one absolute 5000 ms deadline
including identity and final fences, abort signals, no retry and no partial data.
It checks strict result envelopes and unexpected sensitive fields, pre/post
version/OpenAPI, precise process/listener/worker evidence, synthetic Source
lifetime, all peer snapshots and visible account drift. Deadline/late completion,
503, malformed UTF-8/envelopes, duplicates and known races discard the result.
Native listener state 0 stays UNKNOWN/denied; rounded creation cannot qualify.

P0 was reproduced with an actual failing negative assertion: production 2.0.5
returned instrument data after account_display changed. Its source is untouched;
the explicit expected-failure test records an unresolved production security gap.
The isolated candidate rejects it. A production fix must be a **separate security
PR**, including review of account parsing, peer/lifetime limits and deadline scope;
MP-8 does not silently activate it. Display/hash, observed_at, worker incarnation
and legacy session_epoch are not trusted native account identity/login epoch.
Identical-display swaps and hidden unsampled ABA remain unqualified.

[Complete version/operation/evidence and 2.0.6 reconciliation matrix](../plans/fqgate-mp8-admission-matrix.md).
[Repeat and excluded operator actions](../operations/fqgate-mp8-offline-acceptance.md).

## Validation and evidence custody

External Linux custody:
`/home/jelinenaro/research/fqgate-mp8-evidence-20261106`.
External native inert inputs/receipts:
`D:\code\research\fqgate-mp8-evidence-20261106`.
Every runner receipt binds command/argv, UTC, cwd, baseline/source SHA, source-file
inventory, exit, duration and log/runner SHA-256. Tool versions/hashes, Windows
staging manifest, original failed commands and protected inventories are external.
Final exact PR head, source tree, CI run/jobs/step statuses and final comparisons
belong in `delivery-receipt.json`, avoiding a self-referential committed SHA.

| Check                                                       | Measured result                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                                              | exit 0; pinned pnpm 11.23.0                                                                                                                    |
| P0 ordinary negative reproduction                           | **exit 1**: expected rejection but production returned one instrument; retained log                                                            |
| Targeted initial candidate + production lookup regression   | 164 assertions passed, including one explicitly expected production failure; later version-negative additions are included in final full count |
| Full unit                                                   | Final full run 999 assertions / 40 files passed, including one explicitly expected production failure; 120 MP-8 candidate cases                |
| Typecheck / lint / import audit                             | Passing corrected runs; earlier failures retained separately                                                                                   |
| Audit negative self-check                                   | production re-export, type import and computed dynamic import all rejected                                                                     |
| Existing production source/config preservation              | 140 files byte-identical to accepted main; no operation, route, gate, range or permission edits                                                |
| Isolated CLI / external SSR build                           | exit 0; permanent dist/.output not targeted                                                                                                    |
| Linux Chromium E2E                                          | 19 passed / exit 0; isolated Linux 17283 only                                                                                                  |
| Native Windows v2 observation                               | 40 inert behavior cases / exit 0                                                                                                               |
| Native Windows QR preflight / inline identity / no-approval | 28/28, 5/5 and 1/1 / exit 0; no live QR                                                                                                        |
| Native Windows MP-2 / MP-3 / MP-4/5 / MP-6                  | 14/14, 14/14, 12/12 and 11/11 / exit 0                                                                                                         |
| Native Windows MP-8 compiled fixtures                       | 17/17 / exit 0, no real native host or HTTP effects                                                                                            |
| Native Windows Vault fake store                             | passed; local real Vault-write smoke NOT_EXECUTED                                                                                              |
| Windows browser E2E                                         | **SKIPPED / NOT_EXECUTED**, existing CI policy                                                                                                 |
| Final format / exact-head Ubuntu + Windows CI               | Required final evidence bound externally and in PR checks; never substitute an earlier green head                                              |

Early launcher/setup/TypeScript/lint/audit failures remain in `failure-ledger.json`
and original logs. In particular, a missing Windows -File invocation returned
process exit 0 without running any suite; it is classified TOOLING_FAILURE /
NOT_EXECUTED, never PASS. The corrected invocation records each child UTC/exit/
duration and required case markers. No record was deleted to obtain green checks.

## Real host and protected artifacts

Fresh standalone MP-6 metadata collector at 2026-11-06T03:32Z returned
tcpStatus=OBSERVED, zero TCP rows at 17281/17282, runningArtifact=UNKNOWN.
Metadata collection exit 0 is not readiness. **HOST_BLOCKED / semantic census
NOT_EXECUTED**: no native PID/listener/build/version/backup/rollback baseline
exists for MP-8. No process/service start/stop, repair, status-cleanup path,
deployment, account or remote acceptance was attempted. Native 2.0.6 installation
and c06fbcf remain historical/preserved evidence, not a current running build.

Before/after inventories cover 591 existing output/config/candidate files plus
10 fixed native/manifest/record entries, outside Git. Final exact comparison and
digests are external. The Windows branch remains c06fbcf; private account/QR/
credential/browser data is not published. Inventories establish sampled file
continuity only, not a machine-wide no-write trace or reproducible running build.

MP-7 observer rerun: 10 GETs, 2.0.7 application/agent latest, legacy 1.0.5,
UNCHANGED_UNAUTHENTICATED; no release pin/permission auto-update. Preserved 2.0.6
objects/diffs were reviewed, not applied. Its listener authority, precision, QR
version binding, selected-source status and method-denial fixes remain preserved.

## Independent review and next decision

Stop with one focused PR for review. No merge/tag/release/deploy, Cloudflare or
runtime actuation. Recommended next review: audit the isolated candidate and
expected-failure boundary; then separately scope the production 2.0.5 security
patch. Host restoration/census, publisher identity/epoch inquiry sending and
account/QR/SMS/MFA/Saved Login/L2/two-account experiments each need separate fresh
authorization with exact commands, STOP/recovery and provider rollback limits.
No human action is required to finish this offline delivery. CI/fixtures do not
qualify native runtime, trusted publisher, account epoch or multi-account isolation.
