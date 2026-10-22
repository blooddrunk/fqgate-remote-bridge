# FQGate 2.0.5 MP-2 implementation and native evidence

Date: 2026-10-22, Asia/Taipei. **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.
Scope: read-only evidence and tools; no production Resolver integration.

## Delivery custody

Initial WSL checkout: clean `codex/fqgate205-mp1-offline-resolver`, tracking
origin at `2777a63`. Fetched with prune; remote main is MP-1 PR #20 merge
`20b5e3b3a16505e296f125cb5d3a8043f55c6441`. Clean main fast-forwarded from
`0df0d96`; branch `codex/fqgate205-mp2-native-preflight` created there.
No reset, clean, force push, second checkout or runtime replacement.

The PR binds its final source SHA and exact-head CI. Git-external receipts under
`/home/jelinenaro/research/fqgate-mp2-evidence-20261022` record commands, exits,
output hashes, native results and delivery/CI URLs. Permanent Windows receipts
are under `D:\code\research\fqgate-mp2-evidence`. Documentation does not assert
that the final source commit is deployed. Historical runtime `481db65` remains
the separately approved 2026-10-15 single-source QR baseline.

## MP2-A native identity investigation

Evidence comes from existing production source, MP-0/MP-1 contracts, exact
installed 2.0.5 client bytes and fixed native GET/CIM observations. No upstream
runtime implementation source is present in this repository; bundled client
code and OpenAPI cannot prove server-internal account/session guarantees.

| Evidence                                                     | Classification and implication                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native source ID and instance number                         | OBSERVED in GET inventory. These select a source, not an account. Persistence across deletion/recreation/renumbering remains UNPROVEN; deterministic rejection of those changes is FIXTURE_ONLY.                                                                                 |
| Parent/worker PID and restartCount                           | OBSERVED. Native CIM also exposes creation time, executable path and parent PID. Both observed workers are direct children of FQGate using the same executable. Restart count alone cannot detect PID reuse.                                                                     |
| Process creation                                             | OBSERVED through `Win32_Process.CreationDate`, including seven fractional digits retained internally. A changed creation string invalidates sampled continuity even when PID stays equal. Process creation is not a session epoch.                                               |
| Account snapshot                                             | OBSERVED keys: state, account_display, session_kind, level2_access, saved_login, observed_at; disconnected source omits some optional fields. No reviewed non-display account ID is available. Account names/values are neither persisted nor hashed into purported credentials. |
| Saved login                                                  | OBSERVED field names: available, account_display, session_kind, level2_access (optional values). Its presence does not prove storage or account isolation. No restore/clear action was run.                                                                                      |
| Native session epoch                                         | UNPROVEN. `observed_at` is observation time, not login generation. No reviewed epoch/counter/event-stream contract proves all authentication transitions. Unexpected identity fields fail closed rather than becoming trusted credentials.                                       |
| A → B → A between samples                                    | UNPROVEN and inherently invisible to equal discrete snapshots without an authoritative epoch. MP1-14 and MP2-05 demonstrate this limitation with fixtures. Parent/worker creation and Bridge generations do not repair it.                                                       |
| Same-account multi-instance / distinct-account dual-instance | NOT_EXECUTED. Matching masked displays cannot identify duplicates. No real second-account login was authorized. Synthetic fencing is FIXTURE_ONLY.                                                                                                                               |
| L1/L2 and displacement                                       | NOT_EXECUTED for concurrent native accounts. level2_access/session_notice are observations, not proven independent entitlements. Never interpret absent notice as proof that another source was unaffected.                                                                      |

Current read-only Windows observation: 17281 has one `127.0.0.1` owner; 17282
is absent. Two ready workers exist: source number 1 connected, number 2
disconnected. No account value, native source ID or WebView profile content is
included here. Running Bridge identity and live method denials are BLOCKED
because the Bridge port is absent; no process was started to clear that gate.
The complete diagnostic's gates and hashes are in the external receipt. Historical
remote acceptance is not current remote availability.

## MP2-B implementation and limits

`src/fqgate/diagnostics/profile-preflight.ts` is independent of the MP-1 modules
and production runtime. A strict private diagnostic config maps 1..16 opaque
aliases to exact source ID + number + expected connected/disconnected state.
Missing, duplicate, unregistered inventory, ambiguous or drifted mapping denies;
there is no inferred default or connected-source fallback. Config enrollment is
only a diagnostic file, never native source creation or production registration.

