# Exact 2.0.5 Native Source contract — MP-4

Reviewed 2026-10-23, Asia/Taipei. **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.
**NO-GO for production multi-account integration**. Read-only investigation and
engineering readiness do not authorize a native authentication experiment.

## Provenance

- P1: publisher [README](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/README.md)
  and [使用说明](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/使用说明.md),
  re-read at immutable commit `1b56f62816b8347b871bc5a3f927148fae212eb9`.
  These document desktop launch and account-dependent entitlements. Main native
  program implementation is not the public Agent/plugin implementation.
- P2: pinned [2.0.5 release envelope](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/2.0.5/release.json),
  re-read and decoded without claiming signature verification. Windows ZIP:
  `FQGate-2.0.5-windows-x64.zip`, 29,236,811 bytes, SHA-256
  `c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba`.
  MP-3's package directory review remains historical; no ZIP installation here.
- P3: current installed EXE re-read without executing it: 53,590,016 bytes,
  SHA-256 `d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847`.
  Bundled local API slice offset 35,975,307, length 3,560, SHA-256
  `018d033fbbbcec18beca176edea3aa8fc8cdbb272292bcac4068ee3add4ef55a`;
  UI slice offset 37,707,250, length 20,498, SHA-256
  `359e0ab1428081d539a82bb3f740c5100dd3060122c42c5e58c927f90f55f3bc`.
  Existing `verifyInstalledQrClient` checks these exact bytes in preflight.
  Account rendering near byte 36,365,531 was inspected in the same hash-pinned
  EXE; this is static client behavior, not native implementation source.
- P4: current native GET `/openapi.json`, 2026-10-23T06:43:38.990Z, SHA-256
  `908e7d808649c7321cbde0fea4329f94d5cdec41bdc1293c248702c18f9a1c73`,
  100 schemas. Receipt saves only schema field/type/reference names and fixed
  route names, not the document or account responses. Preflight separately
  verifies scoped fingerprints QR `1cc165c2086e6eece42f8a79b2ade2d13ffd7bf33edfec21d771e3c76cd87103`
  and lookup `V2_LOOKUP_FINGERPRINT` in the unchanged adapter.
- P5: current Windows MP-4 GET-only receipt and hashes under
  `D:\code\research\fqgate-mp4-evidence`; results in the
  [handoff](../status/fqgate-2-0-5-mp4-readiness-handoff.md).
- P6: [MP-1](../status/fqgate-2-0-5-mp1-implementation-handoff.md),
  [MP-2](../status/fqgate-2-0-5-mp2-implementation-handoff.md),
  [MP-3](../status/fqgate-2-0-5-mp3-feasibility-handoff.md). Prior account/QR
  outcomes, process topology and package scans remain historical observations.

## Evidence matrix

CONTRACT_PROVEN applies only to the exact published statement or client behavior
cited. OBSERVED applies to sampled structure/state. Neither implies native
server semantics. FIXTURE_ONLY describes injected guards. UNKNOWN/UNPROVEN
remain explicit missing contracts; BLOCKED names an unmet measurement prerequisite.

