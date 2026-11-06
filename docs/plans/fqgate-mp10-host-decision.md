# MP-10-B — next Windows host prerequisite decision

2026-11-06 Asia/Taipei. **PLANNING ONLY / HOST_BLOCKED / NOT_EXECUTED**.
No approval is requested by running MP-10-A. The
[MP-6 three decision sheets](../operations/windows-fqgate205-mp6.md) remain
drafts; [MP-9 evidence limits](../status/fqgate-mp9-handoff.md) still apply.
Historical missing listeners are not a current host observation.

## Decision: defer restoration until exact prerequisites are reviewed

| Required binding               | Current decision / prerequisite                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chosen native version          | UNKNOWN / NOT SELECTED. Preserve installed 2.0.6 history; neither 2.0.6 nor 2.0.7 is approved by release existence or fixture success.                                                                                                                                           |
| Installer / payload            | UNKNOWN for the next chosen target. Require fixed official repository, immutable release/manifest provenance, exact Windows x64 filename, byte size, installer SHA-256, extracted immutable tree and EXE SHA-256; separately record unsigned/publisher trust limitations.        |
| Bridge source / build          | Accepted main includes MP-9 at b33a441; MP-10 source/merge evidence is software validation only. Select a reviewed compatible full source SHA, lockfile/toolchain and separately built Windows artifact manifest before any future deployment. No candidate selected here.       |
| Preserved Windows lineage      | `D:\code\research\fqgate-remote-bridge`, `codex/fqgate206-compatibility`, `c06fbcff1db11179bdad95ab83c90e888aa62587`. Preserve `dist/.output`, private config and external builds.                                                                                               |
| Historical candidate           | `compat206-final-20261030`, 303 manifest entries in MP-6; historical manifest SHA-256 `feb3cfee7603fafee949913ea6d722cb347cebbb0d333326f03ec0895f72aedc`. Historical source comparison was partial, not full SSR reproduction or running provenance. Rehash before any decision. |
| Runtime provenance             | UNKNOWN here. Require current sole IPv4 loopback listener ownership, PID, exact executable ancestry, seven-digit native creation, parent/worker linkage and actual candidate/build manifest comparison. An environment-supplied commit claim is insufficient.                    |
| Strong native identity / epoch | UNPROVEN. Display text/hash, observed_at, PID/restart and legacy session_epoch cannot substitute. UNKNOWN keeps HOST_BLOCKED for this decision; observational checks may document blockers but cannot grant readiness.                                                           |
| Rollback / custody             | Full native storage/session rollback unqualified. Need reviewed complete mutable-root/IPC/port contract and exact backup/destination manifests; do not copy browser/credential state opportunistically.                                                                          |

The installed EXE hash in MP-6 is evidence of historical host bytes, not the
chosen installer identity. Do not fill UNKNOWN from a different artifact.
MP-9's exact-2.0.5 adapter is not a 2.0.6 admission. MP-8 real-byte candidates
continue to deny. No native install/start/repair command can be prepared safely
until the version, artifact, storage and runtime requirements above are resolved.

## Future narrowly authorized observation request

First obtain separate operator authorization naming the exact version/artifact,
reviewed source/build/config digests, host owner, bounded action and custody.
The operator must approve a concrete command and its expected side effects;
another general request to "restore service" is insufficient. Keep Bridge-only
foreground start, separate-output deployment and native remediation as three
independent decisions. MP-6 sheet 1's c06fbcf command is historical/reserved,
not a command to run against an MP-10 build. Existing lifecycle status can
delete a stale process record; do not use Dashboard, broad Bridge status or
`fqgate status` as non-mutating diagnosis.

Before and after any separately approved work: hash the permanent checkout
identity, output/candidate manifests, config and fixed native state/record files
privately; prove no reparse/ownership ambiguity or active transaction; preserve
original backups/evidence. Hashes must not expose account displays or secrets.
Resolve every mutable root and the exact rollback source/destination first.

Once a new task authorizes metadata observation, the existing collector can be
run from an exact-source staged tools directory under a 15-second parent limit:

```powershell
powershell.exe -NoProfile -NonInteractive -File `
  D:\code\research\<reviewed-tools>\fqgate205-mp6-host.ps1 `
  -RepositoryDirectory D:\code\research\fqgate-remote-bridge
```

