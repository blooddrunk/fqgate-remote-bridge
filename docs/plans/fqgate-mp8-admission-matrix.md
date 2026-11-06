# MP-8 version × operation × evidence × decision

2026-11-06. Exact baseline: accepted main `2410e86334f9c498cd5a1023f06153e48407629b`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.

Later [MP-11 static delta](fqgate-mp11-contract-delta.md) identifies the exact
207 local API and QR slices without changing this historical admission registry.
Its null native 207 fingerprint and real-byte denial remain; no candidate is
activated. MP-9 separately repaired the production observable display-drift gap
described as unresolved in this historical document.

## Independent evidence axes

| Version                         | Operation                                               | Release observation                                                   | Static contract / byte evidence                                        | Offline qualification                                             | Current host / local / remote / trust                                        | MP-8 admission                                                   |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2.0.5                           | market.instruments.lookup                               | Historical MP-7 exact ZIP                                             | Main exact EXE/tree/client/five-GET fingerprint, copied as review data | Synthetic algorithm tested; real adapter drift gap reproduced     | Host NOT_EXECUTED; historical local/remote scope unchanged; trust UNVERIFIED | DENIED / INCOMPLETE_EVIDENCE; existing production gate untouched |
| 2.0.6                           | market.instruments.lookup                               | Historical MP-7 exact ZIP                                             | c06fbcf operation-profile pins, UNMERGED branch claims                 | Synthetic exact version tested; no branch code imported           | HOST_BLOCKED; no local/remote repeat; trust UNVERIFIED                       | DENIED / INCOMPLETE_EVIDENCE                                     |
| 2.0.7                           | market.instruments.lookup                               | Application + agent latest observed again at 2026-11-06T03:24:48.678Z | MP-7 package/PE; required tree/client/runtime fingerprint UNKNOWN      | Synthetic exact version tested; no native 2.0.7 document invented | HOST_BLOCKED / NOT_EXECUTED; trust UNVERIFIED                                | DENIED / INCOMPLETE_EVIDENCE                                     |
| 2.0.8+, unknown, latest, ranges | market.instruments.lookup                               | A newer release requests review only                                  | No registered exact operation evidence                                 | Negative version/default-denial cases                             | NOT_EXECUTED                                                                 | UNKNOWN / DENIED before query                                    |
| Any                             | QR begin/poll, status, account writes, trading, SSE/MCP | Irrelevant                                                            | No MP-8 operation profiles                                             | Negative inheritance/method cases                                 | No new authority                                                             | UNKNOWN / DENIED; existing production policy unchanged           |
| Explicit SYNTHETIC profiles     | market.instruments.lookup only                          | Not a publisher release                                               | Deliberately fake package/EXE/tree/client/document/lifetimes           | OFFLINE_CANDIDATE → fixture result                                | No native authority, runtimeQualified=false                                  | FIXTURE_ONLY; productionAllowed=false always                     |

Review records in `src/fqgate/admission/registry.ts` carry exact pins and sources.
The required bundled client is the reviewed local API slice; QR UI hashes do not
grant QR qualification. 2.0.7's unknown values are null, never filled from 2.0.5/6
or the packaged legacy 1.0.2 OpenAPI. Complete pin equality is insufficient:
real-byte profiles cannot execute. Observed hashes do not establish publisher
identity, authenticated release expiry or anti-replay.

Fresh GET-only observer: application/agent **2.0.7**, stable sequence 10,
repository `3434783820aa2623bb0b74d1f3643ef6941aa5ec`, legacy **1.0.5**;
comparison **UNCHANGED_UNAUTHENTICATED**, 10 GETs, exit 0. Public metadata is
still untrusted for compatibility. External `observer.json` binds command/log
and `observer.log` retains the full observation. Source links and release pins:
[MP-7 immutable-source matrix](fqgate-mp7-contract-matrix.md).

## P0 continuity and limits

Initial ordinary negative test failed at 2026-11-06T03:23:43.176283Z (exit 1):
production 2.0.5 returned an instrument despite pre/post account_display drift.
`tests/fqgate-v2-lookup.test.ts` retains an explicit `it.fails` regression, alongside
the earlier characterization. A passing expected-failure assertion means the
known gap still exists; it does not mean production was fixed. The isolated
candidate rejects the same scenario. Production patch design: separately review
strict bounded account parsing/comparison, peer/lifetime limits, deadline changes
and exact-version historical regression before any independent activation.

Candidate continuity includes all peers' visible snapshots (observation time is
freshness-only), Source ID/ordinal/provider/PID/restart count, synthetic Source
lifetime generation, worker native creation/parent, precise process record/state,
sole IPv4 listener with both families surveyed, version and transitive contract.
Source lifetime changes with identical IDs detect modeled ABA. Missing evidence,
state 0, rounded creation, duplicate Source/Worker, disconnect, malformed/partial
result, secret fields, 503 or deadline failure discard all results without retry.

No native adapter supplies a trustworthy Source lifetime or account epoch.
Synthetic lifetime tests establish the fence algorithm only. Same-display account
swaps, hidden A→B→A between samples and provider session changes with unchanged
visible data remain unobservable. Neither display/hash, observed_at, worker
incarnation nor legacy MarketQueryPoolStatus.session_epoch is a trusted native
account identifier or monotonic login epoch. A five-second total includes all
awaited work; abort/deadline checks reject late completion, but cannot cancel
arbitrary uncooperative injected code or undo an upstream effect. No live port is
implemented and no account action is authorized.

## P2 preserved 2.0.6 reconciliation (read-only)

Reviewed objects at `preserved/fqgate206` and permanent Windows branch
`codex/fqgate206-compatibility`: `c06fbcff1db11179bdad95ab83c90e888aa62587`.
Main-to-branch comparison is **62 files, +1729/-2551**: MP-6/7 files missing on
the older branch are not deletions to apply. No cherry-pick, switch or edit.

| Branch evidence                                                          | Reconciliation on latest main / MP-8                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fc1f6d6 exact 2.0.5/6 operation-profile, lookup/QR pins                  | Copy only provenance-tagged lookup review data; no production profile selection, no QR profile inheritance                                                                                                                                               |
| 6a0d9d6 LISTENER-only native table, both families, repeated native owner | Authority derives from the documented selected API, not raw state or HTTP. Main MP-6 CIM state-0 stays UNKNOWN. MP-8 has no native reader and conservatively rejects raw state 0 even in fixtures; alternative authority needs independent native review |
| Exact seven-digit record/native creation, byte-stable record/state       | Require precision in the fixture model. Preserve main MP-6 rounded-collision rejection; branch's older readiness-evidence deletion is explicitly not applied                                                                                             |
| QR Binding.version fences profile/flow changes                           | Useful separate QR security behavior retained on c06fbcf. No QR code or authorization change in MP-8                                                                                                                                                     |
| 5739ab0 selected-Source status                                           | Keep verified selected source distinct from legacy alias/provider network readiness. No production status rewrite or invented native account identity                                                                                                    |
| c06fbcf QR route ANY → policy method-denial                              | Keep branch fix intact. Do not replay route changes into lookup-only MP-8; record for separate integration review                                                                                                                                        |

Both main and preserved branch retain v1 `supportedRange >=1.0.0 <2.0.0`.
Existing main 2.0.5 production gates, QR and remote operation registry/config
are byte-audited unchanged. The branch's prior live claims are historical and
do not become latest-main host acceptance.
