# Windows MP-6 — read-only repeat and independent operator decisions

Host: **WORK-PC**. Permanent checkout:
`D:\code\research\fqgate-remote-bridge`. Owner: existing interactive Windows
operator. Authorization: [Issue #28](https://github.com/blooddrunk/fqgate-remote-bridge/issues/28).
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**; multi-account **NO-GO**.

## Read-only repeat

The permanent checkout has later, unmerged 2.0.6 work at
`c06fbcff1db11179bdad95ab83c90e888aa62587`. Preserve it. The MP-6 engineering
branch comes from merged main `97aea578...`; do not switch the Windows branch,
build there, overwrite `dist/.output`, or change expectations to 2.0.6 just to
pass a 2.0.5 diagnostic. Original MP-5 custody paths are currently unavailable;
revalidation of that original receipt is NOT_EXECUTED. The historical handoff
remains historical.

Use the existing diagnostic scripts and outputs, whose hashes are in the new
external receipt. The following command writes only new redacted receipts:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
node .\scripts\windows\fqgate205-mp5-triage.mjs `
  --config D:\code\research\fqgate-acceptance-config.json `
  --profiles D:\code\research\fqgate-mp2-profiles.json `
  --evidence D:\code\research\fqgate-mp6-evidence-20261106
Write-Output "Native readiness exit=$LASTEXITCODE"
```

Expected **exit 1 / BLOCKED**, not acceptance PASS. Exit 2 means tooling,
receipt or preservation failure. The wrapper independently reports native and
Bridge listeners, exact client, state, lock/transaction, payload, process record,
WebView, build, scoped readiness, continuity and protected files. It also runs
the existing MP-2/MP-5 and QR GET-only checks. No Live mode or POST is added.

The MP-6 metadata collector is standalone PowerShell. For this delivery only
reviewed scripts and inert fixtures were copied to the external evidence tools
directory; nothing was staged into the permanent outputs. Verify their hashes
against the final delivery receipt before repeating:

```powershell
powershell.exe -NoProfile -NonInteractive -File `
  D:\code\research\fqgate-mp6-evidence-20261106\tools\fqgate205-mp6-host.ps1 `
  -RepositoryDirectory D:\code\research\fqgate-remote-bridge
$mp6Config = Get-Content D:\code\research\fqgate-acceptance-config.json -Raw | ConvertFrom-Json
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp3-native.ps1 `
  -CurrentDirectory (Join-Path $mp6Config.installDirectory 'fqgate\current')
```

Collector exit 0 means metadata was returned; its readiness remains BLOCKED.
UNREADABLE service/task/process/TCP categories stay separate. It reads only
presence of three fixed environment variables at Process/User/Machine scopes,
not another process's environment or secret values. Relevant Node invocations
are **candidates**, including diagnostics, never proof of a running Bridge.
TCP state 0 is UNKNOWN, not LISTEN or proof of a free port. Collection is sampled,
not an atomic history of exits. Repeat metadata before/after the diagnostics;
an absent process cannot supply a creation baseline.

Bounds: 32,768 processes / 64 selected, 256 selected TCP rows, 8,192 service/task
records / 64 selected each / 32 actions per task. No raw CIM paths, command
lines, task/service names or environment values are serialized. MP-5 file,
request and child-process bounds remain in [its procedure](windows-fqgate205-mp5.md).
The standalone native collector should be run under a bounded parent (15 seconds
for this delivery); an unavailable/timed-out invocation is NOT_EXECUTED/UNKNOWN,
never converted to an empty successful census.

## Evidence and diagnostic caveats

External Windows custody: `D:\code\research\fqgate-mp6-evidence-20261106`.
Linux control/build custody:
`/home/jelinenaro/research/fqgate-mp6-evidence-20261106`.
Commands, UTC, elapsed time, exits, logs/hashes, tool copies, source archive,
isolated builds, provenance comparison and final head/CI binding stay there.
Use aggregate protected-file digests publicly. Never publish private Source
IDs, displays, hashes of displays, config contents, raw native commands or
credential/browser files.

`sourceSha` in MP-5 is the **host** checkout; command-runner receipts separately
identify the **engineering** checkout. Final delivery binds both. Build info
reads `FQGATE_REMOTE_BRIDGE_COMMIT_SHA` at runtime; it is not an embedded signed
source attestation. Compare the actual candidate against its whole manifest,
then compare an independently rebuilt source inventory. Cross-platform map
paths, dependency paths, timestamps and chunk names prevent claiming an exact
SSR reproduction from partial matching files. Never execute/import an existing
server bundle to discover its version.

Seven-fractional-digit creation is mandatory in the corrected standalone
record classifier; zero-padding a lower-precision value is not proof. The
permanent old diagnostic is not overwritten with that correction. Read-before/
after file snapshots and path checks detect sampled changes, symlink/junction
ancestors and unreadability; they are not Windows handle-relative atomic open
or a complete defense against malicious concurrent reparse/rename/hardlink
changes. Stop on suspected path races. Browser contents are never read to
resolve a placement failure; an existing WebView entry invalidates an immutable
payload even when no live WebView root can be attributed.

GET counters count attempted transport calls, including failures and
unauthenticated Access certificate/edge checks, not just HTTP 200s or authenticated
remote acceptance. Fixed zero-mutation counters describe reviewed diagnostic
paths, not a machine-wide syscall trace or autonomous application traffic.
Child failure/truncation before a reduced receipt can lose counter information;
in that case counts are UNKNOWN, never a claimed zero. No GET-count patch was
needed for the successfully returned current receipts.

## Decision sheet 1 — existing-output-only Bridge foreground start

**RESERVED / NOT_EXECUTED / currently BLOCKED.** Independent approval required;
not implied by either other sheet. Proposed owner: interactive WORK-PC operator.
Proposed artifact:
`D:\code\research\fqgate-bridge-builds\compat206-final-20261030\.output\server\index.mjs`.
Config: existing `D:\code\research\fqgate-acceptance-config.json`.

Observed pre-state: 17282 absent, no attested running bundle; native 17281 also
absent. Candidate manifest has 303 matching files, but current host is 2.0.6,
not the MP-6 branch's exact 2.0.5 adapter. The manifest's source claim is c06fbcf;
independent reconstruction is partial, not full SSR identity proof. Starting
could restore Bridge availability; it does not restore FQGate or A/B readiness.

**Additional blocking side effect found by static review:** existing
`NativeManagedProcessController.status()` removes `process.json` when the
recorded PID is not running. Bridge status/capability requests call lifecycle
status; the Dashboard and remote clients can issue them after a start. A GET
method alone does not make this old runtime path non-mutating. Do not run
`fqgate status`, open the Dashboard, or use a broad status probe as MP-6 diagnosis.
This is an existing runtime behavior, not changed by this diagnostic PR.

Prerequisites for a new approval: reconcile the preserved 2.0.6 source/build
lineage, explicitly decide the known lifecycle cleanup side effect (or separately
review its correction), bind the chosen manifest/config hashes, manifest and
back up the exact private state/record to an operator-controlled location,
confirm no unknown owner/transaction, and document native-session expectations.
No approved new backup or record-restore procedure is asserted by MP-6.

Only after those prerequisites and a separate approval, reserved foreground
command for the **existing** artifact (there is no start script in this directory):

```powershell
Set-Location D:\code\research\fqgate-bridge-builds\compat206-final-20261030
$env:HOST = '127.0.0.1'; $env:NITRO_HOST = '127.0.0.1'; $env:HOSTNAME = '127.0.0.1'
$env:PORT = '17282'; $env:NITRO_PORT = '17282'; $env:BRIDGE_PORT = '17282'
$env:FQGATE_REMOTE_BRIDGE_CONFIG = 'D:\code\research\fqgate-acceptance-config.json'
$env:FQGATE_REMOTE_BRIDGE_COMMIT_SHA = 'c06fbcff1db11179bdad95ab83c90e888aa62587'
& 'C:\Program Files\nodejs\node.exe' .\.output\server\index.mjs
```

Expected: exactly one owned `127.0.0.1:17282` listener and bounded version GET
matching the reviewed source claim; native remains independently blocked until
separately resolved. Side effects: remote human/admin/machine availability,
in-memory QR state initialization, possible client requests/lifecycle cleanup.
No FQGate/service/Cloudflare action or account attempt is included.

STOP on state-0/unknown, wildcard/IPv6/duplicate owner, unexpected PID/build,
native incarnation change, new transaction, unexpected write or remote client
side effect outside the approved plan. Do not retry. Rollback is Ctrl+C only
in this owned foreground terminal, followed by listener/creation and file
comparisons. No runtime files were replaced; file restore cannot undo sessions,
remote requests or erased in-memory flows. Never restore a stale process record
as a claim of valid ownership. Repeat the safe commands above; their subsequent
protected-file baseline must remain unchanged after any explicitly approved
changes have been separately accounted for.

## Decision sheet 2 — separate-output Bridge deployment if necessary

**RESERVED / NOT_EXECUTED / BLOCKED_SOURCE_VERSION_RECONCILIATION.** Owner:
interactive WORK-PC operator plus candidate reviewer. Proposed output location,
reserved and not created by MP-6:
`D:\code\research\fqgate-bridge-builds\mp6-reviewed-candidate`.
Preserve the current 303-file candidate and all historical builds in place.

No deployment is currently necessary to complete diagnosis. The new MP-6 build
is a main/2.0.5 diagnostic validation artifact, not a replacement for the
preserved 2.0.6 branch. There is no selected, approved replacement source SHA
or source-bound Windows candidate; therefore copy/replace/start commands for
this sheet are **NOT PREPARED**, not guessed. The existing-output command in
sheet 1 must not silently switch to the MP-6 build.

A future task must bind one reviewed compatible SHA, frozen lockfile/toolchain,
isolated CLI and SSR outputs, full relative-path/size/SHA manifest (including
extras), config/secret custody, exact source-to-artifact comparison, startup
side-effect review and both-platform CI. Build without targeting permanent
`dist/.output`; designate the exact destination before seeking deployment
approval. Use only that named candidate in a foreground invocation with every
loopback/port variable from sheet 1. An already running owner requires a
separate, exact Bridge-only replacement decision; do not kill an unknown owner.

Expected effects: Bridge-only output activation/availability and volatile
session loss on replacement, plus the reviewed lifecycle side effects. No
native process or storage migration is included. STOP for absent approved
manifest/backup, dependency/config drift, incompatible 2.0.6 contract, path links,
unexpected listener/writes or any native account drift. Rollback selects the
unchanged prior artifact only after stopping this task's own foreground process;
do not copy old files across new output or touch native records. The earlier
artifact may itself remain incompatible/unavailable; rollback is availability
restoration only, not account/storage rollback. Run the same safe GET-only
repeat and independent protected-file comparison after the approved action.

## Decision sheet 3 — native payload / process record / WebView remediation

**RESERVED / NOT_EXECUTED / BLOCKED_UPSTREAM_STORAGE_CONTRACT.** Owner:
interactive WORK-PC operator; upstream-supported native procedure required.
Affected paths, privately resolved from existing config:
`installDirectory\fqgate\current`, `state.json`, `process.json`, and any
documented external mutable root. Never print the config or browser contents.

Observed pre-state: installed state and EXE are 2.0.6; exact 2.0.5 client/state
gates MISMATCH, one WebView entry under current payload, no live FQGate owner.
Record PID 27884 has seven fractional digits and matching expected executable
path; comparison with a current native owner is **UNKNOWN**, not the historical
MP-5 stale-PID/three-decimal result. Active WebView placement is UNKNOWN with no
native descendants. A/B mapping parses but no live Sources can be read.

Necessary prerequisites: owner chooses whether the next task targets preserved
2.0.6 or an explicitly reviewed 2.0.5 rollback; fixed artifact verification;
supported full mutable-root/IPC/port contract; observed graceful Quit/exclusive
ownership; exact backup/source/destination manifest, custody and restore limits;
then a fresh approval for each named start/repair/record action. **No native
repair/start/relocation/record-adoption command is supportable today.** Do not
invent flags, change expected hashes, write a live PID, delete the WebView entry,
copy credential files or reuse historical one-shot recovery scripts.

Expected future observations must independently satisfy exact chosen payload,
state, PID/path/seven-decimal creation, external live WebView root, listener,
Source topology and continuity gates. STOP for unknown root/port support,
ambiguous owner, unknown transaction, missing backup, Source recreation,
unexpected account/MFA/L2/Saved Login change or any unplanned side effect.
Native Quit/relocation/reinstallation can invalidate provider sessions and
entitlements; file rollback cannot reverse those actions. Full native
session/storage rollback is unqualified, so no restore command is fabricated.
After any separately approved action, rerun the safe commands above. The 2.0.5
diagnostic will still correctly fail on 2.0.6; interpreting a different target
requires a separately reviewed version-specific contract.

These three sheets do not authorize a login experiment. Strong native identity,
monotonic epoch, Saved Login/L2 and complete independent storage/port remain
unproven. [Upstream inquiry draft](../plans/fqgate205-mp6-upstream-inquiry-draft.md)
is NOT SENT. Engineering/CI success cannot change that decision.