`<reviewed-tools>` must be resolved and hashed by that task before approval;
this is a command template, NOT_EXECUTED here. Exit 0 means metadata returned,
not readiness. Missing/unreadable/timed-out categories stay UNKNOWN. State 0
is never LISTEN or proof of a free port. This observation cannot prove native
account identity, provider state or a running build solely from a checkout.

For a separately reviewed **exact-2.0.5** target only, resume the established
GET-only triage from staged reviewed source after all its version gates hold:

```powershell
node .\scripts\windows\fqgate205-mp5-triage.mjs `
  --config D:\code\research\fqgate-acceptance-config.json `
  --profiles D:\code\research\fqgate-mp2-profiles.json `
  --evidence D:\code\research\<new-reviewed-evidence-directory>
```

Do not run that diagnostic against 2.0.6/2.0.7 with changed expectations to
force PASS. A different version requires reviewed version-specific tooling.
Before approval, bind its exact GET allowlist: loopback `/openapi.json`,
`/v2/system/version`, `/v2/system/health`, `/v2/source-instances`,
`/v2/source-instances/<privately pinned Source>/account` and
`/v2/source-instances/<privately pinned Source>/authentication`, plus the
Bridge provenance-only `http://127.0.0.1:17282/api/v1/version`, with existing
bounds and redirect denial. No search, QR begin/poll, authentication action or mutation; the
`authentication` GET reads supported modes only. Any
remote/certificate GET must be separately listed by exact configured host and
path; default deny it in the proposed local-only census. The existing triage
wrapper's broader edge probes must be disabled by a reviewed tool change or
explicitly included in that later authorization, never assumed local-only.

Expected observations: exact chosen payload/state and attested running build,
one owner on each intended `127.0.0.1:17281/17282`, coherent Source/worker/creation
and account samples, unchanged protected files. Current requests do not assert
those facts. Exit 1/BLOCKED is a diagnostic finding, exit 2 a tooling/custody
failure; neither is acceptance PASS. GET evidence is sampled continuity,
not an atomic identity/epoch guarantee or live multi-account isolation.

## STOP, rollback and separate account boundary

One attempt, no automatic start/recovery or retry. STOP on unknown version,
installer/build/config drift, state-0/absent/duplicate/wildcard/IPv6 listener,
unknown PID/path/creation, Source recreation, payload WebView contamination,
reparse/path race, unreadable evidence, active transaction, unexpected writes,
account/Saved Login/L2 drift or any QR/MFA/provider prompt. Preserve failed
receipts and return HOST_BLOCKED; do not kill/adopt/repair an unknown owner.

For a future approved foreground Bridge-only start, rollback may stop only
that task's owned process and reselect the intact previous artifact, followed
by listener/creation/file comparisons. No permanent output overwrite, stale
record restoration, native Quit/restart or provider session restoration is
implied. File rollback cannot undo remote requests, QR flows, native migrations,
provider sessions or entitlements. Never claim full native/account rollback.

Any real local/remote authenticated acceptance or A/B/QR/phone/MFA/Saved Login/L2
experiment needs its own owner consent, exact UI actions/commands, one-attempt
bounds and non-reversibility review. None are prepared or authorized here.
The native identity/epoch inquiry remains an unsent draft. Human authorization
is needed to grant new host/account authority, not to finish this CI PR.

## MP-11 prerequisite update — 2026-11-06

MP-10-A is independently reviewed and merged as PR #38 at
`52e0620a7cbb8b89e34eadbb12e1095cfaa77b49`. Its CI fidelity gap is closed;
this does not close any native prerequisite. Issue #39 authorizes only the
[MP-11 offline delta](fqgate-mp11-contract-delta.md). The earlier sections and
MP-6 sheets remain planning-only; the table below updates their evidence,
not their authority. **HOST_BLOCKED; no runtime target selected.**

