# FQGate 2.0.5 shared-profile selection and isolation contract review

Date: 2026-10-16 (Asia/Taipei). Decision: **MP-0 DESIGN_REVIEW_COMPLETE**.
This is a design contract, not implemented profile routing or native isolation acceptance.
Source reviewed: `0df0d96156df4a9e8e4a6b044f9bde1d811205e7`.
Authority: [MP-0 task](../tasks/fqgate-2-0-5-mp0-shared-profile-design-review.md)
and [goal](../prompts/fqgate-2-0-5-mp0-codex-goal.md). The
[future plan](future-multi-profile-account-isolation.md) remains applicable;
its native-instance-first decision is unchanged.

## Evidence and current-source census

Labels: OBSERVED means source inspection or the explicitly dated read-only host
observation below; FIXTURE_ONLY means synthetic execution, never native account
acceptance. BLOCKED identifies an unavailable prerequisite. NOT_EXECUTED identifies
work not performed. Proposed contracts below are requirements, not observed facts.

Historical baseline from the [QR handoff](../status/fqgate-2-0-5-qr-session-implementation-handoff.md):
PR #19 merged; runtime `481db65097cd63ea0f9c28f39e526e341b700721`
passed single-source QR Live 8/8, local 6/6 and real remote_machine 22/22.
Those results are historical; this review did not repeat Live or authenticated remote tests.
The deployed SHA must remain separate from checkout/merge/documentation SHAs.

| Area                | OBSERVED source behavior at reviewed SHA                                                                                                                                                                                                                                                                     | Isolation implication                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition         | `src/bridge/runtime.ts:createRuntimeHandler` constructs one QR adapter and registry; `src/app/runtime.ts:createApplicationServices` constructs a separate lookup adapter                                                                                                                                     | There is no shared selection authority                                                                                                                                                                                                     |
| QR target           | `src/bridge/qr/v2.ts:snapshot` validates bounded inventory, unique IDs and tonghuashun instance numbers; ready QR/session-capable candidates are filtered by optional private `qrV2.instanceNumber`; exactly one must remain                                                                                 | Pin is an instance number, not an enduring account identity; no public selector                                                                                                                                                            |
| QR ambiguity guard  | Counts connected sources across inventory; denies >1 connected, and denies a disconnected target while another source is connected                                                                                                                                                                           | Deliberately preserves the closed single-connected lookup; cannot enable two-account routing by removing this guard alone                                                                                                                  |
| QR binding          | Worker fingerprint includes source ID/number/provider/PID/restarts, autoLogin/defaultGuest, modes/descriptor. Account snapshot fingerprint excludes observed_at; accountIdentity hashes account_display/session_kind. Peer fingerprints include non-target source metadata and eligible account observations | Conservative sampled continuity; display text is not a proven globally unique account identifier                                                                                                                                           |
| Begin/poll          | Adapter binds one numeric flow to process/source observations and TTL; compares before/after. Pending account drift fails. Connected completion of an already connected target requires same accountIdentity; a previously disconnected target may acquire identity on completion                            | A disconnected enrollment is not proof that the intended account was enrolled; expected-account proof needs a later gate                                                                                                                   |
| Status/capabilities | `src/bridge/service.ts:status` uses QR `inspect()` for v2 session; failure returns unknown with null loginMethod. Capabilities uses the same inspection, failure disables QR                                                                                                                                 | Session status follows QR pin, while lifecycle fields remain deployment-level; unknown does not mean logged out                                                                                                                            |
| Lookup              | `src/fqgate/market/v2.ts:lookup` independently selects exactly one connected source globally; zero -> LOGIN_REQUIRED, multiple -> FQGATE_INCOMPATIBLE. Requires ready tonghuashun worker and account session_supported/connected; uses private X-FQGate-Instance-Id on fixed search GET                      | It does not consult qrV2.instanceNumber or pin account_display/session_kind/L2. Pre/post source fingerprint omits account identity; an account switch with unchanged worker/source and connected state is not detected by that fingerprint |
| Process             | `market/v2-identity.ts` checks exact payload/state, record PID/path, native listener process/path/creation and transaction absence; QR identity adds recorded creation and WebView separation                                                                                                                | Parent process creation is observed; per-worker native creation and native session epoch are not established. Equal PID/restartCount alone cannot prove worker continuity                                                                  |
| QR registry         | `src/bridge/qr/registry.ts` allocates UUID before begin, globally replaces active flows, retains bounded tombstones, binds adapter; `service.ts` serializes begin/poll through completion                                                                                                                    | No alias, principal, audience or per-profile generation is stored. Legacy UUID possession is not future cross-profile authorization                                                                                                        |
| Server caches       | Lookup has request-local state, no result cache or shared query deduplication. QR stores one private binding. OpenAPI service has one TTL cache and reset/refresh                                                                                                                                            | Deployment schema cache may be shared only as schema evidence; never share profile data or authorization decisions                                                                                                                         |
| UI                  | `use-bridge-status.ts` key is [bridge,status]; capabilities key [bridge,capabilities]; `use-qr-login.ts` key [qr-flow,UUID]. Generation rejects late begin callbacks, cancel removes local queries; status invalidates after completion                                                                      | These are single-profile keys. Poll/query cancellation is not upstream revoke/logout and generation is not an account epoch                                                                                                                |
| Transport/policy    | `src/bridge/transport/http.ts` authenticates Host/context, checks registry then admin POST Origin/intent before dispatch; no-store responses; strict lookup accepts exactly code; QR accepts no source selector                                                                                              | Forwarded metadata/native IDs cannot authorize a profile; transport must stay thin                                                                                                                                                         |

