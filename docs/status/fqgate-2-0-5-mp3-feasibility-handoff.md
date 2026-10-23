# FQGate 2.0.5 MP-3 isolation feasibility and evidence

Date: 2026-10-23 (Asia/Taipei). **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.
MP-3 delivers read-only investigation and offline requirements tests. It does
not integrate multi-account production routing or perform a native experiment.

## Decision

| Question                                                                                           | Decision    | Evidence / consequence                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does exact 2.0.5 support independently configured process + port + all storage roots on this host? | **UNKNOWN** | No reviewed supported port/storage launch contract; only one parent process observed. String scans cannot disprove hidden options.                                                                                    |
| Can process-per-profile production integration proceed now?                                        | **NO-GO**   | Independent port, complete storage ownership, lifecycle and account/session contracts are missing. Do not guess flags, copy installations, or launch a second instance.                                               |
| Is native multi-Source account isolation qualified?                                                | **UNKNOWN** | Two native workers are observed; stable non-display account identity, session epoch, saved-login and concurrent L1/L2 independence remain unproven.                                                                   |
| Is process-per-profile better than native Sources?                                                 | **UNKNOWN** | It could separate crash/HTTP boundaries if supported, but cannot yet establish independent account, saved-login or L2 scope; more lifecycle machinery would be needed. No evidence warrants replacing native Sources. |
| Can bounded offline investigation continue?                                                        | **GO**      | The test-only topology/race model, static audit and native read-only collector are reviewable and do not grant runtime authority.                                                                                     |

Preserve the existing single-connected-source guard and production adapters.
The smallest next task is an exact-version upstream contract clarification,
not more simulated logins or a production Resolver. Request documented startup
configuration for independent IPv4 loopback ports; all data, credential/cache,
WebView and singleton/IPC scopes; worker ownership; and graceful exit/restart
and source-persistence semantics. If no such supported contract exists, retain
NO-GO for process-per-profile and separately consider the bounded native-Source
observable-displacement experiment below. No Issue or upstream message was sent.

## Source custody and evidence classes

The initial WSL tree was clean on MP-2 `31c2a287585e3cda3479be7a241edfd41fa8587b`.
First actions were status, fetch/prune and latest-main log. Verified PR #21
merged at `19e850bf212b4d032badbbc96df28cc12bddecd5`; PR #22 was OPEN,
planning-only, head `bb6af15e0c728bc6c2752de68061295983748410`.
Created `codex/fqgate205-mp3-feasibility` from fetched main and fast-forwarded
its two planning commits. PR #22 is not assumed merged or closed by this work.
The existing clean permanent Windows checkout was separately fetched and moved
to a new branch at that main; its runtime outputs were preserved. No reset,
clean, force push, second checkout, service start or deployment occurred.

Evidence classes are deliberately separate: CONTRACT_PROVEN means a specific
published or bundled-client statement, not real isolation acceptance; OBSERVED
means static bytes or current read-only host samples; FIXTURE_ONLY means an
injected hypothetical model; UNPROVEN means missing semantics; BLOCKED means
a concrete prerequisite failed; NOT_EXECUTED means no authorized experiment.

Public sources, re-read for MP-3:

- **S1**: pinned [publisher README](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/README.md)
  and [operator guide](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/使用说明.md).
  These describe complete ZIP installation, local desktop use and startup
  version/network dependency, not independently configurable instances.