The Windows wrapper accepts only Config/Profiles/EvidenceDirectory, with no Live
flag. Its collector reads listeners and minimal CIM process facts. The existing
exact payload, installed-client, process-record/creation and WebView-separation
checks are reused without repair. Native paths/bindings remain private; receipts
contain profile ordinal, bounded status/booleans, worker PID/creation/restart
metadata, reduced gates, build commits and tool hashes. Display strings and their
hashes, account material, QR, cookies, tokens and raw responses are excluded.

Fixed GET targets: Bridge version and wrong-method lookup/QR routes; FQGate
version, health, OpenAPI, inventory, mapped account and authentication descriptor.
No market-data request or QR polling POST is sent. Real running build is read
from the version endpoint and checked against both explicit expected runtime SHA
and checkout SHA, then rechecked after sampling. The listener's native process
identity is sampled too. This is trusted local runtime self-report plus native
ownership, not cryptographic build attestation. A known old runtime SHA cannot
be substituted for current observation. Source/checkouts matching is not a
deployment instruction.

GET responses: 64 KiB (OpenAPI 4 MiB), 5-second transport timeout, 60-second
aggregate diagnostic deadline, at most 16 sources/profiles. Native subprocesses
have 15-second/16-KiB bounds; reused identity subprocesses retain their existing
5-second bounds. Aggregate timeout/cancel suppresses publication; already-started
GET/native reads may finish within their own bounds. No retry or write follows.
Two equal full source/account/worker samples prove only sampled continuity.

Exit 1 is intentional even with healthy transport: the reviewed native contract
cannot fill MP-1's strong account/epoch ports. Exit 2 indicates invalid tooling,
arguments/configuration or failure to save a receipt. No green exit is offered
by supplying fabricated identity fields. Engineering test PASS and native
OBSERVED are distinct from integration readiness.

## MP2-C verification

`tests/profile-preflight.test.ts` covers mappings, duplicate/unknown sources,
worker/PID creation/parent/restart/source recreation and renumbering, display,
L2/saved-login and unexpected epoch drift, A-B-A blindness, injected identities,
reversed A/B GET completion, malformed/no response, timeout/cancellation/late
result, missing and non-loopback listeners, runtime mismatch and full four-context
operation matrix. Every scenario has assertions, including zero writes and
secret-free results. Existing MP-1 reversed lookup and account/epoch fencing
tests remain unchanged; no synthetic native proof is invented.

`tests/mp2-live-model.test.ts` executes a test-only specification: approval and
readiness missing -> zero begin/poll; approved fixtures -> at most one begin,
bounded polling; build/process/alias/source/account/epoch/state drift, timeout
or cancellation -> safe stop. No network adapter or production CLI can call it.
Its account/epoch tokens and successful login are **FIXTURE_ONLY**.

The native collector fixtures are added to both-platform CI's Windows step,
alongside the existing QR and v2 behavior fixtures. The prototype import/I/O
audit still forbids production paths into MP-1. Existing v1/v2, Host/JWT/Origin,
remote-human/admin/machine suites remain required. Local command exits and
final-head CI results are bound in the external delivery receipt; browser E2E
runs on Ubuntu, not native Windows, under the existing workflow.

## MP2-D next-stage decision

**Decision C for production integration:** native account/epoch/dual-account
contracts are insufficient. Preserve the current single-connected-source
production policy and evaluate process-level isolation only in a separately
authorized design. Process isolation itself does not prove separate saved-login
storage or upstream same-account/L2 independence.

**Decision B for further empirical research:** a separately approved real account
experiment can investigate displacement/persistence/saved-login/L1/L2 behavior;
it cannot solve the unobservable A-B-A problem by repeated sampling. A blanket
Decision A (ready to plan native production profile integration with MP-1's
existing strong guarantees) is not supported. A publisher-provided stable opaque
account identity plus monotonic login/session generation and documented isolation,
or a separately reviewed weaker research contract, would change that assessment.

The [Windows procedure and executable specification](../operations/windows-fqgate205-mp2.md)
provide exact safe commands, approval contents, stop/resume rules and future
experiment steps. No current experiment approval, deployment or real QR is
implied. All real multi-account and account-write experiments remain NOT_EXECUTED.