Current QR HTTP work uses a 5-second shared deadline per reader, bounded
inventory <=16, 64-KiB read responses (OpenAPI 4 MiB), bounded QR payload,
and existing QR TTL (`QR_FLOW_TTL_MS`). Native checks have their own bounded
subprocess/filesystem cost; the HTTP deadline is not a total wall-clock bound.
Lookup preserves 5-second HTTP budget, 64 KiB/16 items and exact six-digit code.
Neither adapter retries or falls back to another source. Keep these limits.

At 2026-10-16 01:15Z, permanent-Windows GET-only Preflight at reviewed SHA
exited 1: **9 PASS / 12 BLOCKED / 1 NOT_EXECUTED**. Payload/state pin passed;
17281 and 17282 were absent. Current runtime SHA, source/account observations,
process/WebView continuity and QR readiness could not be verified. Access cert
GETs and unauthenticated edge 302/302/401 do not prove authenticated origin health.
No start, deployment, repair, elevation, authentication POST or token request followed.
This is an environment limitation, not evidence overturning the historical Live result.
Native two-account/L1/L2 acceptance remains NOT_EXECUTED_REQUIRES_SEPARATE_APPROVAL.

## Decisions and alternatives

D1. Prefer native source instances inside the existing one FQGate process for
investigation. Multiple declared instances and one accepted login support this
choice; they do not establish concurrent account isolation. Process-per-profile
is a fallback only after explicit evidence requires it, with separately reviewed
ports, process ownership and profile storage. MP-0 creates neither processes nor sources.

D2. Bridge owns an immutable opaque alias, not an account name, source number,
URL or caller-selected native ID. Proposed syntax: random `p_` plus 32 lowercase
hex characters, <=34 ASCII bytes; examples A/B below are synthetic labels only.
An operator registers mappings privately, explicitly and locally. Maximum 16
registered aliases; duplicate alias, duplicate source target or conflicting
legacy default is invalid. Do not infer registration from OpenAPI or inventory.
No registration, picker, catalog or config format is added now.

