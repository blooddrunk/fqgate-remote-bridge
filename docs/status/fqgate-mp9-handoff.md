# MP-9 production observable-continuity security handoff

2026-11-06 Asia/Taipei. [Issue #34](https://github.com/blooddrunk/fqgate-remote-bridge/issues/34).
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.

## Delivered repair

Initial working tree was clean. Fetch/prune verified MP-8 PR #33 merge
`7413604e7a055c493c7b006e898fe8c6e59c05c2` is an ancestor of latest accepted main
`ec3b0bf4c820a7a469bb22c073ea1d5288e58023` (also contains CI PR #35).
Open PR inspection returned none. New isolated branch/worktree:
`codex/fqgate-mp9-continuity`, `/home/jelinenaro/research/fqgate-mp9`.
Original Linux tree and Windows c06fbcf were not switched or rewritten.

Production changes are limited to `src/fqgate/market/v2.ts`:

- Compare bounded reviewed account descriptor, visible account/session, Saved
  Login and L2 snapshots across lookup, including **all** peers. Enforce state
  agreement, unique Source/worker/ordinal evidence, and exactly one connected
  Source. Unknown/sensitive account fields and unusable evidence deny.
- Include Source/worker/provider/ordinal/restarts and autoLogin/defaultGuest in
  continuity. Freshness validates observed_at without making it an identity key.
  No synthetic native lifetime, trusted display identity or login epoch is added.
- Bound both process identity calls, HTTP, parsing and final checks by one total
  5000 ms deadline. Reject late completion and suppress subsequent work/results;
  normalize identity errors. No retry or partial publication; explicit partial
  coverage now denies. Keep strict four-field instrument projection.

The former `it.fails` is now an ordinary passing negative; the permissive
characterization is retired. Tests cover malformed/nullable/unreviewed fields,
peer changes, duplicate identities, account/worker races, 503 at every GET stage,
UTF-8/size/protocol errors, identity/HTTP late completion, decoding/fingerprint
budget and unchanged happy paths/permissions. CI checkout is explicitly the PR
head (`github.event.pull_request.head.sha`) to meet exact-source verification.
All other runtime/config/route/registry/QR/status/native identity modules and
compatibility pins remain byte-identical to accepted main; the production-import
audit still forbids MP-8 reachability. No 2.0.6/2.0.7 code is activated.

[Design, exact field policy and limits](../plans/fqgate-mp9-production-continuity.md).
[Task](../tasks/fqgate-mp9-production-continuity.md).
[Reproduction, repeat and excluded future approvals](../operations/fqgate-mp9-offline-validation.md).

## Reproduction and measured validation

Initial ordinary P0 assertion: **2026-11-06T12:01:19.182100Z**, accepted baseline
production bytes, exit **1**, one failed / 60 filtered cases. Production returned
one instrument despite account_display changing. External `p0-red-assertion.log`
SHA-256 `8a83ba77debc2a5729a60610d59b60656cc00a3b9ebf565a3e06df0360a819ef`.
The final regression expects FQGATE_INCOMPATIBLE, one search and no published
result; no expected failure remains in the production lookup suite.

| Check                                                        | Measured result                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                                               | PASS, exit 0, pnpm 11.23.0                                                                                                      |
| Targeted production lookup                                   | 131 passing cases in the expanded full run                                                                                      |
| Full unit                                                    | PASS, exit 0, 1069 tests / 40 files, including v1/QR/status/permission regressions                                              |
| Typecheck / lint                                             | PASS, exit 0 after recorded setup/lint corrections                                                                              |
| Production import audit                                      | PASS; 0 production imports of MP-8/profiles/diagnostics                                                                         |
| CLI / external SSR build                                     | PASS, exit 0; permanent outputs untouched                                                                                       |
| Linux Chromium E2E                                           | PASS, exit 0, 19 tests, isolated port 17283                                                                                     |
| Formatting                                                   | PASS, exit 0                                                                                                                    |
| Native Windows inert v2 observation                          | PASS, exit 0, 40 cases                                                                                                          |
| Native Windows QR preflight / inline identity / no-approval  | PASS, exits 0, 28 + 5 + 1 cases                                                                                                 |
| Native Windows MP-2 / MP-3 / MP-4/5 / MP-6                   | PASS, exits 0, 14 / 14 / 12 / 11 cases; state-0 stays UNKNOWN                                                                   |
| Native Windows MP-8 compiled fixtures                        | PASS, exit 0, 17 cases; productionAllowed=false                                                                                 |
| Native Windows Vault fake store                              | PASS; no real credential read/write                                                                                             |
| Exact-final-head Ubuntu / Windows CI                         | Required; actual source SHA, run/job/step results, checkout logs and test markers bound in external final receipt and PR checks |
| Windows browser E2E                                          | SKIPPED / NOT_EXECUTED, unchanged CI policy                                                                                     |
| Native host / real-local / real-remote / account experiments | NOT_EXECUTED / HOST_NOT_EXECUTED; no live qualification                                                                         |

All Windows children are checked for actual summary markers as well as exit.
Local native fixtures used Node 24.22.1, Windows PowerShell 5.1.26100.9818 and
Git 2.55.0.windows.5; Linux used Node 24.19.0, TypeScript 5.9.3, Vitest 3.2.7,
Playwright 1.63.0 and Prettier 3.9.6. Hosted CI uses Node 22.

Early missing Python/Node PATH and nested-pnpm setup failures, the deliberate
red assertion, the first expanded fixture failures and one test type lint error
remain in external logs/failure ledger. The missing-launcher attempts are
NOT_EXECUTED, not passing tests. No failed attempt is replaced by a later log.

## Evidence custody and protected files

External Linux evidence:
`/home/jelinenaro/research/fqgate-mp9-evidence-20261106`.
Native inert staging:
`D:\code\research\fqgate-mp9-evidence-20261106\validation`.
`delivery-receipt.json` binds exact final HEAD/tree, commands/argv/cwd, source
inventories, UTC/duration/exit, tools, test counts, log/runner SHA-256, CI links
and before/after protected-file comparisons. Final SHA/CI are external to avoid
self-referential commits; PR description also names the exact final SHA.
Do not replace those with an earlier green source head.

Before/after inventories cover 591 existing Windows output/config/candidate
entries plus 10 fixed native/manifest/record entries, excluding private browser
contents and credential values. Permanent Windows remains clean on
`codex/fqgate206-compatibility` at `c06fbcff1db11179bdad95ab83c90e888aa62587`.
Comparisons prove sampled file continuity, not a machine-wide no-write trace.
The separate observer returned 10 GETs, 2.0.7 application/agent, legacy 1.0.5,
UNCHANGED_UNAUTHENTICATED; it grants no publisher/compatibility/install authority.

## Remaining limits and next milestone

This contains **observable** drift. Same-display A→B→A, hidden Source recreation
with identical visible fields and changes between sequential samples remain
undetectable. No stable native account ID or monotonic login/session epoch is
proven. Source/worker counters and observation timestamps cannot substitute for
those guarantees. Saved Login/L2 namespace isolation, live host/worker ownership,
real-local/remote acceptance, publisher trust and native rollback remain unqualified.
Historical absent listeners are not a fresh host observation under this task.

Stop at one reviewable PR for independent security review. No merge/tag/release,
deploy, native/service start/stop/repair, Cloudflare, credential/account/QR/SMS/
MFA/Saved Login/L2 action or upstream inquiry send occurred. No human action is
required to finish offline review. The MP-6 decision sheets remain drafts.

Next: independently review this repair and its limits. Separately select and
review an exact host version/artifact/build before authorizing restoration and
GET-only census. Strong native identity/epoch evidence is a separate prerequisite
to any future multi-account integration; do not treat this repair or CI as that
qualification. Precise future authorization, STOP, recovery and provider rollback
limits are in the operations document; no such action is approved by this PR.
