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

Recommended next milestone: independent review of MP-10-A, then a separately
scoped exact-version prerequisite decision resolving these UNKNOWNs. Keep
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