D3. One private Resolver must supply QR begin, QR poll, profile session status
and lookup. Resolve the authorized alias once per transaction, retain its binding,
and validate that exact binding before effects and before publishing results.
Never independently reselect by connected count halfway through a transaction.
No result may silently move to another source when its target disconnects.

D4. Bridge generation is an invalidation fence, not a native session epoch.
No observed stable account ID/session epoch exists. account_display can be masked,
reused or collide; hashing it does not solve that problem. Unknown identity
must stay unknown, not turn into a default/guest account. A prototype can prove
fencing over synthetic identity tokens; live cross-account guarantees remain
BLOCKED until stable identity/session evidence or an explicitly reviewed weaker
sampled-continuity contract is approved. No such waiver is supplied by MP-0.

D5. Keep deployment maintenance separate. Updates, supervisor, Cloudflare,
OpenAPI schema discovery and binary rollback stay deployment-level. A profile
never grants lifecycle authority. No new financial operation, supportedRange,
validatedVersions, remote route or permission change is authorized.

## Private Resolver contract (proposed, inert)

```typescript
// Design types only. No caller can construct or serialize a lease.
type ProfileOperation = "qr.begin" | "qr.poll" | "session.status" | "lookup";
interface ProfileResolver {
  resolve(request: {
    alias?: string;
    operation: ProfileOperation;
    authority: AuthorizedCaller; // server-produced after existing context policy
  }): Promise<PrivateProfileLease>;
  validate(lease: PrivateProfileLease): Promise<void>;
  invalidate(alias: string, reason: InvalidationReason): void;
}
```

The implementation must own opaque leases, not trust structurally similar input.
Private lease contains registration revision, alias, Bridge boot nonce, monotonic
profile generation, exact artifact/operation fingerprint, fixed endpoint identity,
parent process binding, source ID/provider/number, worker binding, account evidence
strength/value and session state. Authority includes operation, verified context,
minimal principal/audience when available, local deployment scope and policy revision.
Never expose IDs, hashes of account data, native paths, cookies or lease contents.

Resolution sequence: existing Host/Access/operation checks -> validate bounded
alias input -> explicit alias/default mapping -> check profile grant -> bounded
identity/source/account snapshot -> immutable lease. Unauthorized and nonexistent
aliases return the same generic denial without native reads or catalog disclosure.
All requests forbid arbitrary endpoint, source/worker/account IDs and extra fields.
Profile API wire shape is deferred; MP-1 uses private inputs only.

`validate` observes the same target and compares registration/policy/boot/generation
and private identity. Mismatch discards results, invalidates active flows and
cache entries, and never invokes another target. Proposed internal errors:
PROFILE_DENIED (unauthorized/unknown), PROFILE_SELECTION_REQUIRED (ambiguous
omission), PROFILE_STALE (identity/generation drift), PROFILE_UNAVAILABLE
(unreadable/removed target). These names are design requirements, not current
Bridge error codes. Keep LOGIN_REQUIRED for a uniquely bound disconnected target
on lookup, QR_FLOW_INVALID/REPLACED/EXPIRED/LIMIT for authorized flow failures,
and deployment status unknown on unsafe observation. Public errors contain no
native explanation. No automatic login, rebind, retry or repair follows denial.

## Identity and invalidation lifecycle

| Identity/evidence                                 | Required treatment                                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alias + registration revision                     | Stable Bridge identity until explicit disable/remove/re-enroll; never recycle alias for a different account                                                                                                                       |
| Native instanceId / instanceNo / provider         | Private observed association, not proven persistent across restart. Match all; reuse/removal/renumber/provider drift invalidates                                                                                                  |
| Parent PID/path/creation + artifact tree          | Runtime identity; PID alone insufficient. Restart, version/tree/contract/config/transaction drift fences all leases in that deployment                                                                                            |
| Worker PID/restartCount/state                     | Snapshot evidence only; native worker creation unavailable in current adapter. Any observed change invalidates; unreadable required worker proof blocks live enrollment                                                           |
| Account display/kind/state, saved-login/L2 notice | Sensitive continuity signals, not unique identity. Do not store display or derive a public account fingerprint. Disconnect/account/saved-login/entitlement drift invalidates outstanding results; L2 loss never triggers fallback |
| Session epoch                                     | Unproven upstream property. Bridge boot/generation cannot detect A -> B -> A changes entirely between samples; explicitly retain this blind spot                                                                                  |

