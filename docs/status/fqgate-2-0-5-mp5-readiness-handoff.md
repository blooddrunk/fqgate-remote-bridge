# MP-5 readiness triage and A/B evidence integrity handoff

2026-10-24, Asia/Taipei. Authorized by Issue #26 after MP-4 PR #25 merged at
`eedbc61546770669c795f83e242753ea0e9800ce`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; production integration **NO-GO**.

## Engineering behavior

The explicit Windows A/B diagnostic requires exactly two unique privately pinned
Sources in reviewed order A connected / B disconnected. The generic parser still
accepts 1..16 profiles; the independent AB_MAPPING gate blocks experiment claims
for every other shape. Existing unknown-field, worker/native creation, Source
recreation, peer drift, stale-time, timeout/cancellation and delayed publication
fences remain. Missing prerequisites are individually visible, and the aggregate
readiness is always BLOCKED. Native identity/epoch cannot be synthesized.

`source-readiness-mp5.ts` contains the diagnostic implementation; old entries
re-export it. The separate artifact name permits additive staging without
replacing existing permanent-host output. `readiness-evidence.ts` provides bounded
safe file reads, exact native-record classification and protected-output byte
comparison. The static import audit includes all four diagnostic entry/modules;
none is reachable from runtime composition or MP-1.

`fqgate205-mp5-triage.mjs` reuses MP-2/MP-4 and QR Preflight, then writes a bounded
external reduced receipt containing actual commands/exits/UTC, checkout SHA,
loaded tool hashes, actual running Bridge self-report if available, host gate
conditions, child gate reasons and request counters. It automatically compares
permanent dist/.output plus private config/mapping/state/record before/after.
Unreadable files are not considered unchanged. Conditions distinguish ABSENT,
UNREADABLE, MISMATCH, STALE and UNKNOWN. Process-record PID/creation is compared
at seven-decimal precision; it is not a native login epoch.

QR Preflight now counts GETs, suppresses Bridge GET when its listener is absent,
and checks for browser storage before hashing the immutable payload. The MP-2
wrapper applies the same exclusion before its existing identity helper. Browser
storage contents are never intentionally read to diagnose a placement failure.
No new simulation framework, native login runner, generic POST transport or
production route is added. v1/2.0.5 adapters, operation registry/permissions,
single-connected-source guard, Cloudflare and MP-1 remain unchanged.

## Evidence custody and delivery

External Linux evidence: `/home/jelinenaro/research/fqgate-mp5-evidence-20261024`.
External Windows evidence: `D:\code\research\fqgate-mp5-evidence`.
`quality.json`, native command logs/exit records, triage JSON/hash companions and
`delivery-receipt.json` bind final PR head, test counts, exact-head CI and host
observations outside Git, avoiding self-referential source hashes.

Initial Linux worktree was clean. Fetch/prune verified merged #25 and no open
PR. The prior MP-4 branch contains its pre-squash implementation commit, so it
cannot fast-forward to the squash merge. It was preserved; MP-5 branches from
latest origin/main. Permanent Windows checkout is reused in place. Its original
286 runtime/output/config files were snapshotted before source synchronization;
no destructive reset/clean, existing artifact overwrite or service start occurs.

## Real permanent-Windows blockers

Fresh GET-only triage at `2026-10-24T03:23:42.897Z` on engineering source
`5bf24e507c9ff1067baf230307939224b29493fe`: **6 OBSERVED / 7 BLOCKED** host
gates, exit **1**, **37 GET / 0 POST / 0 account writes / 0 QR begin / 0 QR poll /
0 process mutations**. This is **BLOCKED**, not native acceptance success.
The original reduced receipt SHA-256 is
`0abe251013e6849676a48194d1faecb789f3261724884a833661ac1497dbaf03`.
Final-head repeat and CI are separately bound in the external delivery receipt;
the timestamp/source above remain this particular observation, not the final SHA.