- **S2**: [publisher tree](https://api.github.com/repos/fqgate/FQGate-releases/git/trees/1b56f62816b8347b871bc5a3f927148fae212eb9?recursive=1)
  and [2.0.5 release metadata](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/2.0.5/release.json).
  Release repository contains distribution/docs/metadata, no server runtime
  implementation source. The separate public Agent repository at reviewed
  `7ae0f216e5ca5d98a0808b7dae7b20da5d97f097` is not the native server source.
  Scope is the pinned 2.0.5 artifact, not an assertion about a newer release.
- **S3**: exact pre-existing ZIP, 29,236,811 bytes, SHA-256
  `c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba`.
  Non-executing directory review found nine files: main EXE, updater, readme
  and six plugin-package files. No extraction or installation was performed.
- **S4**: exact installed EXE, 53,590,016 bytes, SHA-256
  `d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847`;
  bundled readme SHA-256
  `ac67d9bed5c4469a49da4fad6ea5d37ba234a6dd76a186148d652eff48617439`.
  Known UI/client slices were reverified by the existing QR Preflight. Static
  evidence does not authenticate publisher signatures or qualify rollback.
- **S5**: fresh permanent-Windows read-only CIM/listener/storage-placement
  collector and MP-2/QR Preflight receipts, outside Git. Their timestamps,
  process creation and tool hashes bind this observation, not future launches.
- **S6**: [MP-1 report](fqgate-2-0-5-mp1-implementation-handoff.md),
  [MP-2 report](fqgate-2-0-5-mp2-implementation-handoff.md) and unchanged production
  source. Historical live QR/remote results are not rerun or relabelled here.

## Native capability inventory

| Claim                            | Class                                                             | Exact evidence and limit                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal application launch        | CONTRACT_PROVEN, S1/S3/S4                                         | Complete directory; open FQGate.exe. No independent port/data-root launch syntax documented in reviewed material. `--help`/`--version` were not executed because even a probe could start the application.                                                                                                                     |
| Configurable listener            | UNPROVEN                                                          | Default 127.0.0.1:17281 appears in docs/bytes and is currently OBSERVED. Bridge's own base-URL configuration is not an upstream bind-port setting. No documented port override or collision/singleton behavior found.                                                                                                          |
| Suggested launch flags           | OBSERVED static bytes, S4                                         | ASCII/UTF-16 search finds no `--port` or `--user-data-dir`; `--data-root` at byte 35250125 is beside CNEquity installer text, not a supported FQGate option. Absence/presence is not parser proof. No unsupported flag was passed to a real executable.                                                                        |
| Process trees                    | OBSERVED, S5                                                      | One parent, two direct FQGate.exe workers, exact expected executable paths and creation metadata. Both workers have `--source-worker` and `--source-worker-parent-pid`. These are private worker mechanics, not supported independent server launch options. Parent PID alone is not ownership across reuse.                   |
| Current listener ownership       | OBSERVED / BLOCKED, S5                                            | One IPv4 loopback 17281 listener belongs to the parent. 17282 absent: BLOCKED_LISTENER_ABSENT; running Bridge SHA and live denials unavailable. No automatic repair.                                                                                                                                                           |
| WebView2 user data               | OBSERVED, S5                                                      | Six descendant WebView processes report one distinct directory; all six place it inside the current application directory. Ancestor attribute checks found no reparse point in those observed paths. No profile contents read. This is UI storage evidence, not proof of worker account storage or all possible storage roots. |
| Other data/cache                 | OBSERVED static hints / UNPROVEN ownership, S4                    | `source-instances.json`, `interactive-login.dpapi`, `LOCALAPPDATA`, `ths-native-sdk` strings exist. DPAPI/current-user context or separate UI directories cannot prove namespacing of credentials, all cache files, mutexes, plugin paths or IPC. File contents and credential blobs were not read.                            |
| Source lifecycle                 | OBSERVED descriptor / UNPROVEN persistence                        | MP-2 GET inventory binds source ID/number/worker/restart to one sample. Bundled client has temporary-source create/delete workflows, never invoked here. Recreate/re-number/restart persistence is not guaranteed; fixtures reject observed changes.                                                                           |
| Account lifecycle                | OBSERVED / UNPROVEN                                               | One connected source with saved-login availability and L2=false; peer disconnected. Snapshot contains display/state/session kind, not authoritative non-display account identity or a monotonic login epoch. Auth descriptors exist per source; action availability is not isolation.                                          |
| Shared resources across parents  | UNPROVEN                                                          | Only one parent observed; no second root/port/process exists to compare. Same OS user, native SDK cache, plugin settings, UI storage, updater/global configuration and provider-side sessions are potential shared scopes. These are investigation targets, not proven contamination.                                          |
| Close / quit                     | CONTRACT_PROVEN for client instruction, S4; NOT_EXECUTED behavior | Bundled readme says closing the window leaves the app in background; full exit uses tray/menu Quit. No window close, quit, kill, restart or worker-parent exit experiment was run.                                                                                                                                             |
| Restart / session restore        | UNPROVEN / NOT_EXECUTED                                           | Saved-login field does not prove which account resumes, durable source numbering, stale-flow retirement or complete directory rollback. Startup network/version checks are publisher-documented, not independently replayed here.                                                                                              |
| Account/Saved Login/L2 isolation | NOT_EXECUTED / UNPROVEN                                           | No second login, same-account duplicate test, restoration, logout or L2 query performed. Process boundaries cannot remove provider-side account/session limits.                                                                                                                                                                |

All sampled worker identities remained equal in MP-2's two full samples.
Equal samples cannot exclude A → B → A. `observed_at`, PID+creation, restart
count and Bridge generation remain continuity signals/fences, not native epoch.
The observed shared WebView root is not evidence that two account workers share
saved credentials; the missing independent-root contract is the blocker.

## Architecture comparison

| Dimension           | A: one parent, multiple native Sources                                                          | B: separate parent/port/user data                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Evidence today      | Real per-source account/auth descriptors and two workers                                        | One normal application parent only; no supported independent launch contract                                                      |
| Isolation potential | Worker failure boundary exists; parent/API/config shared                                        | Could separate HTTP/parent failure domains if supported; OS-user/provider/native cache sharing still needs proof                  |
| Account/epoch proof | Missing stable account ID and native epoch                                                      | Still missing; PID/creation only establishes process incarnation                                                                  |
| Saved Login / L2    | Scope and displacement untested                                                                 | Disjoint directories would be necessary evidence, insufficient for provider L2 or all credential scope                            |
| Resources           | Observed 3 FQGate processes plus 6 WebViews; FQGate working sets about 194.5 MiB at one instant | Additional HTTP/UI/update state likely adds overhead; no second process benchmark, no numeric estimate claimed                    |
| Management          | Existing parent lifecycle; source recreation/renumber fencing needed                            | Need supported port/storage assignment, collisions, graceful stop, orphan cleanup, update/rollback ownership and endpoint fencing |
| Resolver work later | Explicit alias → source binding within deployment                                               | Explicit alias → deployment/endpoint/process + source; IDs may coincide across parents; no public arbitrary port/path             |
| QR/concurrency      | Conservative global auth mutex and peer-query fence retained                                    | Keep the same conservative fence until auth independence proven; do not infer parallel QR safety from two PIDs                    |
| Recommendation      | Preserve current single-account behavior; potential next empirical research route               | Retain fallback as UNKNOWN; NO-GO for integration without supported launch/storage guarantees                                     |

## Executable engineering

`tests/helpers/mp3-isolation-model.ts` is a test-only requirements model, never
a native controller or replacement Resolver. Two hypothetical roots may be
lexically consistent, while `nativeEngineeringDecision` always remains UNKNOWN.
Its fixture account/epoch tokens are explicitly invented and cannot satisfy
MP-1 native identity ports. Link/ancestor evidence is injected; lexical path
comparison cannot discover filesystem links. Equal native snapshots remain
inherently insufficient even if every fixture passes.

`tests/mp3-isolation.test.ts` executes **57 tests**, grouped as MP3-01..16:

- Duplicate aliases/ports/PIDs, missing/wildcard/IPv6/foreign listeners, exited
  parents, worker parent/creation/restarts, same/nested/case-aliased/cross-role
  data roots, shared WebView/saved-login roots, links and unreadable ancestors.
- Unsupported proposed port/data/user-directory/worker flags fail model review
  without launching anything; no claim about the native parser's behavior.
- Source removal/recreation/renumbering, process/PID-creation drift, peer account,
  saved-login overlap and L2 change reject delayed status/lookup/QR begin/poll.
- Reversed A/B completion, foreign attribution, disconnected A/no B fallback,
  owned flows, repeated polls, stale flow invalidation and reconstruction.
- Global QR exclusion, delayed peer-query invalidation, cancellation, timeouts,
  late completion and no retry. Timed-out authentication holds the fixture mutex
  until its unsettled work ends. Cancellation never undoes the injected effect.
- A → B → A limitation witness deliberately publishes an indistinguishable
  snapshot and keeps UNKNOWN; this PASS reports the blind spot.

The MP-1 and MP-2 negative/race suites remain unchanged. Full regression includes
the exact four-context operation matrix, Host/forwarded spoofing, JWT, Origin,
confirmation, machine QR denial, v1 and exact-2.0.5 ambiguity tests. No live
machine/human/admin acceptance is claimed with 17282 absent.

`audit-profile-prototype.mjs` now also statically audits the MP-3 helper:
production cannot reach it; its only module dependency is pure `node:path`;
the new test suite is also statically checked for I/O and imports only Vitest and this helper;
network/process/filesystem/timer/logging globals are forbidden. The existing
four-module MP-1 boundary remains enforced. `audit-fqgate205-isolation.mjs`
reads only exact size/hash-pinned EXE bytes and reports fixed token offsets;
it never imports/executes the PE, writes native state or infers flag support.
The Windows MP-3 collector reads CIM/listeners and WebView ancestor attributes,
projects only counts/booleans/process creation, and never emits raw commands,
private paths, Source IDs, display values or account hashes. Exit 0 means the
observation completed, not that isolation passed. Its **14 native fixtures**
mock the Windows read APIs; the separate real collection is OBSERVED.

## Actual automated receipts

External WSL root: `/home/jelinenaro/research/fqgate-mp3-evidence-20261023`.
External permanent-Windows root: `D:\code\research\fqgate-mp3-evidence`.
Logs, exit files, hashes and `quality.json` / `delivery-receipt.json` bind the
actual commands, final source SHA, PR and exact-head CI. No self-referential SHA
is embedded in this report. CI success is required on that final PR head, not
an earlier commit or synthetic merge. Permanent-host runtime is not redeployed.

| Command from repository root                                                                      | Actual result / exit                                                                     |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                         | PASS / 0                                                                                 |
| `corepack pnpm typecheck`                                                                         | PASS / 0                                                                                 |
| `corepack pnpm lint`                                                                              | PASS / 0                                                                                 |
| `corepack pnpm test`                                                                              | 794 PASS, 0 failed, 37 files / 0                                                         |
| `corepack pnpm build`                                                                             | PASS / 0                                                                                 |
| `corepack pnpm format:check`                                                                      | PASS / 0                                                                                 |
| `corepack pnpm test:e2e`                                                                          | 19 PASS, 0 failed / 0                                                                    |
| `node scripts/audit-profile-prototype.mjs`                                                        | 125 non-prototype production files; zero MP-1/MP-3 production paths or forbidden I/O / 0 |
| `powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp3-native.ps1` | 14 PASS, 0 failed / 0                                                                    |
| Same native invocation: `test-fqgate205-mp2-native.ps1`                                           | 9 PASS, 0 failed / 0                                                                     |
| Same native invocation: `test-fqgate205-qr-preflight.ps1`                                         | 28 PASS, 0 failed / 0                                                                    |
| `node .\scripts\windows\test-fqgate205-qr-identity.mjs`                                           | identity 5 PASS + no-approval/zero-QR guard 1 PASS, 0 failed / 0                         |
| Same native invocation: `test-fqgate-v2-observation.ps1`                                          | 40 PASS, 0 failed / 0                                                                    |
| New MP-3 native collector / exact-artifact static audit                                           | OBSERVED, not isolation PASS / 0 each                                                    |
| Existing MP-2 real GET-only Preflight                                                             | 6 OBSERVED, 9 BLOCKED, 2 UNPROVEN, 1 NOT_EXECUTED / 1; 18 GET, POST/account/QR=0         |
| Existing QR real Preflight                                                                        | 14 PASS, 7 BLOCKED, 1 NOT_EXECUTED / 1                                                   |

Native commands ran through explicit Windows executables with
`Start-Process -Wait -PassThru`; native exit codes were captured independently
of WSL shell success. **Windows browser E2E is skipped by the existing CI
workflow.** Ubuntu browser E2E and both-platform unit/build/native fixture CI
are separate evidence. CI's temporary fixture Bridge smoke is not a deployment
or real FQGate launch. On the permanent host no build/loopback-start command ran.
The 283 existing `dist`/`.output` files were snapshotted for preservation checks.

An initial lint run found a missing explicit Node Buffer import and a
control-character regexp lint issue; both were fixed before final checks.
The inherited PR #22 task/prompt files also needed Prettier formatting; only
formatting was corrected before the final format check. No native repair was
performed for any blocked gate.

## Production/runtime difference audit

No tracked production source, adapter, operation registry, four-context policy,
configuration, UI route, MP-1 Resolver or MP-2 diagnostic was changed. Generated
route-tree churn from the existing tool is excluded. Changed runtime-adjacent
files are standalone static/Windows diagnostics only; they are not imported by
production. CI adds one Windows fixture command. No new library dependency.

Zero real QR begin/poll, account/Source/Saved Login writes, FQGate/Bridge process start/stop,
installation, recovery, Cloudflare mutation, permission expansion or deployment.
The unchanged QR Preflight additionally performed its existing unauthenticated
GET-only edge/certificate observations; those are not authenticated remote
regression. Native WebView/credential contents were never read or changed.
Production remains single-account; private aliases in tests are not enrollment.

## Separate future experiment contract

No human action is required to finish MP-3. The separately authorizable minimum
experiment and exact GET-only resume commands are in
[Windows MP-3 procedure](../operations/windows-fqgate205-mp3.md).
There is no MP-3 Live executor or guessed multi-process launch command. Any
future native attempt needs its own bounded reviewed runner and explicit
approval for the precise mutation, after current host/runtime/process/source
prechecks. Lack of a supported second-instance launch interface is a reason to
stop before launch, not to experiment with undocumented flags.
