# MP-9 production continuity design

2026-11-06. [Issue #34](https://github.com/blooddrunk/fqgate-remote-bridge/issues/34).
This repairs sampled observable continuity, not native identity or isolation.

## Reviewed evidence and production boundaries

The existing adapter pins exact version 2.0.5, nine-file tree
`9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f`
and five-contract/transitive schema fingerprint
`3d9ca6c84a7b0cb75c3caae5eaf39cf4bb047a4c40d013202984bcad12b0ebe6`.
The unchanged identity port verifies the pinned payload/state, process and sole
IPv4 loopback listener. Native ownership/worker creation evidence is not added.

Fixed GET families remain version, health, inventory, Source account and
instrument search, plus `/openapi.json`. Accounts are read for **every** listed
Source before and after search (max 16 per sample). A one-Source success remains
11 GETs; two Sources require 13; absolute maximum is 41. All are sequential,
redirect-denied, each bounded to 64 KiB except the existing 4 MiB OpenAPI cap.
No authentication, mutation, fallback, retry or caller-controlled Source exists.
A failing stage suppresses subsequent requests and publication.

Native schema provenance is the [MP-4 exact contract review](fqgate205-mp4-native-source-contract.md),
P3/P4 and its `AccountSnapshot`, `SavedLoginSnapshot`, `SourceInstanceView` field
inventory, corroborated by the existing exact-2.0.5 QR parser. MP-8 synthetic
lifetime/native creation fields are **not** native requirements and are not
imported. Source account metadata is an in-memory allowlisted projection only.

| Boundary               | Validation / comparison                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory              | At most 16 entries, safe unique IDs, bounded provider/worker strings, safe nonnegative ordinal/restarts, positive unique worker PIDs and unique provider+ordinal; required boolean autoLogin/defaultGuest; supported session state              |
| Selection              | Exactly one connected Source across inventory; selected provider tonghuashun and worker ready; no peer/default guessing                                                                                                                         |
| All Source continuity  | Compare sorted ID/provider/ordinal/PID/restart/worker/autoLogin/defaultGuest/session state; additions/removals and changed incarnations deny                                                                                                    |
| Account descriptor     | Required boolean session_supported/saved_login_supported; unique bounded action list from logout/restore_saved_login/clear_saved_login; compare canonical order, selected session_supported must be true; no actions executed                   |
| Snapshot               | State must agree with inventory. Compare optional nullable account_display, session_kind (user/guest), level2_access and session_notice (known replacement notice only)                                                                         |
| Saved Login snapshot   | Required boolean available; compare optional nullable display/kind/L2. No restoration/storage namespace assumption                                                                                                                              |
| Displays               | Nonblank, at most 128 characters, no control/format characters when present; never trim/normalize into an account identity                                                                                                                      |
| Observation time       | Required bounded timezone-qualified parseable time; Bridge policy allows at most 30 s old / 2 s future and no per-Source regression. Excluded from identity fingerprint; advancing time is allowed. This freshness policy proves no login epoch |
| Unknown account fields | Reject unknown descriptor/snapshot/saved-login/top-level account keys, including credentials or purported new identity fields; no raw field or value in errors                                                                                  |
| Search                 | Existing envelope/count/size/data-state/exact-code checks and four-field public projection; explicit partial coverage now denies (native unknown coverage remains supported)                                                                    |
| Final fences           | Full post-search peer snapshot, version/health/contract, process identity, then deadline check before any result is returned                                                                                                                    |

The native schema allows absent/null display, kind and L2 fields. Their absence
is not malformed when optional. Changes between absent/null/present values are
compared; no trusted account ID is invented from any of them. Missing descriptor,
snapshot, Saved Login availability or observation time denies. Unavailable or
malformed peer evidence denies the entire lookup, even if selected data is valid.

## Deadline and cancellation

Start a monotonic five-second deadline before initial identity. HTTP timeouts
and native request-timeout headers receive only the remaining milliseconds.
A real timer bounds an uncooperative identity/HTTP promise; every completion is
checked before parsing, another call or publication. Final identity is included.
Parsing/fingerprinting time consumes the same budget; checkpoints reject overrun.
No partial response is released. Identity exceptions are reduced to the existing
PROCESS_IDENTITY_MISMATCH category; deadline failures are UPSTREAM_UNAVAILABLE.

Existing HTTP transport cancels its own timed-out fetch; the read-only identity
port has no cancellation API and its subprocess retains its own bounded timeout.
A deadline rejects the lookup and fences late work; it cannot forcibly cancel an
arbitrary identity promise or preempt synchronous JavaScript. No service/process
actuator is introduced to cancel it. Late completion cannot issue more HTTP or
publish data. The timer is cleared on every terminal path. Test clocks separately
model elapsed time and UTC snapshot freshness.

## Limits / decisions

Unchanged samples cannot detect same-display A→B→A, a recreated Source with all
identical visible fields, or hidden changes between observations. Sequential
samples are not atomic, including the interval after the last account sample.
There is no authenticated stable native account ID, monotonic login epoch or
trusted Source lifetime. Worker restart/PID evidence is observable continuity
only; `MarketQueryPoolStatus.session_epoch` is not consumed as a login epoch.
Saved Login namespace/L2 isolation, current host ownership, real-local/remote
acceptance, publisher trust and full native rollback remain unqualified.

v1 supportedRange `>=1.0.0 <2.0.0`, 2.0.5 artifact/client/contract pins, QR/status,
registry, route, configuration and remote permissions are unchanged. Lookup
remains local + remote_machine only. MP-8 admission stays unreachable, its
real-byte ledger always denies. Preserved Windows 2.0.6 is not integrated.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