| Gate                               | Verified condition and root cause                                                                                                                      | Consequence / safe repeat                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| LISTENER_17281                     | OBSERVED: exactly one 127.0.0.1 listener, parent PID 9656, native creation `2026-10-21T02:59:51.8892760Z`; two direct workers                          | Fixed 2.0.5 GET evidence remains useful; repeat triage/native metadata without mutation                                                     |
| LISTENER_17282                     | **ABSENT**: no listener                                                                                                                                | Current Bridge owner/build unavailable; separately reviewed Bridge-only availability decision required                                      |
| INSTALLED_CLIENT                   | OBSERVED: pinned 53,590,016-byte EXE and both exact client slices match                                                                                | Does not verify full payload, signature, process record or account isolation                                                                |
| STATE / INSTALL_LOCK / TRANSACTION | OBSERVED: exact active 2.0.5 artifact metadata; no lock or transaction file                                                                            | A blanket installation failure does not erase these independently observed prerequisites                                                    |
| PAYLOAD                            | **MISMATCH**: WebView entry inside immutable current payload; no browser data read or tree qualification                                               | Separate native storage/installation maintenance review needed; exact EXE success cannot override layout mismatch                           |
| PROCESS_RECORD                     | **STALE**: recorded PID differs from current native listener owner; recorded creation also differs and has only three decimal places                   | No adoption/rewrite performed. Repeat exact path/PID/creation diagnostic; current process is not repaired by modifying expectations         |
| WEBVIEW_PROFILE                    | **MISMATCH**: seven observed descendant WebViews share one root inside payload; zero unknown roots/reparse ancestors in sampled topology               | Placement is observed, complete native storage ownership remains unproven; no directory move or native restart                              |
| BRIDGE_BUILD                       | **UNKNOWN / BLOCKED**: no current Bridge version response is requested from absent 17282                                                               | Historical expected `481db65...` is never treated as current build; checkout/tool hashes stay separate                                      |
| QR_SCOPED_READINESS                | **UNKNOWN / BLOCKED**, existing adapter identity gate `PROCESS_IDENTITY_MISMATCH`                                                                      | Native record/tree/profile prerequisites fail independently; no QR sent                                                                     |
| RUNTIME_CONTINUITY                 | **UNKNOWN / BLOCKED**: full payload/native/Bridge baseline cannot be attested                                                                          | Byte-equal protected files alone do not prove operational readiness                                                                         |
| PROTECTED_FILES                    | OBSERVED: **343 entries unchanged**, same before/after digest `32da2e364928678e89db88b0b3b5bc755a084b059b925212e0b8f2c2d9adadc0`, zero changed entries | Includes directory markers and 290 files after additive diagnostic staging; independently, all original **286 files** remain byte-identical |

A/B samples: A connected, Saved Login available, L2=false; B disconnected,
Saved Login unavailable, L2 unknown. Both worker incarnations and reviewed
private Source/number mappings remained stable over two fresh samples. These
facts are **OBSERVED**, not distinct-account/epoch evidence. Inner MP-5 diagnostic
emits **8 OBSERVED / 11 BLOCKED / 4 UNPROVEN / 2 NOT_EXECUTED** (repeated native
sample gates counted as emitted), exit 1, 16 GET. Independent QR Preflight emits
**14 PASS / 7 BLOCKED / 1 NOT_EXECUTED**, exit 1, 21 GET. Its seven blocked gates
are PAYLOAD, LISTENER_17282, PROCESS_RECORD, WEBVIEW_PROFILE, BRIDGE_BUILD,
QR_SCOPED_READINESS and RUNTIME_CONTINUITY. No authenticated remote acceptance
or lookup POST is implied by unauthenticated edge/certificate GETs.

