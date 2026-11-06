# MP-7 versioned evidence and MP-8 admission design

2026-11-06. **CONTRACT_REVIEWED** means bounded static/source review, never live
compatibility. **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / PROD_NO_GO**.

## Sources and their limits

P1: official application Releases
[2.0.5](https://github.com/fqgate/FQGate-releases/releases/tag/fqgate-v2.0.5),
[2.0.6](https://github.com/fqgate/FQGate-releases/releases/tag/fqgate-v2.0.6),
[2.0.7](https://github.com/fqgate/FQGate-releases/releases/tag/fqgate-v2.0.7),
and [Agent 2.0.7](https://github.com/fqgate/FQGate-agent/releases/tag/fqgate-v2.0.7).
Release notes describe publisher intent; they are not wire/semantic acceptance.

P2: immutable release repository `3434783820aa2623bb0b74d1f3643ef6941aa5ec`:
[legacy root](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/releases/stable.json),
[freshness](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/releases/v2/freshness.json),
[sequence 10](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/releases/v2/10/stable.json),
[2.0.7 release envelope](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/releases/v2/2.0.7/release.json).
Observed SHA links authenticate neither publisher nor freshness. Public keys,
canonical signing input, rotation/revocation and authenticated replay remain
unestablished. Release sequence 8/9/10 and current refresh sequence 11 are claims.

P3: current official [README](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/README.md)
and [operator guide](https://github.com/fqgate/FQGate-releases/blob/3434783820aa2623bb0b74d1f3643ef6941aa5ec/使用说明.md).
Agent [migration guide at 90f8499](https://github.com/fqgate/FQGate-agent/blob/90f8499c12f9a5366f11e43e183532410ec5eb66/docs/升级到-2.x.md)
separates legacy/v2 channels, requires full application directory, disallows
credential copying and warns that default ports collide. It does not document
independent port/full storage/IPC isolation. The publisher describes 30-day
package validity from build time and possible exit on failed network/update
validation. No authenticated expiry/bootstrap policy has been established here;
package age does not authorize bypassing checks or explain the host's exit conclusively.

P4: current main exact 2.0.5 source, [MP-4 static/native ledger](fqgate205-mp4-native-source-contract.md),
[MP-6 host evidence](../status/fqgate-2-0-5-mp6-host-handoff.md).
Historical live 2.0.5 results retain their original scope and dates.

P5: preserved WORK-PC `codex/fqgate206-compatibility` at
`c06fbcff1db11179bdad95ab83c90e888aa62587`. Read-only objects/diff and static
contract/handoff reviewed; no cherry-pick, merge, host fetch/switch or execution.
Its claimed 2.0.6 live measurements are historical branch evidence, not rerun
or admitted by main. Direct main-to-branch diff includes missing MP-6 files and
unsquashed equivalent MP-5 history; it is not a patch to apply wholesale.

P6: exact official 2.0.7 ZIP: bounded existing `auditV2Archive` verified published
32,181,584 bytes / SHA below, 10 entries, 68,296,393 uncompressed bytes, required
x64 PE headers, safe paths/CRC/limits; audit temporary directory removed. Separate
quarantine archive retained outside Git mode 0600 for static byte reads only.
No package member extracted to an executable location or executed/imported.
`FQGate.exe`: 60,748,288 bytes,
`b9f4194db9ac6cad5b62e932ceddd90dcc21332152927f6ab348b50941d67a31`.
Updater: 1,294,848 bytes,
`17977279ccdb65ac6f5c4675ff20a8f22104936a50324cb530ce41f2e92afd1c`.
Both PE certificate tables have zero size. This observes absence of embedded
Authenticode; no catalog/publisher signature verification was performed.
Build-info claims `platformSigned=false`, plugin 0.2.25, build ID
`20261030T165757Z`; these are package claims, not commands executed by this project.

## Release identity matrix

| Version | Published UTC        | Stable sequence | Windows ZIP bytes | Windows ZIP SHA-256                                              | Main admission                                |
| ------- | -------------------- | --------------- | ----------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| 2.0.5   | 2026-10-12T05:22:42Z | 8               | 29236811          | c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba | Historical exact single-Source lookup/QR only |
| 2.0.6   | 2026-10-26T17:44:42Z | 9               | 31185651          | cebbcd42eda73f518080af7457783f4647f69c1c32451409854ff070fd81453f | DENIED; separate unmerged branch              |
| 2.0.7   | 2026-10-31T03:03:54Z | 10              | 32181584          | 6a6a43aea7380cd5e3c5c6f6e271140d78bb3a978a8711e2d0a4f64dfe253dcf | DENIED / runtime NOT_EXECUTED                 |

Agent 2.0.7 published `2026-10-31T03:53:09Z`, same Windows ZIP size/digest.
Legacy `releases/stable.json` still reads **1.0.5**, a separate channel.
Versioned envelopes: `releases/v2/<version>/release.json`; no v2 signature is
verified. The committed [observer receipt](../compatibility/fqgate-mp7-observation.json)
records URLs, UTC, source SHA, envelope hashes and manifest paths; no binary is vendored.

## Operation and native-contract matrix

| Contract                     | 2.0.5                                                                                                                                                 | 2.0.6                                                                                                                                                      | 2.0.7                                                                                                                     | MP-7 decision                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Market query                 | Historical exact GET `/v2/instruments/search?query=<six digits>`; private Source header; strict code/message/data and exact-code filter               | P5 reviews same route, parser requirements and private routing, new pins                                                                                   | P1 describes fixes to watchlist/Wencai/K-line/HK contracts; P6 client tokens only, no current v2 census                   | No new operation, no protocol fallback, no approval from notes                                                                                 |
| Response shape               | Mixed system/source objects and search envelope, row_count/data_state/coverage required                                                               | P5 records same defensive requirements; no complete old/new schema diff                                                                                    | Runtime UNKNOWN; public transport consistency claim is insufficient                                                       | Retain 256-byte input, 64-KiB/16-item output, strict UTF-8/enum/count checks                                                                   |
| HTTP 503                     | Main rejects non-200; malformed non-JSON 503 maps invalid response; JSON non-200 maps unavailable                                                     | Historical same parser                                                                                                                                     | P1: check empty client context every 300ms, at most four checks, then 503; no repeated market dispatch                    | Added JSON-503 negative regression; no Bridge retry; exact native numeric code UNKNOWN                                                         |
| Timeout/queue                | 5000ms shared HTTP deadline; native identity subprocesses separately bounded                                                                          | P5 retains budget                                                                                                                                          | New publisher delay consumes budget; Worker readiness is not query readiness                                              | Never stretch budget to mask compatibility failure                                                                                             |
| OpenAPI                      | Main lookup `3d9ca6c84a7b0cb75c3caae5eaf39cf4bb047a4c40d013202984bcad12b0ebe6`; QR `1cc165c2086e6eece42f8a79b2ade2d13ffd7bf33edfec21d771e3c76cd87103` | P5 claims lookup `617ac95aa71962842c9b552682e70459f00a5cd61147bb10557b95c7b9092ec6`, QR `7523bf89456396cdb6be5456692bf945c799dff8c7de434ab080843de1131cb7` | Current v2 fingerprint UNKNOWN / NOT_EXECUTED                                                                             | Never copy the 2.0.6/5 hash or label descriptions-only drift without full documents                                                            |
| Artifact/client pins         | Main tree `9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f`; exact EXE and two embedded client slices in qr-contract                 | P5 has separate exact EXE/tree/client slices, version-bound QR flow                                                                                        | P6 EXE above differs; 10 files versus old nine-file payload. No approved QR slices/tree                                   | No constant replacement or automatic latest selection                                                                                          |
| Source incarnation           | ID/number/provider/PID/restart count fenced; duplicate/ambiguous connected sources rejected                                                           | P5 preserves single connected Source rule; native listener authority changed                                                                               | P1 Worker/subscription fixes are claims; client contains Source API/action vocabulary                                     | Source ID/ordinal is not account identity; recreation/ABA still unproven                                                                       |
| Account identity             | Snapshot has display/state/session-kind; lookup only verifies connected state. It does NOT compare display changes                                    | P5 does not independently establish strong identity                                                                                                        | P6 account_id/client_account_id tokens near plugin/trading vocabulary, not proven native market-account contract          | Added characterization test confirms the current display-drift gap. Diagnostic A/B rejects observed drift; production lookup remains unchanged |
| Login epoch                  | No proven monotonic per-Source authentication epoch                                                                                                   | UNPROVEN                                                                                                                                                   | Packaged legacy OpenAPI has MarketQueryPoolStatus.session_epoch, not v2 AccountSnapshot; native v2 epoch remains UNPROVEN | Do not promote a token, observed_at, worker restart, or display hash into an epoch                                                             |
| Saved Login                  | Bundled client has clear/restore/logout vocabulary; isolation/rollback NOT_EXECUTED                                                                   | P1 changes protocol selection persistence for account/guest/restore; namespace/isolation UNKNOWN                                                           | P6 retains clear/restore actions in client; native isolation UNKNOWN                                                      | No action sent, no credential copies; flags are not restoration proof                                                                          |
| L2                           | Historical L1 may remain connected on L2 displacement; correctness/isolation unqualified                                                              | P1 says L2 full-range/book fixes and additional queries                                                                                                    | P1 explicitly leaves cross-day raw L2 and intraday long-load acceptance unfinished                                        | No L2 qualification from ready/connected/true flags                                                                                            |
| Worker/subscription lifetime | Sampled PID/restarts do not prove hidden session continuity                                                                                           | P1 says ownership, receipt/disconnect races, memory/cancel/exit fixes                                                                                      | P1 says failed subscription cleanup/session separation fixes                                                              | Long-lived push/load/cross-Source semantics NOT_EXECUTED; no subscriptions opened                                                              |
| HTTP/SSE/MCP                 | Existing read-only Bridge HTTP slice only                                                                                                             | P1 AI text normalization                                                                                                                                   | P1 standard fields/error alignment                                                                                        | No SSE/MCP proxy or extra permissions                                                                                                          |
| Trading                      | Always excluded by Bridge                                                                                                                             | P1 introduces default-off plugin trading switch                                                                                                            | P1 plugin trading query/rejection/confirmation changes; P6 packaged readme acknowledges optional plugin trading           | Public README/migration guide still say no trading: source discrepancy. Strong deny-by-default is mandatory even with upstream trading present |

P6 static legacy OpenAPI: offset 44,412,740, 756,270 bytes, SHA-256
`5e290042b606c548899a72328664ee73ee2856be53ae9005f62993914b2d8f2a`,
info.version **1.0.2**, 153 schemas. It lacks the required v2 operations;
computing a v2 operation fingerprint fails `OPENAPI_CONTRACT_MISSING`.
It is not a runtime 2.0.7 document. Its session_epoch is query-pool metadata;
monotonicity, Source/account binding, restart/re-login behavior and public availability
are unproven. No account field can be admitted from a binary token search.

## Preserved 2.0.6 reconciliation

The Windows tree is clean at c06fbcf; five 2.0.6/recovery commits follow historical
MP-5 commits also represented by main's squash. Full main-to-branch comparison:
43 files, 1734 additions / 1078 deletions. No edits applied.

Useful candidates for a separately reviewed MP-8: exact-version operation profiles,
version-bound QR bindings, exact seven-digit record/native creation and state/record
continuity; selected-source status; QR route method-denial correction. Review the
native LISTENER-only Windows table authority independently, including its assumption
that the selected table makes rawState 0 acceptable. Main's MP-6 state-0 UNKNOWN and
precision protections must not be discarded by importing the branch wholesale.
Retain the original MP-6 documents/tests and unconnected Resolver/import boundaries.
Global supportedRange remains `>=1.0.0 <2.0.0` in both histories.

The existing `compat206-final-20261030` build has a 303-entry manifest tied by the
start plan to hash `feb3cfee7603fafee949913ea6d722cb347cebbb0d333326f03ec0895f72aedc`.
MP-6 independently found 164 matching / 135 differing same-name output files and
3 filenames unique per side in a cross-platform rebuild. MP-7 rechecked all 303 candidate files plus the manifest/config against the
existing start plan successfully, and preserves those bytes and source claims; it does not import/start that candidate or upgrade this
partial reproduction to source attestation. Current running identity UNKNOWN.

## Proposed MP-8 admission (design only)

Use a reviewed exact-version registry, with separate entries per operation, never
semver-range widening or release-observer output as runtime authority. Each entry
must bind OS/architecture, exact package/executable/tree, bundled client hashes where
needed, selected method/path and transitive-schema fingerprint, parser/probe revision,
source/native identity policy and explicit evidence/qualification state.
Unknown version/artifact/operation denies before upstream query. Release observation,
static contract review, offline tests, native identity, local semantics, remote
acceptance and publisher trust remain separate axes.

Start with existing lookup only; QR/status changes require their own operation
review and no authentication POST is authorized by adapter development. Reconcile
2.0.6 commits individually on latest main, preserve MP-6 fixes, then investigate
2.0.7 through an approved runtime census only when an independently authorized
host exists. Reject 503/timeout, fingerprint drift, malformed result, duplicate or
reincarnated Source, and observed account drift without retries or partial output.
Any future account/epoch guard must cite a native versioned contract; without it,
claim only sampled single-Source continuity and keep multi-account NO-GO.
Do not enable an entry merely because offline tests pass. Require exact-head CI,
protected before/after receipts, native identity and bounded local semantic evidence
before proposing a separate deployment decision. Signed installer/anti-replay and
full session/storage rollback are independent gates; MP-8 must not claim them solved.