Registration starts disabled/unbound. Explicit local enrollment binds one alias
and expected account evidence; it must never auto-enroll the first connected
source. Enable only after validation; suspend on any identity ambiguity. Remove
purges its flows, queries, tombstones' sensitive metadata, grants and caches;
retain only bounded non-sensitive terminal state as needed. Re-enable/rebind is
an explicit reviewed operator transaction with a new registration generation.
Bridge restart invalidates all memory leases, UUIDs and grants; do not silently
resume saved flows. Source absence does not authorize creating/restoring a source.

A disconnected QR enrollment may receive a different account at connected
completion. Future code stages that observation privately, invalidates old leases,
and requires the expected-account enrollment gate before making the profile
available. Already-bound account replacement is denied. No machine can enroll.
Same-account on two aliases, two native IDs for one account, display collisions
or unknown identity must be denied as an unresolved mapping, not deduplicated
by display. MP-1's strong account tokens are explicitly synthetic.

## Permissions, legacy behavior and migration

| Surface                                              | local                                                                   | remote_human                  | remote_admin                                                        | remote_machine                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Existing legacy status/capabilities/QR               | Preserve current operation gates                                        | Preserve current safe surface | Preserve current JWT + POST Origin/intent gates                     | Denied                                                               |
| Existing lookup / machine OpenAPI                    | Allowed under current gates                                             | Denied                        | Denied                                                              | Allowed under current machine JWT/registry gates                     |
| Future private alias resolve in MP-1 offline harness | Explicit synthetic operation grant                                      | Denied                        | Denied                                                              | Denied                                                               |
| Future live per-profile QR/status                    | Local operation + explicit alias grant, after separate integration task | Deferred/default deny         | Deferred/default deny; admin has no implicit all-profile grant      | Denied                                                               |
| Future live per-profile lookup                       | Local lookup + alias grant after separate integration task              | Denied                        | Denied                                                              | Deferred/default deny until separately reviewed machine-alias policy |
| Profile CRUD/enrollment/logout/restore/saved-login   | Outside MP-1 live scope                                                 | Denied                        | Denied                                                              | Denied                                                               |
| Update/apply/qualification                           | Existing deployment policy                                              | Existing read-only updates    | Exactly existing four maintenance operations, apply grant unchanged | Denied                                                               |

Operation permission and profile grant are AND conditions. Neither a chosen
alias nor local UI selection grants an operation. Remote profile work must
separately review Host, exact app AUD/issuer/time/RS256, fixed JWK source,
Origin/CSRF and the top-level page/static gate. Ordinary remote-human context
currently has no Bridge-verified subject for principal-bound flow ownership;
do not pretend it does. Preserve its single-owner legacy deployment behavior;
future remote alias routing needs a reviewed authority binding. This does not
require introducing a multi-user deployment in MP-1.

Future flow ownership is alias + generation + operation + caller scope + audience
where applicable + boot nonce + opaque UUID. Cross-owner poll fails before any
native POST. Terminal lookups require the same ownership checks to avoid an
existence oracle. Apply confirmation remains deployment/plan/principal/AUD-bound;
if any future operation becomes profile-scoped its grant must also bind alias,
registration and generation, with single-use/TTL semantics. MP-0 adds no grants.