The existing permanent checkout had a narrow fetch refspec; the explicit MP-5
ref was fetched and a local branch created without changing Git configuration.
No operator changes were overwritten. Two previously absent compiled diagnostic
modules were added after **25 reused transitive compiled dependencies** matched
byte-for-byte. Existing dist/.output files were retained, including the older
MP-4 diagnostic. External original-file manifest SHA-256:
`9997523316a4a0f2a4b53a3d2589bf2052d1702b533a59213c43eba724db9a93`.

## Automated verification and limits

| Command                                        | Result / exit                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`      | PASS / 0                                                                            |
| `corepack pnpm typecheck`                      | PASS / 0                                                                            |
| `corepack pnpm lint`                           | PASS / 0                                                                            |
| `corepack pnpm test`                           | **825 PASS, 38 files**, 0 failed / 0                                                |
| `corepack pnpm build`                          | PASS / 0                                                                            |
| `corepack pnpm format:check`                   | PASS / 0                                                                            |
| `corepack pnpm test:e2e`                       | **19 PASS**, 0 failed / 0                                                           |
| `node scripts/audit-profile-prototype.mjs`     | PASS, zero production imports of prototype/research model/readiness diagnostics / 0 |
| Windows MP-2 native fixtures                   | **14/14** / 0                                                                       |
| Windows MP-3 native fixtures                   | **14/14** / 0                                                                       |
| Windows MP-4/MP-5 CLI fail-closed flags        | **12/12** / 0                                                                       |
| Windows QR Preflight fixtures                  | **28/28** / 0                                                                       |
| Windows inline QR identity + no-approval guard | **5/5 + 1/1** / 0                                                                   |
| Windows v2 observation fixtures                | **40 cases** / 0                                                                    |
| Real triage / inner MP-5 / QR Preflight        | **BLOCKED / 1** each, not fixture failure or acceptance PASS                        |
| Real MP-3 metadata collector                   | OBSERVED metadata / 0, not isolation PASS                                           |

The 17 additional deterministic tests cover five invalid explicit A/B shapes,
partial observation with blocked readiness, native timeout/late completion with
all missing gates visible, eight process-record classifications including
100-ns creation drift and rounded creation, protected-file edits/additions/
deletions, absent versus unreadable paths and unsafe ancestor/junction snapshots.
Retained source-recreation, worker drift, peer races, unknown identity and
A→B→A blind-spot tests continue to pass. CLI checks reject six mutation/generic
selector flags for each diagnostic before native I/O.

Exact-final-head Ubuntu/Windows job SHAs, URLs and completed conclusions belong
in `delivery-receipt.json`; neither an earlier green run nor a synthetic merge is
substituted. **Windows browser E2E is skipped** by unchanged CI platform policy;
Linux Chromium E2E runs. CI fixture Bridge smoke is independent of this host and
does not start any permanent FQGate/Bridge/cloudflared process. No human action
is needed to complete MP-5 engineering.

## Unresolved contract and subsequent decision

Native non-display account ID and monotonic login epoch remain UNPROVEN; equal
GETs/display names/process times cannot exclude hidden A→B→A. Saved Login
availability is not independent restore/storage proof, and an L2 flag is not a
concurrent-data isolation result. Supported independent port and full
credential/cache/WebView/mutex/IPC root remain UNKNOWN. No authentication,
phone confirmation, Source/account mutation, Saved Login restore, L2 experiment,
process/service start/stop/restart, installation repair or Cloudflare change ran.

The [operator decision sheet](../operations/windows-fqgate205-mp5.md) names the
exact host/files, repeat checks, proposed separately approved Bridge-only start,
expected observations, STOP conditions, impacts and rollback limits. Native
relocation/repair lacks a supported contract and therefore has no fabricated
repair command. Next milestone is separately reviewed host-prerequisite recovery
and upstream contract clarification; a native A/B experiment additionally requires
a separate bounded alias-aware runner and explicit account/phone authorization.
The clarification draft is NOT SENT. Engineering completion does not qualify
real multi-account isolation.