| Gate                  | Newly resolved offline fact                                                                                                                                                                              | Still required before a concrete host decision                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact candidate bytes | Reused MP-7 207 ZIP 32181584 / SHA `6a6a43aea7380cd5e3c5c6f6e271140d78bb3a978a8711e2d0a4f64dfe253dcf`; EXE 60748288 / SHA `b9f4194db9ac6cad5b62e932ceddd90dcc21332152927f6ab348b50941d67a31` reverified. | No chosen target. Exact full tree/build-info/required plugin hashes and Windows layout must be bound in any later decision; a matching ZIP is not installation approval. Release assets are not GitHub-immutable.   |
| Client contract       | 207 localApi equals 206 byte-for-byte; QR slice differs only at the main bundle import filename.                                                                                                         | Imported dependencies, actual native v2 OpenAPI/schema/fingerprints, 503/timeout semantics and source-specific behavior UNKNOWN. Never copy 205/206 fingerprints.                                                   |
| Bridge source/build   | Main contains MP-9 security repair and MP-10 synthetic-merge attestation. MP-11 changes no production source.                                                                                            | Reviewed exact-version adapter/tooling, full Windows build/toolchain/lockfile/output manifest and actual running provenance; c06fbcf historical build is not latest-main or 207 acceptance.                         |
| Identity/epoch        | Static account UI uses display/saved-login labels; legacy query-pool epoch cannot prove v2 account identity.                                                                                             | Stable native per-account identity and Source lifetime/monotonic login epoch with documented restart/relogin semantics, or an explicitly narrower separately reviewed experiment. No display/hash/PID substitution. |
| Storage/IPC/rollback  | No new isolation or rollback contract discovered in the bounded slices.                                                                                                                                  | Complete mutable roots, credential/session/IPC/port ownership and protected before/after manifests, migration behavior and rollback limitations. No opportunistic copying or session restoration claim.             |
| Trust/expiry          | Pinned bytes are unchanged; MP-7's no embedded Authenticode observation still applies.                                                                                                                   | Publisher key/signing input/bootstrap/rotation/revocation/replay/30-day expiry policy remains unverified. Any exception must be separately concrete, not inherited from the historical 205 trial.                   |
| Current host          | No current listener/process/local API observation performed in MP-11.                                                                                                                                    | Separately approved metadata-only collection first; then reviewed version-specific GET census only after host/command/allowlist/custody approval. Absent historical listeners are not a new finding.                |

### Operator approval sheet — draft, NOT APPROVED

This is a fill-before-request record, not a request for blanket restoration.
No start/install/repair command exists until the unresolved target and native
contracts above have been reviewed. Do not run a placeholder or old 206 script.

| Required field               | Decision-ready requirement / current value                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Why automation cannot finish | Static client bytes cannot prove current listener ownership, running build, provider identity/epoch, native storage migrations or authenticated publisher trust. Exact missing facts are in the MP-11 matrix.                                                                                    |
| One action and owner         | NOT SELECTED. Separate metadata observation, foreground Bridge start, deployment and native remediation into distinct approvals. First possible request is metadata-only observation, without localhost API traffic or any process action.                                                       |
| Target/prerequisites/command | Bind host owner, exact native version/payload/tree, reviewed tools/source/build/config digests and literal resolved command. The metadata collector template above must be staged and hashed in the later task. No wildcard target, broad lifecycle status or pin replacement.                   |
| Impact/protection            | Name exact read/write paths, owned process if applicable, maximum duration and expected traffic. Hash c06fbcf checkout, existing dist/.output/candidate, config and fixed native records before/after privately; protect prior receipts and credentials.                                         |
| Expected result / criteria   | Metadata exit 0 means collection, not readiness. Independent missing categories stay UNKNOWN. Any subsequent census must prove exact sole IPv4 owner/native creation/build and unchanged protected files before interpreting sampled contracts. Strong account isolation remains separate.       |
| STOP / failure               | One attempt, no automatic retries. Stop on version/hash/reparse/ownership drift, absent/duplicate/state-0/wildcard/IPv6 listener, native prompt, account/session change, unexpected write, timeout or unreadable evidence. Preserve failure and HOST_BLOCKED; no kill/adopt/repair.              |
| Rollback limit               | Metadata-only action has no runtime change to undo; preserve failed receipt. Future owned foreground process rollback may stop only that approved process and reuse intact prior output. Files cannot reverse provider sessions, migrations, account/QR actions or entitlement effects.          |
| Resume automation            | For metadata-only collection, rerun only its pinned approved command after the cause is reviewed, writing a new receipt. Version-specific GET tooling and its exact resume command require a separate reviewed task; 205 triage is prohibited against 206/207. No account experiment is implied. |

The next executable path is independent MP-11 review, then offline native
contract/trust review or a separately bounded metadata-only task. Sending the
draft upstream inquiry, native starts or any real account step remains separately
unauthorized. No human action is necessary to complete MP-11's offline PR.
Keep
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