Migration is opt-in and never silently changes the deployed legacy path. With
no profile registry configured, preserve v1 and exact 2.0.5 behavior and schemas,
including QR server pin and lookup's one-connected rule. In a future enabled
mode, omission is accepted only for one explicitly configured legacy default
with a matching operation grant; never compute a default from current liveness.
One default for QR/status/lookup must reference the same target. Conflicting
old qrV2.instanceNumber and new mapping fail configuration validation. Multiple
registered choices without an authorized default fail closed. A disconnected
default yields LOGIN_REQUIRED/unknown for that target even if B is connected.
Do not expose profile selectors on existing remote schemas as part of MP-1.

## Isolation, caching and concurrency rules

Initially keep server profile result caching/deduplication disabled. If introduced
later, keys must include alias, registration/policy revisions, boot/generation,
process/source/worker/account lease identity, operation, validated input and
caller authority scope. Never key only by symbol, native flow number or URL.
Schema cache may share only exact artifact + operation-contract evidence;
profile readiness and authorization decisions may not ride that shared cache.
Browser keys add alias + server generation + local selection generation; switching
profiles aborts/removes affected queries, hides QR immediately and ignores late
begin/poll/status/lookup callbacks. No profile data in URL/localStorage/logs.
HTTP responses retain no-store; browser query memory is a separate cache boundary.

Keep the global QR mutex initially: reject concurrent begin/poll rather than
queueing hidden authentication. Serialize generation changes/result commit
atomically; a global QR mutation fences outstanding deployment queries because
cross-source auth effects are unproven. Profile QR registries cannot replace
another alias's flow silently. Per-profile parallel QR is deferred until native
independence is proven; tests must assert conservative denial. UUID reservation,
TTL, tombstone bounds and failed-replacement invalidation remain mandatory.
Read-only A/B operations may be simulated concurrently in MP-1, with explicit
barriers to prove late-result discard. No global mutable "selected profile".

## Machine-checkable negative matrix for MP-1

All inputs below use synthetic aliases A/B, private identity tokens, fake clock,
fake transport and call counters. None is current native acceptance. Each row
must assert normalized result, zero unauthorized upstream effects, no foreign
payload/error/cache state and bounded memory. Current suites provide baseline
pieces, not execution of this future matrix.

