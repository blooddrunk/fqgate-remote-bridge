# MP-6 host prerequisite and contract handoff

2026-11-06 Asia/Taipei. [Issue #28](https://github.com/blooddrunk/fqgate-remote-bridge/issues/28).
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; production multi-account **NO-GO**.

## Engineering outcome

MP-6 adds a standalone bounded, redacted Windows metadata collector and 11 native
negative/selection/redaction fixtures. TCP, process, service, task and fixed
environment-presence observations remain independent; state 0 stays UNKNOWN.
Candidates and metadata-command exit 0 never become running-build/readiness
proof. It neither imports production services nor executes a lifecycle action.

A four-case deterministic reproduction showed MP-5 could classify a rounded
3–6-digit creation time as OBSERVED when its zero padding equaled the native
seven-digit time. The standalone classifier now returns STALE for insufficient
precision on either side, including this collision; exact seven-digit zero-tail
timestamps remain valid. The fix is not deployed into permanent `dist`.
Existing adapters, lifecycle, permissions, Cloudflare and MP-1 composition are
unchanged. The [production import audit](../../scripts/audit-profile-prototype.mjs)
continues to forbid diagnostic/prototype reachability from runtime.

Read [task](../tasks/fqgate-2-0-5-mp6-host-prerequisites.md),
[operations / three independent decision sheets](../operations/windows-fqgate205-mp6.md)
and [upstream inquiry draft, NOT SENT](../plans/fqgate205-mp6-upstream-inquiry-draft.md).
The inquiry asks for native identity/epoch, Source persistence, Saved Login/L2
and complete storage/IPC/port contracts. Stage B remains **NOT_EXECUTED**.

## Synchronization and evidence custody

Linux status was clean. `git fetch origin --prune` verified merged MP-5 PR #27
at `97aea57884f1cb0dc8772506cb130f0aa6a1872b`; main fast-forwarded safely and
`codex/fqgate205-mp6-readonly-host-plan` branched from it. No open PR was found
at initial inspection. No reset/clean/force-push occurred.

The accessible WORK-PC permanent checkout is clean on the **preserved** later
branch `codex/fqgate206-compatibility`, SHA
`c06fbcff1db11179bdad95ab83c90e888aa62587`. Its local 2026-10-30 recovery and
2.0.6 work is not in current origin/main. MP-6 did not fetch/switch/build over
that checkout or replay its historical authorizations. Existing Windows PATH/
PATHEXT needed process-local setup for native diagnostic tools; no persistent
environment setting was changed.

External Linux custody:
`/home/jelinenaro/research/fqgate-mp6-evidence-20261106`.
External Windows custody:
`D:\code\research\fqgate-mp6-evidence-20261106`.
Receipts include exact argv/UTC/duration/exit/log hash, tool hashes, native gates,
provenance inventory and aggregate protected-file comparisons. Final engineering
head, both-platform CI and the post-work comparison are bound in the external
`delivery-receipt.json`; they are not replaced with an earlier green SHA.

Original MP-5 receipt paths named in its historical handoff are unavailable in
this environment. Original receipt byte revalidation is **NOT_EXECUTED**. The
new receipt is independent evidence, not a reconstructed original. No credential
or browser content was searched to recover it.

## Real host findings — independent of fixture success

Fresh existing-tool triage: **2026-11-05T17:11:40.515Z**, host source **c06fbcf**,
**exit 1 / BLOCKED**, **3 OBSERVED / 10 BLOCKED**, **9 attempted GET / zero POST,
QR begin/poll, account writes or process mutations**. Final repeat, if any, is
separately timestamped in external receipts; this observation is not relabelled.

| Gate                                     | Current finding                                                                                                                                 | Interpretation                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| LISTENER_17281 / LISTENER_17282          | ABSENT in current TCP census; no FQGate parent/worker or attested Bridge                                                                        | No native creation/owner baseline or current running build. No start attempted                                                         |
| Startup/service/task metadata            | Existing running cloudflared service observed; no matching Bridge service/task invocation; fixed environment variables absent at sampled scopes | Consistent with an exited foreground invocation; exact exit cause/time UNKNOWN without exit history                                    |
| INSTALLED_CLIENT / STATE                 | MISMATCH for exact 2.0.5: state says 2.0.6; EXE 58,236,416 bytes, SHA-256 `f69ab04f75c6b2b20e1776aad3cec51c0b4df4658aaf46fd05367f4ec857e8eb`    | Version drift from historical MP-5, not proof that the operator's later installation is corrupt                                        |
| PAYLOAD                                  | MISMATCH: one WebView entry among five top-level current entries                                                                                | Full immutable tree not read; no browser files hashed. Exact 2.0.5 tree cannot be attested here                                        |
| PROCESS_RECORD                           | Readable record, PID 27884, matching expected path, seven fractional digits; current comparison UNKNOWN                                         | No live owner to compare. Historical stale PID/three-decimal result is not today's observation; no adoption/rewrite                    |
| WEBVIEW_PROFILE                          | UNKNOWN, no attributable live native descendants                                                                                                | On-disk payload contamination is separate from attribution of an active WebView root                                                   |
| BRIDGE_BUILD                             | UNKNOWN; no owner/version response                                                                                                              | Historical 481db65, c06 checkout or an environment-supplied commit is not a running-artifact attestation                               |
| AB_MAPPING                               | OBSERVED parser shape: exactly two pinned entries with reviewed expected A/B states                                                             | Live Source topology/states, IDs/worker incarnations and account continuity NOT_EXECUTED/BLOCKED; no normalization of private mappings |
| QR_SCOPED_READINESS / RUNTIME_CONTINUITY | BLOCKED / UNKNOWN                                                                                                                               | No QR, account/phone/Saved Login/L2 action or authenticated remote acceptance                                                          |
| INSTALL_LOCK / TRANSACTION               | No active files observed                                                                                                                        | Independent observation, insufficient for readiness                                                                                    |
| PROTECTED_FILES                          | 343 entries unchanged, zero changed; digest `5337bdc5a88fdb755c56fa094f9ec1edfdfc15ff11db36ec2d5cf552b8c15680` both sides                       | Existing MP-5 wrapper's before/after comparison, independent of all blocked gates                                                      |

The new collector's Node candidates can include the concurrently running triage
itself; a candidate is never called the missing Bridge. Separate before/after
metadata and final native continuity results live in the receipt. Instrumented
GET counts cover diagnostics only, including failed transport attempts and edge/
certificate GETs; zero mutation is a reviewed-path plus preservation observation,
not an OS-wide trace. Child receipt failures would make counters UNKNOWN.

## Candidate provenance and safe-start limitation

Existing separate output:
`D:\code\research\fqgate-bridge-builds\compat206-final-20261030`.
All **303 files** match the existing manifest pinned by the start plan, SHA-256
`feb3cfee7603fafee949913ea6d722cb347cebbb0d333326f03ec0895f72aedc`;
config also matches that plan. The older delivery receipt's source inputs match
only 7/9 current files: it predates later corrections and is not final-source proof.

An independent Linux archive/build of exact **c06fbcf** preserves the Windows
candidate. Both generated `dist/.output` inventories contain **302 files**:
**164 byte-identical**, **135 differing same-name files**, **3 filenames unique
to each**. Compiled JavaScript matches; source maps name the different output/
source locations. SSR differences include timestamps, public-asset ordering,
dependency paths and generated chunk names. The extra manifest entry outside
these two output trees is inventoried separately. This is useful bounded
source/build evidence, **not full byte-for-byte SSR reproducibility or running
identity proof**. Build info uses a runtime environment variable, not an embedded
source signature. No candidate was imported or started.

Static review additionally found existing lifecycle `status()` can delete a
record whose PID has exited. Dashboard/status/capability traffic after a start
may trigger it. MP-6's standalone diagnostics avoid that path; a future start
decision must explicitly address this side effect. No runtime correction or
record write is made here. See sheet 1 for exact reserved command, prerequisites,
remote/session impact, STOP rules and rollback limits.

## Verification and remaining decisions

| Check                                                                                 | Result                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Frozen install, typecheck, lint, isolated build                                       | PASS / 0                                                 |
| Full unit suite                                                                       | 829 PASS / 38 files / 0 failures                         |
| Linux Chromium E2E                                                                    | 19 PASS / 0 failures; isolated Linux test server only    |
| Prototype/production import audit                                                     | PASS / 0                                                 |
| MP-2 / MP-3 native fixtures                                                           | 14/14 each / 0                                           |
| MP-4/MP-5 mutation-flag fixtures                                                      | 12/12 / 0                                                |
| QR native preflight / inline identity / no-approval                                   | 28/28 + 5/5 + 1/1 / 0                                    |
| v2 observation fixtures                                                               | 40 cases / 0                                             |
| MP-6 metadata/redaction fixtures                                                      | 11/11 / 0                                                |
| Format, final-head CI, final protected-file comparison                                | Exact results in external delivery receipt and PR checks |
| Real GET-only triage / inner MP-5 / QR preflight                                      | BLOCKED / 1; not fixture failures or acceptance PASS     |
| Live native account/epoch, A/B login, Saved Login/L2, authenticated remote acceptance | NOT_EXECUTED                                             |
| Windows browser E2E                                                                   | NOT_EXECUTED; unchanged CI Windows skip, Linux E2E runs  |

Linux tools: Node 24.19.0, pnpm 11.23.0; native fixtures: Node 24.22.1 and
Windows PowerShell 5.1. Hosted matrix uses Node 22 on Ubuntu/Windows and checks
the exact PR source head. Early fixture-runner setup failures and the intentional
pre-fix precision failures are retained externally, not hidden as successful
checks. No native/runtime recovery followed any failed check.

Next safe decision: reconcile the preserved 2.0.6 host/candidate lineage and
choose a separately scoped host-version/recovery task. The three independent
decision sheets are prepared, not executed or pending implicit consent. Native
strong identity and monotonic epoch remain **UNPROVEN**, independent storage/
port **UNKNOWN**, real multi-account qualification **NOT QUALIFIED / NO-GO**.
A successful fixture, CI run, future single-B login or file rollback cannot
change those other states by implication.
