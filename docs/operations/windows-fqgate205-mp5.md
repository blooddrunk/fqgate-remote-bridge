# Windows MP-5 — repeat and operator decision sheet

Host: **WORK-PC**, existing checkout `D:\code\research\fqgate-remote-bridge`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**. MP-5 authorizes GET/read inspection
and external receipts only. All mutation procedures below are reserved for a
separate reviewed task and explicit operator approval; no approval is requested
merely to finish this engineering delivery.

## Repeat

Use native PowerShell with the existing operator environment:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
node .\scripts\windows\fqgate205-mp5-triage.mjs `
  --config D:\code\research\fqgate-acceptance-config.json `
  --profiles D:\code\research\fqgate-mp2-profiles.json `
  --evidence D:\code\research\fqgate-mp5-evidence
$mp5Exit = $LASTEXITCODE
Write-Output "MP5 native readiness exit=$mp5Exit"
```

Expected native exit **1 / BLOCKED**, not PASS. Exit 2 means tooling, argument,
receipt or preservation failure; stop and investigate that specific command.
The receipt combines the existing MP-2/MP-4 GET diagnostic and QR Preflight;
its command table records actual executable/argv, native exits, UTC and output
hashes. `sourceSha` is the checkout; `toolHashes` identify the loaded diagnostic
and adapter files; `runningBridgeCommit` is a current self-report only if its
listener/owner/build can be read. A missing Bridge reports null, never historical
expected `481db65097cd63ea0f9c28f39e526e341b700721` as a running build.
A response commit alone does not attest the on-disk served bundle.

`gates` gives detailed host conditions. Child `mp5.gates` and `qr.gates` retain
independent prerequisite reasons; aggregate readiness and A/B readiness stay
BLOCKED/false. Exactly two privately pinned Sources are necessary, insufficient
for a native account experiment. Expected states are A connected / B disconnected,
in reviewed private array order. Never rewrite expectations to get green output.
No Source identifiers, displays, their hashes, tokens, raw bodies or command lines
from CIM are saved. PID/creation are continuity fences, never account credentials.
GET counts include the QR diagnostic's unauthenticated edge/certificate GETs;
those do not prove authenticated origin/remote acceptance.

The wrapper automatically hashes every existing Bridge `dist` and `.output`
file plus private app config, mapping, install state and process record before
and after children. Public evidence contains only aggregate digests/counts and
change count. Unreadable/unsafe files cannot compare green. Mutable WebView
contents are excluded: their placement is inspected through native metadata;
a WebView entry inside the immutable payload blocks hashing that tree.
Bounds: ≤8192 protected entries, ≤128 MiB/file, ≤1 GiB total, 32 directory levels,
64 ancestor levels; receipts ≤64 KiB, child stdout/stderr ≤1 MiB and child deadline
120 s (native collector 15 s). Each MP-4 request retains 5 s/64 KiB (OpenAPI
4 MiB), total 60 s, cancellation/peer fencing and publication freshness checks.
This is sampled byte/metadata continuity; transient change-and-restore is not ruled out.

### Diagnostic artifact custody

Never build over permanent `dist/.output` or replace an existing diagnostic to
make this command runnable. MP-5 uses two **new** compiled modules,
`dist/fqgate/diagnostics/source-readiness-mp5.js` and `readiness-evidence.js`.
For this delivery these were added only after absent-path verification and
byte comparison of reused compiled dependencies with the reviewed Linux build.
Existing runtime files are hash-protected externally, including the older MP-4
compiled module. Source/scripts may fast-forward in the same clean permanent
checkout. Future differing/missing dependencies are TOOLING BLOCKED; review
custody before any deployment. This additive staging does not start Bridge.

### Per-gate non-mutating repeat

Run the triage command above for PAYLOAD (root placement/tree), STATE (active
artifact), INSTALL_LOCK/TRANSACTION, PROCESS_RECORD (private record vs native
owner with seven-decimal creation), and protected-file results. It prints enum
conditions without private record content. Root placement failure and exact
EXE/client success are separate facts. ABSENT means the file/listener is missing;
UNREADABLE includes unsafe paths/invalid bounded data; MISMATCH means known
bytes/path/layout differ; STALE means a record PID/creation differs from current
native owner; UNKNOWN means no trusted owner exists to compare. No missing value
is guessed from historical data.

For listener/owner placement and direct WebView metadata:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(17281,17282) } |
  Select-Object LocalAddress,LocalPort,OwningProcess
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp2-native.ps1
$mp5Config = Get-Content D:\code\research\fqgate-acceptance-config.json -Raw | ConvertFrom-Json
$mp5Current = Join-Path $mp5Config.installDirectory 'fqgate\current'
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp3-native.ps1 -CurrentDirectory $mp5Current
```

The MP-2 native collector returns executable paths privately to the diagnostic;
do not paste its raw output in public evidence. The MP-3 collector returns only
reduced topology/storage placement. No WebView files or credential blobs are read.

For BRIDGE_BUILD, QR_SCOPED_READINESS, WEBVIEW_PROFILE and RUNTIME_CONTINUITY,
repeat the independent baseline (each gate stays visible if prerequisites fail):

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json `
  -EvidenceDirectory D:\code\research\fqgate-mp5-evidence
Write-Output "QR Preflight exit=$LASTEXITCODE"
```

### Fixtures

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp2-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp3-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp4-cli.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1
node .\scripts\windows\test-fqgate205-qr-identity.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate-v2-observation.ps1
```

