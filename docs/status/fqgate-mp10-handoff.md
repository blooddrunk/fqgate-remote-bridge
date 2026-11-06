# MP-10 CI fidelity handoff

2026-11-06 Asia/Taipei. [Issue #37](https://github.com/blooddrunk/fqgate-remote-bridge/issues/37).
**REVIEW REQUIRED; LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.

## Change and accepted baseline

Initial `git status --short` was clean. Fetch/prune confirmed latest accepted
main `b33a44116be51b8306d908b01796eb9459bd9a7f` contains reviewed MP-9 PR #36,
following CI PR #35. No open PR was found. Work is isolated on
`codex/fqgate-mp10-ci`, `/home/jelinenaro/research/fqgate-mp10`; the original
Linux tree and permanent Windows c06fbcf were not switched or rebuilt.

MP-9 restored head-only checkout to bind exact-source evidence, unintentionally
reversing PR #35's integration testing. MP-10-A removes that override. The
pinned checkout now uses GitHub's synthetic `refs/pull/<n>/merge`. A CI-only
Node gate checks HEAD against event SHA and raw commit parents against the
exact event base/head, including shallow checkout. Missing/stale merge evidence
fails; no head fallback. Safe JSON reports source HEAD, base and tested merge
as separate fields. Main pushes still test their event SHA.

The new 30-case suite checks workflow policy and synthetic Git provenance:
head-only regression, missing provenance, lost Windows matrix/fixture calls,
conditional unit coverage, shallow merge success, wrong/stale metadata, unsafe
revision input and unchanged main-push semantics. It consumes no credentials,
HTTP or native runtime and adds no workflow or dependency. Pinned Actions,
read-only permissions, credential non-persistence, cancellation, timeouts,
Linux-only static/browser split, both-OS unit/build and Windows duties remain.
Windows checkout line endings are normalized for static policy inspection.

Only CI, its script/test and documentation change. Production source, routes,
registry, configuration, exact-version pins and admission import boundary remain
byte-identical to accepted main. No 2.0.6/2.0.7 activation.

## Validation and evidence custody

| Local check                                                     | Result                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                                                  | PASS, exit 0, Corepack pnpm 11.23.0                                                                                                                           |
| Typecheck / lint                                                | PASS, exit 0 after retained test typing/lint corrections                                                                                                      |
| Full unit                                                       | PASS, 1099 tests / 41 files; includes 30 new CI cases                                                                                                         |
| Import / permission coverage                                    | Audit PASS, zero production prototype/diagnostic/admission imports; existing authorization regressions execute in full unit                                   |
| Isolated CLI / external SSR build                               | PASS, exit 0; no permanent outputs touched                                                                                                                    |
| Linux Chromium E2E                                              | PASS, 19 cases, test-only 127.0.0.1:17283                                                                                                                     |
| Format / final source checks                                    | Exact final results bound in external receipt                                                                                                                 |
| Hosted Ubuntu / Windows merge-candidate CI                      | Required: final source/base/tested merge, run/jobs/steps, counts and log hashes bound in external receipt and PR checks; no earlier head-only run substitutes |
| Local native Windows fixtures                                   | NOT_EXECUTED here; existing suites run on hosted Windows and require actual child markers                                                                     |
| Windows browser E2E                                             | SKIPPED / NOT_EXECUTED, unchanged CI policy                                                                                                                   |
| Optional standalone exact-head hosted CI                        | NOT_EXECUTED; distinct from required hosted merge-candidate validation                                                                                        |
| Real host / local or remote authenticated / account experiments | NOT_EXECUTED; no live qualification                                                                                                                           |

External custody:
`/home/jelinenaro/research/fqgate-mp10-evidence-20261106`.
`delivery-receipt.json` binds final source HEAD/tree, accepted base, actual PR
merge SHA/parents, command source inventories, argv/cwd, UTC, duration/exits,
case counts, tool versions, log hashes, failures/skips, CI run/job/step evidence
and sampled protected-file before/after comparisons. Final revision/CI evidence
is external to avoid a self-referential commit. The PR names the final source
SHA and tested merge separately. CI_NOT_VERIFIED applies unless both hosted
jobs and required markers pass at that actual candidate.

Initial pnpm launcher attempts could not execute installation/tests; corrected
with the existing Corepack launcher, without deleting package-manager stores.
Initial test tuple typing and regex lint errors are retained with later passing
runs. No failed attempt is replaced with a passing log. Local tools: Node
24.19.0, pnpm 11.23.0, Git 2.53.0, TypeScript 5.9.3, Vitest 3.2.7,
Playwright 1.63.0 and Prettier 3.9.6. Hosted workflow uses Node 22.

Protected inventories cover existing Windows outputs/candidate/private inputs
(591 entries) plus fixed native/manifest/record entries (10). Browser/credential
contents are excluded. The final receipt reports comparison rather than a
machine-wide no-write guarantee. Historical host listener findings are not
fresh observations in MP-10.

## Limits and next decision

Stop at the focused reviewable PR for independent review. Issue closure is not
claimed before that review. Hosted success proves integration with the recorded
base at the tested merge SHA; it is not exact-source-head execution, native
host acceptance, rollback or account isolation. Revalidate a new merge candidate
if the PR head or base advances; never reuse the old green run as current proof.
Cancellation/resource policy is inspected, not a live supersession experiment.

[MP-10-B decision memo](../plans/fqgate-mp10-host-decision.md) keeps HOST_BLOCKED.
No native version/installer or compatible running Bridge build is selected.
Strong native account identity/epoch and full rollback remain unproven. The
MP-6 three decision sheets remain drafts. Next milestone is independent MP-10-A
review, then a separate exact-version prerequisite decision; no human action
is needed to complete offline/hosted CI review.

NOT_EXECUTED: native/service start/stop/repair, installation, deployment,
Cloudflare, live account/QR/phone/MFA/Saved Login/L2/two-account acceptance,
upstream inquiry send, merge/tag/release. Each future host/account action needs
separate concrete authorization, prerequisites, expected observations, STOP
and rollback limits. Fixtures and CI cannot grant those authorities.