| ID     | Synthetic input / barrier                                                     | Required outcome                                                         |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| MP1-01 | QR/status/lookup with A and distinct B data                                   | Same A lease/target across all operations; no B response                 |
| MP1-02 | Missing alias, two registrations, no default                                  | PROFILE_SELECTION_REQUIRED; zero calls                                   |
| MP1-03 | Unknown/unauthorized alias vs existing unauthorized alias                     | Same PROFILE_DENIED; zero reads, no existence disclosure                 |
| MP1-04 | Duplicate alias/source/default or old pin conflict                            | Configuration denial before requests                                     |
| MP1-05 | A disconnected; B connected                                                   | A lookup LOGIN_REQUIRED; never B; QR legacy ambiguity guard preserved    |
| MP1-06 | Alias contains URL/port/native ID or extra selector fields                    | Input denial; no transport request                                       |
| MP1-07 | Begin A; poll UUID via B, wrong caller or wrong audience                      | Flow denied before native POST including terminal UUIDs                  |
| MP1-08 | Reused native flow number, UUID collision/tombstone                           | No UUID resurrection; failed allocation makes zero begin calls           |
| MP1-09 | Remove/disable/re-enroll A during delayed lookup/poll                         | Generation mismatch; discard late response; B remains isolated           |
| MP1-10 | Source ID removed/reused with same number, provider or worker changed         | PROFILE_STALE/UNAVAILABLE; no replacement target                         |
| MP1-11 | Parent PID reused with new creation / worker restartCount or identity changes | Fence affected deployment/profile leases and flows                       |
| MP1-12 | A account changes while source/PID remain constant                            | Discard result; suspend A; no cache publication                          |
| MP1-13 | Account missing, display collision or same account mapped twice               | Unresolved identity denial; no guess based on masked display             |
| MP1-14 | A -> B -> A between observations with no native epoch                         | Explicit unprovable guarantee gate; test cannot label live identity PASS |
| MP1-15 | Saved-login/L2 changed or level2_replaced_by_remote_login                     | Invalidate entitlement-dependent results; no implicit relogin/fallback   |
| MP1-16 | Begin A and begin B, or begin vs poll concurrently                            | Conservative global QR_FLOW_LIMIT for overlap; no second POST            |
| MP1-17 | A poll completes while B selected / UI cancel/unmount                         | Late result invisible; no selected-profile status/cache update           |
| MP1-18 | Same code requested for A/B; reversed completion order                        | Separate futures and results; no cross-profile dedup/cache hit           |
| MP1-19 | Registration/policy changes between resolve and publish                       | Atomic commit fence rejects stale lease even if transport succeeded      |
| MP1-20 | Begin failure after replacing A; late old poll; TTL boundary                  | Old flow remains terminal; no revival; bounded tombstones                |
| MP1-21 | Raw upstream message/QR/account/native IDs in error fixture                   | Public responses and logs expose only allowlisted enums/metadata         |
| MP1-22 | Machine attempts QR/status/CRUD or human/admin attempts lookup                | Existing context denial before Resolver/transport, regardless of alias   |
| MP1-23 | Unknown/forwarded Host, wrong AUD/signature, bad admin Origin/intent          | Existing policy denial before profile resolution                         |
| MP1-24 | v1/no-registry, legacy default, two-connected v2 without profile mode         | Existing schemas and behavior unchanged; ambiguity stays denied          |
| MP1-25 | Contract/artifact drift, oversized inventory/response, timeout                | Fail closed, no automatic retry, no fallback or trust expansion          |
| MP1-26 | Bridge reboot nonce changes / replay old lease or UUID                        | Invalid old lease/flow; no disk-restored authority                       |
| MP1-27 | QR on A coincides with delayed B lookup/status                                | Deployment fence rejects stale B commit; no claim of native independence |
| MP1-28 | Disconnected enrollment completes with unexpected account                     | Stage privately, deny profile activation until expected-account proof    |

## Smallest next step and independent human boundary

MP-1 is a separately authorized **offline local-only executable prototype**:
pure registry/Resolver with injected inventory, account/epoch evidence, clock,
identity and fake adapter ports; private lease and atomic commit fence; simulated
QR/status/lookup using that lease; bounded ownership-aware flow store; implement
MP1-01..28 and preserve all existing tests. No production runtime composition,
Bridge routes, actual config migration, picker, credential store, native POST,
real account enrollment, service lifecycle or remote profile selector. Its
acceptance is deterministic fixture PASS plus exact-head Ubuntu/Windows CI,
zero real transport/process calls and no production import/wiring. Additional
unproven epoch/account facts cannot be filled with fabricated native guarantees.
Future live integration is a subsequent task, not implied by prototype success.

**NOT_EXECUTED_REQUIRES_SEPARATE_APPROVAL** applies individually to: second
account login, simultaneous distinct-account continuity, source ID persistence
across restart, same-account duplicate behavior, saved-login isolation, L1/L2
independence/displacement, and any native epoch proof requiring authentication
or lifecycle mutation. Signing/replay/full rollback remain separately unqualified.

Proposed future procedure, not executable authority in MP-0:

1. A future integration task must first implement/review an alias-aware preflight
   and one-attempt harness. Run GET-only preflight; prove chosen private A/B
   mappings, safe counts, expected identity evidence, exact reviewed running
   build, loopback listeners and no drift. Current absent listeners stop here;
   this review grants no permission to start them.
2. Seek targeted authorization for the two non-secret aliases, possible logout/
   replacement or L2 displacement of the existing account, exact begin target,
   maximum 120-second polling window (shortened to existing QR TTL if lower),
   and explicit stop policy. No automatic retry or approval reuse.