| Question                                  | Evidence / classification                                                                                                                                                                                                                                                                                                     | Conclusion and limit                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable non-display account ID per Source  | P3 account UI consumes display/session/L2/Saved Login; P4 `AccountSnapshot` has only `state`, `account_display`, `session_kind`, `level2_access`, `saved_login`, `observed_at`, `session_notice`. OBSERVED structure.                                                                                                         | **UNPROVEN**. No reviewed authoritative account ID. Equal names, hashes of names, Source numbers or displays cannot identify the account. Unknown added identity fields are rejected, never silently trusted.                                                      |
| Native monotonic Session Epoch            | P4 has observation time, no reviewed login generation/epoch.                                                                                                                                                                                                                                                                  | **UNPROVEN**. `observed_at`, process creation, worker restarts, Bridge generation and checkout SHA are different quantities. Equal snapshots cannot exclude A → B → A; even very frequent polling cannot qualify this guarantee.                                   |
| Source selection and lifecycle            | P4 `SourceInstanceView`: `instanceId`, `instanceNo`, `providerId`, `pid`, `restartCount`, worker/session state, `autoLogin`, `defaultGuest`, queue/resource fields. P3 client creates a temporary Source, fetches its authentication descriptor, removes it on cancel/failure. CONTRACT_PROVEN client calls, OBSERVED schema. | Selection is Source-scoped; stable numbering/ID across removal/recreation/restart is **UNPROVEN**. MP-4 only observes existing Sources. An ordinal/ID is not a durable account identity.                                                                           |
| Saved Login actions and storage           | P3 exact local API slice includes `logout`, `clear_saved_login`, `restore_saved_login` as account actions, plus separate instance deletion. P4 `SavedLoginSnapshot` requires only `available`; display/session-kind/L2 fields are optional.                                                                                   | Client action vocabulary is **CONTRACT_PROVEN**; independent credential namespaces, restore target, persistence, cancellation undo and isolation are **UNPROVEN / NOT_EXECUTED**. `available=true` is not restoration proof. No action sent.                       |
| L2 semantics                              | P1 says L2 depends on existing account entitlement. P3 UI maps `level2_replaced_by_remote_login` to an informational L2→L1 downgrade notice. P4 allows nullable L2 flag and notice.                                                                                                                                           | Entitlement dependency and client notice interpretation are **CONTRACT_PROVEN**. Trigger timing, absence of notice, simultaneous account independence and actual L2 data validity remain **UNPROVEN / NOT_EXECUTED**. A true flag alone is not an L2 query result. |
| Two account Sources and peer displacement | P5 checks pinned existing A/B mappings, expected states and account/worker changes twice.                                                                                                                                                                                                                                     | **OBSERVED** only where current gates complete; displaced/account/L2/Saved Login differences reject publication. Same-account duplication, real second-account coexistence and hidden A→B→A remain **UNPROVEN / NOT_EXECUTED**.                                    |
| Native ownership                          | P5 fixed listeners, repeated CIM PID+creation+parent+executable and ancestor attributes; Source workers must be direct children, created no earlier than parent.                                                                                                                                                              | **OBSERVED** continuity where readable. Reuse, unstable listener/ancestry, unreadable identity or reparse/symlink path fails closed. No new transitive WebView ownership claim. Parent PID equality alone is insufficient.                                         |
| Independent process port                  | P1/P2 reviewed desktop instructions contain no supported per-process bind override. P6 byte scans are only historical hints; no `--help` or guessed flag is executed.                                                                                                                                                         | Supported independent loopback-port interface **UNKNOWN**. Bridge upstream base URL does not configure FQGate's bind port. **NO-GO** for process-per-profile implementation.                                                                                       |
| Complete independent storage root         | P1/P2/P3 give no supported contract covering all Source/Saved Login/SDK caches, WebView, singleton/mutex/IPC/plugin/updater scopes. P6 saw one parent and one UI WebView directory, not all storage.                                                                                                                          | **UNKNOWN** independently of the port question. Separate directories/OS processes would not prove provider-side session/L2 isolation. No copying, root edits, second process or process exit performed.                                                            |
| Publisher/build trust and rollback        | P2 envelope/hash pins and P3 installed-byte match identify the reviewed artifact.                                                                                                                                                                                                                                             | Signature/replay and complete native session/storage rollback remain **UNPROVEN**. A matching digest is not a verified publisher signature.                                                                                                                        |

## Decision and smallest next investigation

Retain single-account production and the exact current adapters. Native Sources
are the smallest empirical research option because they already exist. A
separately reviewed one-attempt login to existing B while observing peer A could
measure visible displacement and persistence, but cannot establish stable
identity, a monotonic epoch, complete Saved Login isolation or L2 correctness.

The [future protocol](../operations/windows-fqgate205-mp4.md) requires a new
POST-capable change and explicit authorization. MP-4 contains no reachable POST
mode. A draft upstream question, **NOT SENT**: for exact 2.0.5, what documented
fields provide non-display account identity and monotonic authentication epoch;
what are Source ID/number persistence, Saved Login and L2 displacement scopes;
and is independent port plus complete storage/IPC configuration supported? Request
exact field/flag semantics and versioned examples, not a guessed workaround.