Fixture exit 0 proves injected behavior only. Linux runs full browser E2E;
**Windows browser E2E remains skipped** in CI.

## Operator decision sheet — reserved, NOT_EXECUTED

### 1. Missing Bridge listener

Affected: WORK-PC, Bridge only, permanent `.output/server/index.mjs`,
`dist/bridge/runtime-config.js`, existing external app config. Current verified
state: no 17282 listener; current Bridge owner/build unknown. Expected: exactly
one managed IPv4 loopback owner with independently reviewed build. MP-5 cannot
start it: that changes runtime availability and might load lifecycle code.

Proposed separate sequence, after staging/rollback review and explicit approval:

1. Repeat the listener/triage commands. Observe 17281 still owned by the same
   FQGate incarnation and no 17282 owner. If either changed, STOP.
2. Privately review the intended served bundle hash/build and existing config.
   Do not equate checkout HEAD or historical build with served output. If a
   replacement is needed, prepare an external manifest/backup and a specific
   Bridge-only candidate in the existing checkout before seeking deployment
   approval. No approved candidate/backup currently exists under MP-5.
3. For a separately approved **existing-output-only foreground start**, set
   `FQGATE_REMOTE_BRIDGE_CONFIG` to the reviewed external config path, then run
   `$env:FQGATE_REMOTE_BRIDGE_CONFIG = 'D:\code\research\fqgate-acceptance-config.json'`
   followed by `node .\scripts\start-bridge.mjs` in that foreground terminal.
   No service installation or background autostart is included.
4. Observe exclusive 127.0.0.1:17282, GET `/api/v1/version` matching the reviewed
   bundle, and run triage. Unexpected owner/build/port, startup write, or FQGate
   incarnation change is failure: terminate the owned foreground process with
   Ctrl+C and do not retry. Do not stop any unidentified service/process.
5. Availability rollback for that owned foreground start is Ctrl+C in its own
   terminal, then listener check and triage. There are no changed runtime files
   to restore in an existing-output-only start. A replacement needs exact
   candidate/backup paths and a new reviewed rollback procedure first.

Impact: Bridge availability/remote paths resume, while existing native account
sessions are intended to stay untouched. A start cannot promise no initialization
side effects; inspect the chosen bundle first. This procedure is **not** authority
to execute it in MP-5 and does not fix installation or account contract blockers.

### 2. Payload / process record / WebView

Affected: configured `installDirectory\fqgate\current`, `state.json`,
`process.json`, current FQGate parent/workers and descendant WebView storage.
Expected: exact immutable payload, matching native PID/executable/seven-decimal
creation record, external mutable WebView root. Current detailed findings are in
the [handoff](../status/fqgate-2-0-5-mp5-readiness-handoff.md).

1. Repeat triage; privately resolve configured paths without printing config.
   Compare INSTALLED_CLIENT, STATE, PAYLOAD, PROCESS_RECORD and WebView gates.
   A matching EXE alone does not permit rewriting state or adopting a PID.
2. Record the current parent/worker creation identities and storage-placement
   enums. Do not back up/copy live credential or WebView contents under MP-5.
3. Request a separately reviewed, exact-artifact native maintenance plan from
   supported upstream startup/storage guidance. No documented supported complete
   storage-root relocation contract currently exists; do not invent environment
   variables, move directories, edit process records or supply guessed flags.
4. Before that future task can ask for execution approval, it must bind exact
   source/destination/backup paths, verified artifact, operator-observed native
   Quit behavior, exclusive ownership, backup custody and restore commands.
   Those commands cannot safely be concrete today without that contract.
5. After any separately authorized maintenance, repeat triage and MP-3 metadata
   collection. Success requires independent tree/record/profile/continuity gates;
   unsafe/unreadable paths, ownership drift, unexpected source/account change or
   unavailable backup require immediate STOP. Never relabel failure as readiness.

Impact: quitting, relocating or reinstalling may disturb current login sessions,
Saved Login, SDK caches and L2. File rollback cannot undo provider session changes;
complete native storage/session rollback remains unqualified. MP-5 offers no
fabricated repair/rollback command for an unsupported relocation.

### 3. Native account experiment and upstream gaps

Affected: privately pinned A/B Sources/accounts on WORK-PC. Current A connected,
B disconnected does not prove distinct account identity; native non-display ID,
monotonic login epoch and Saved Login/L2 independence remain UNPROVEN. Supported
process-per-profile port and full storage/IPC root remain UNKNOWN.

No account action is proposed until host gates are resolved and a separate
alias-aware bounded runner is reviewed. The exact prospective one-attempt,
operator-visible phone sequence, success/failure/STOP rules, session/L2 risks,
rollback limitations and GET-only verification are already specified in
[MP-4's future protocol](windows-fqgate205-mp4.md#future-separate-authorization--design-only-not_executed).
Do not reuse the existing single-source Live runner, approve Saved Login/L2 by
implication, or infer a second begin after timeout. Stop on wrong account, missing
visibility, unexpected MFA/replacement, peer drift, unknown response or deadline.
Neither phone attestation nor GET can prove the missing upstream identity/epoch.

Draft upstream clarification, **NOT SENT**: please provide versioned 2.0.5
non-display account-ID and monotonic login-generation semantics; Source ID/number
persistence across recreation; Saved Login namespace/restore target; concurrent
L2/displacement rules; and supported independent loopback-port plus all
credential/cache/WebView/mutex/IPC roots. Give native server semantics and
supported examples. Client UI fields or distribution string scans are insufficient.