3. Open local `http://127.0.0.1:17282/login`; the future reviewed UI must prove
   the chosen alias, require a readiness click, then issue exactly one approved
   begin for B. Operator alone scans/confirms; automation polls only its bound
   UUID until connected/terminal/deadline. Never repurpose the current single-pin
   Live command to guess B. MFA is recorded only if actually presented/completed.
4. Automatically run identity-bound A/B status and bounded lookup/negative
   checks; distinguish distinct-account proof from matching display text.
   Report L1/L2 separately. Stop on displacement, target/peer drift, missing
   identity, no readiness, expiry, malformed response or unexpected account.
   Cancellation stops polling/hides QR; it does not undo upstream login.
5. On failure retain redacted external receipt and stop. Do not log out, restore
   saved login, restart, switch sources or retry as an automatic "rollback".
   Any such recovery needs separate explicit approval. The exact future
   alias-aware continuation command must be supplied by that implementation
   before requesting Live approval; it does not exist today.

Exact safe automation resume command available now (GET-only, **no Live**):

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json -EvidenceDirectory D:\code\research\fqgate-205-qr-evidence\live-qualification\mp0
```

Its runtime-build gate may fail for later documentation SHAs; no redeployment
follows. MP-1 offline repeat command after its future tests exist:
`pnpm exec vitest run tests/profile-resolver.test.ts`; that file does not exist
in MP-0. Real alias-aware acceptance commands remain a prerequisite of the
future integration contract, not an invented runnable command in this review.

## Automated verification and receipts

Receipts/log hashes, UTC, commands, exits, retry commands and source/fixture
hashes are Git-external under the existing operator evidence root:
`D:\code\research\fqgate-205-qr-evidence\live-qualification\mp0`.
No raw account/source IDs, QR, tokens, configuration or profile data are committed.
Existing synthetic suites were executed; no speculative Resolver scaffolding or
new synthetic model was added. MP1-01..28 are specified, NOT_EXECUTED in MP-0.

Local Linux checks at reviewed source SHA: frozen install, typecheck, lint,
652 tests / 33 files, full build, format check and 19 browser E2E tests all
passed (each command exit 0); exact outcomes
are recorded in `quality.json`. Commands are `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check`,
`pnpm test:e2e`; rerun the same command from repository root. Native Windows synthetic preflight fixtures **28/28**, inline identity fixtures
**5/5**, and the no-approval/zero-QR guard **1/1** passed (wrapper exit 0):
`powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1`
and `node .\scripts\windows\test-fqgate205-qr-identity.mjs`. Rerun those same
commands with the process-local PATH/PATHEXT above. Source/scripts match the
existing compiled runtime baseline; no permanent-host build output was replaced.
Windows production build/loopback and further native behavior checks run in isolated existing CI, avoiding
writes to the permanent host's served build or starts on its listener ports.
The delivery receipt binds final document SHA and exact-head CI separately from
these reviewed-source runs. Green CI establishes source/fixture behavior only.

Native receipt `preflight-1792113336400.json`, exit 1, SHA-256
`e88f0c0ed3c17ac8f244cb4f7d3bdaf811749453411a2d581424ba1564814511`,
contains gate IDs, safe failure categories and rerun instructions. The missing
listener/process/session gates remain BLOCKED; real QR remains NOT_EXECUTED.
Git synchronization preserved the clean Windows runtime branch at `481db65`;
its direct fast-forward was refused because it diverges from squash-merged main.
The existing clean Windows main then fast-forwarded `f8c7b3a` -> `0df0d96`.
No reset/clean/overwrite/second Windows checkout was used. An initial native
Git lookup failed because Git was absent from PATH; WSL Git successfully
performed synchronization in the existing Windows working tree.

Completion means the source contract, negative matrix, bounded MP-1 handoff and
explicit verification outcomes exist. It does not mark unavailable native facts,
future implementation or any deferred human action PASS.
