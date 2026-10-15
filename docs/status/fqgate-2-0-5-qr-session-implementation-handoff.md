# FQGate 2.0.5 QR/session compatibility

2026-10-15 continuation: **IMPLEMENTED_NOT_LIVE_QUALIFIED**. This section supersedes
the initial census conclusion below. One implementation branch / PR #18; no new
Issue or planning PR. Real QR has not been started by this task.

## Live-qualification audit continuation — 2026-10-15

PR #18 is merged at `f8c7b3a91f61f713025782411af4344ced3b4014`;
[main CI 38694726179](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38694726179)
passed. The clean development checkout was safely fast-forwarded before this audit.

Confirmed audit fixes reserve a non-tombstoned Bridge UUID before upstream begin,
serialize begin/poll across lifecycle selection and registry updates, invalidate
old flows before replacement, and reject responses that cross registry expiry.
UI generations discard late begin callbacks after cancellation/unmount and prevent
same-tick duplicate begins; begin has no automatic retries. v2 rejects connected
responses carrying a pending status, changes to sampled peer sources, guest
completion, and a different observed account on a previously connected target.
This is sampled continuity, not a native session-epoch or anti-replay guarantee.
The Live harness repeats the peer/account checks independently after completion.

Linux frozen install, typecheck, lint, **652 tests**, production build, format
and **16 browser tests** passed before delivery. New regression cases also run
against the merged baseline to retain failure identifiers outside Git. Exact
final-head CI, native Windows results and artifact hashes belong in the external
`live-qualification` receipts, not an inferred live-qualification claim.

Read-only native inspection identified Bridge PID 38140, created
`2026-10-14T02:14:47.0556360Z`, Node executable and exact working directory,
loopback 17282, the protected external acceptance config, and running commit
`3f78bb9948d95bf7ffb21809bba2baab283e7fed`. FQGate listener PID 34980 and
its creation time remain separate identities. cloudflared PID/creation were
readable but its native executable path was unavailable at current privileges;
no cloudflared operation is authorized or required. Full command lines and
process environments are never recorded; only selected non-secret bindings and
hashes are retained outside Git. An inspection helper needed PowerShell 5.1
split/path normalization corrections; those failed attempts changed no runtime.

`FQGATE_BRIDGE_BUILD_DIRECTORY` optionally directs Nitro production output to an
absolute staging directory. Default builds are unchanged. Build from the existing
permanent Windows checkout; stage payload only, never a second source checkout.
Preserve the existing served `.output` and rollback payload. Use only the
Bridge-only launcher `scripts/start-bridge.mjs`; `start-dashboard.ps1` also owns
FQGate lifecycle and must not be used for this deployment. Review the external
prepared deployment/rollback commands before approving any process stop.

Current task state remains **IMPLEMENTED_NOT_LIVE_QUALIFIED**. Bridge replacement
has not been approved by the task request; Live QR requires a second approval
after successful Preflight. Existing-socket local/remote regressions must retain
the old running SHA and cannot count as candidate acceptance. No FQGate/source,
config, network policy, Cloudflare, service/task or login mutation is implied.
The single next task is approval-gated Bridge deployment and real QR qualification;
shared-profile implementation must wait for that gap to close.

### Actual native preparation and baseline regressions — 2026-10-15

Implementation `2af40f4f34d09a723264609d9a254349bf030552` passed
[exact-head CI 38697400235](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38697400235)
on Ubuntu and Windows. Permanent Windows frozen install, typecheck, lint,
**652 tests**, a full production build into an independent payload directory,
format, **28/28** preflight behavior cases, **5/5** identity fixtures and **1/1**
no-approval Live guard passed. Ten added cases fail against merged baseline
`f8c7b3a`; all added cases pass after hardening. The final documentation head
and its own CI/artifact bindings are recorded separately in the external receipt.

At 07:20Z native read-only Preflight returned **20 PASS / 1 BLOCKED /
1 NOT_EXECUTED**. Only `BRIDGE_BUILD=RUNNING_BRIDGE_BUILD_MISMATCH` blocks it;
`LIVE_QR` is not authorized. Direct checkout lookup passed. At 07:21Z the existing
old-build socket again passed local **6/6** and real Vault-backed remote **22/22**,
including machine QR/admin denials. These are pre-deployment baseline results.
Post-deployment Preflight, Live and post-Live regressions remain NOT_EXECUTED.

Both staged candidate and previous payload passed isolated native IPv4 loopback
version/status smoke on temporary port 17283 at 07:22Z, then their test processes
exited. Original listeners/processes were preserved. A critical rollback
prerequisite was discovered: the previous bundle rejects the new `qrV2` config
key. The existing operator-protected pre-binding backup differs from the current
config **only** by that key and successfully starts the previous bundle. Bounded
rollback must point the previous process at that existing backup, without
replacing either protected file. Candidate uses the unchanged current config.
Both file hashes and all staged payload hashes are bound in external manifests.
This proves Bridge payload startup/read-only status, not FQGate version rollback.

The native repository's narrow fetch configuration required an explicit candidate
ref fetch and a non-tracking local branch. Git's failed tracking setup had already
staged exactly the candidate tree; index/tree equality and no unstaged differences
were verified before switching safely to that same commit. No reset/clean or
operator-file overwrite occurred. A PowerShell artifact-manifest helper failed;
its replacement hashes every regular staged file in native Node. Neither tooling
failure is counted as an acceptance pass or triggered process replacement.

External preparation, deployment approval script, manifests, per-command logs,
case identifiers, receipts and SHA-256 files reside under
`D:\code\research\fqgate-205-qr-evidence\live-qualification`.
`replace-bridge.mjs --approve-bridge-only` must not run until the operator approves
its precise old PID/build, candidate, temporary interruption and bounded rollback.
It verifies hashes/identity/config/source continuity, stops only the verified
Bridge, starts the staged candidate, and runs read-only Preflight. Approved
failure rollback can stop only that candidate and start the verified previous
payload with the existing pre-binding backup. FQGate/cloudflared, source records,
config files, services/tasks and network policy stay outside the action.
Real QR still needs a second approval and the operator's phone result.

## Resolved contract and exact scope

GET-only runtime OpenAPI is supplemented by static inspection of the **actual
installed executable**, without executing or saving its embedded client code.
The pinned nine-file tree is
`9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f`;
FQGate.exe is 53,590,016 bytes, SHA-256
`d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847`.
`qr-contract.ts` records independently checked byte offsets, lengths and SHA-256
for bundled `sources-DsI-NEke.js` and `localApi-BafuLJCn.js`. These establish
fixed POST authentication actions `app_qr_begin` / `app_qr_poll`, integer flow
handles, image/media fields, pending states `waiting_for_scan` and
`waiting_for_confirmation`, and boolean `connected` completion. The operation
plus transitive schema fingerprint is
`1cc165c2086e6eece42f8a79b2ade2d13ffd7bf33edfec21d771e3c76cd87103`.

The bundled UI establishes only the terminal-code **set** {1003, 3014}, not a
one-to-one mapping. The adapter normalizes expiry/replacement only when a code
in that set accompanies an exact corresponding native message found in the same
pinned executable. Generic code 1003 remains an upstream failure. Unknown states,
malformed envelopes and contract drift fail closed. This static evidence is
neither a publisher signature nor real QR wire acceptance.

## Server binding, continuity and existing behavior

`FqgateV2QrAdapter` is independent of v1 qualification. Global `supportedRange`
and `validatedVersions` remain unchanged. Fixed loopback requests, exact payload,
native PID/path/creation, process record and external WebView profile are checked;
version/health/contract/source/worker/account are sampled before and after actions.
Pending account changes, worker/process restart and identity drift invalidate the
flow. The upstream does not expose a proven session epoch: changes occurring
entirely between samples cannot be ruled out. Do not claim complete anti-replay
or undetectable account-switch protection.

The existing private config can contain `qrV2: { instanceNumber: <operator-selected integer> }`.
It is server-only; callers cannot select native IDs or flow handles. Without a
pin exactly one eligible source is required. Two ready QR-capable source records
were observed, one connected. Both are persisted active records; their original
creation action is unproven. The operator accepted the recommendation to select
the currently connected source; no source is deleted or logged out. Binding is
separate from QR authorization and does not begin login. Actual config-write and
readiness results are recorded externally, never inferred from this document.

A preservation guard refuses multiple connected sources, or a disconnected QR
target while another source is connected. This protects the already accepted
single-connected-source lookup. It is a Bridge policy, not an upstream limit on
multiple accounts. This task does not change the market adapter.

Bridge UUIDs remain the only client flow identifiers. Native source/account/flow
bindings stay in memory, adapter identity is bound into the registry, operations
are serialized, TTL is 120 seconds, image size 512 KiB, QR body 2 MiB, snapshot
64 KiB and OpenAPI 4 MiB. Each HTTP operation group has a 5-second budget;
additional native identity checks are separately bounded. Fatal UTF-8, JSON,
enum, canonical base64, response and timeout checks reject invalid input.
Local/human/admin QR permissions and JWT/Host/Origin/CSRF stay fixed; machines
are always denied before upstream access.

UI cancellation clears the image and stops polling; it does **not** revoke an
upstream flow, log out or delete an instance. No undocumented cancel endpoint
is invented. v2 has no demonstrated `cache_credentials:false` option; the Bridge
does not change auto-login/saved-login settings. Starting QR may replace login
state for the selected instance. The bundled FQGate UI's temporary-instance
create/delete behavior is deliberately not copied.

## Windows acceptance and safe operator boundary

Preflight remains GET-only and produces per-gate PASS/BLOCKED/NOT_EXECUTED,
exit status, reason/evidence/impact/recovery/retry and external SHA-256 receipts.
It now checks installed client bytes and exercises adapter readiness without QR.
An ambiguous unbound deployment remains BLOCKED despite passing contract checks.

Live without `-AllowLiveQr` produces NOT_EXECUTED, with no config read, browser
launch or QR request. An explicitly approved Live run requires all Preflight
gates and the running Bridge's exact checkout SHA before opening a fresh local
browser. Only the existing loopback QR begin/poll POSTs are allowed, once per
flow, with UUID checks, a 120-second deadline and bounded polls. No QR image,
trace, screenshot, storage state, native identifier or session response is saved.
Connected completion requires the same source/worker/process plus automatic
read-only lookup and local matrix regression. Closing/cancelling/expiry/failure
stops safely and cannot become PASS. An observed connected state does not
independently attest which MFA the operator performed.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json
# ONLY after separate explicit approval and a matching running Bridge build:
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Live -AllowLiveQr -Config D:\code\research\fqgate-acceptance-config.json
```

Live impact: may replace the selected login; the operator scans/confirms in their
own app. Expected: same bound instance connected and regression gates PASS. Stop
on identity mismatch, cancel, expiry or timeout. Recovery: close the local QR UI,
retain the existing processes/configuration, rerun Preflight and obtain approval
before a fresh Live attempt. No automatic process restoration or account rollback.
Bridge deployment/start/restart is a separate approval; this task does not perform
it implicitly. Existing runtime socket results must retain their actual build SHA.

Deterministic tests cover v1 regression, v2 pending/connected/error/expiry/replaced,
source ambiguity and pinning, restart/drift, hostile responses, timeouts,
concurrency, UUID isolation and policy/Origin denials. Browser fixtures cover
local cancellation. Native Windows fixtures execute the actual PowerShell
collector with fake Win32 inputs and prove the no-approval Live guard. These are
simulation/behavior tests, separate from real Windows QR acceptance. Exact final
SHA, CI and native results belong in the external continuation delivery receipt.

## Actual continuation validation — 2026-10-15

Implementation `4c7c88b32fe6b64489ef2578d126e14b856a39b1` passed the complete
Linux frozen-install/typecheck/lint/test/build/format/E2E pipeline: **639 tests,
16 browser tests**. Its [CI 38676903103](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38676903103)
passed Ubuntu and Windows. The later final delivery SHA/CI is bound separately
in the external continuation receipt; do not treat this CI as another head.

The permanent Windows checkout was clean before safe fast-forward. Native
frozen install, CLI build, typecheck, lint, **639 tests**, format, **28/28**
PowerShell preflight cases, **5/5** inline identity cases and **1/1** no-approval
Live guard passed. No full production rebuild overwrote the active served
output; the Windows CI full build is separate evidence.

At 03:36Z the operator-approved current connected source was pinned in the
external acceptance config, with an original-byte backup restricted to the
operator outside the evidence directory. Static-client proof, adapter read-only
readiness and pre/post process/source/account equality passed. No authentication
POST was sent. Initial backup ACL-copy attempts failed because an identity was
unresolvable and a redundant ACL write required an unavailable privilege;
configuration was not changed by those attempts. Direct verification confirmed
the already-created protected directory and its backup grant access only to the
current operator, so no elevation or global ACL change was needed.

At 03:37Z the newly compiled checkout's direct v2 lookup passed. The **existing
running Bridge**, separately identified as
`3f78bb9948d95bf7ffb21809bba2baab283e7fed`, again passed local **6/6** and real
Vault-backed remote_machine **22/22** including QR denials. These do not prove
new QR deployment. Final Preflight requires exact running/checkout SHA equality;
a reachable older build is **BLOCKED**, even when all other readiness checks
pass. No Bridge/FQGate restart, process-record change, Cloudflare/daed write,
source deletion or real QR was performed.

Continuation receipts/logs and SHA-256 summaries are outside Git under
`D:\code\research\fqgate-205-qr-evidence\continuation`. Exact final gates,
source hashes, tools, commands, exit codes, safe retries and automated versus
human evidence are in `delivery-receipt.json` and the referenced Preflight.
Remaining immediate gates are **BLOCKED running build mismatch** and
**NOT_EXECUTED real QR pending separate approval**, rather than an unresolved
OpenAPI-only contract investigation. Once approved, replace only Bridge using
the reviewed build, rerun Preflight, then separately approve/run Live. A
Bridge replacement briefly interrupts Bridge requests and clears its ephemeral
registry; keep FQGate and both source records intact. Stop if native Bridge
identity or preflight cannot be verified; never force-kill an unknown process.

## Next smallest task and unchanged risks

After this bounded slice, use `docs/plans/future-multi-profile-account-isolation.md`
to design shared QR/status/lookup account selection and isolation. Do not launch
that implementation concurrently or expose a raw upstream selector. Signature
trust, authenticated release replay, complete directory/power-loss rollback,
queue/L2 qualification, startup and Phase 7-B2/7-C retain their prior risk states.

---

# Historical initial census delivery

2026-10-15: **BLOCKED_UPSTREAM_QR_CONTRACT**. Read-only preflight implemented;
v2 QR adapter and real QR acceptance remain **NOT_IMPLEMENTED / NOT_EXECUTED**.
Contract: `docs/tasks/fqgate-2-0-5-qr-session-compatibility.md`.

## Baseline and observed contract

Development checkout was clean, fetched/pruned, and fast-forwarded from
`1991d3a2002a4c100a0e06d7aa1086541c204892` to reviewed main
`8e235ad67ae6f9ca90687813334dac357aebe2e7` before development. Its
[CI 38665650611](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38665650611)
passed Ubuntu and Windows; no baseline CI repair was needed.

The existing permanent Windows checkout was inspected first without changing
runtime state. Native 2.0.5 identity/full payload and existing lookup passed on
2026-10-15. Both listeners were IPv4 loopback. Only GET requests were used for
contract/source/account/authentication discovery; no QR begin or poll was sent.

The actual runtime documents:

- GET `/v2/source-instances/{instance_id}/authentication`: mode descriptor;
- POST on that same path: discriminated `AuthenticationRequest` with
  `action: app_qr_begin` or `action: app_qr_poll`, the latter requiring positive
  integer `flow_id`;
- `AuthenticationResult`: `code`, `message`, and generic `data` with optional
  `flow_id`, image/media fields, string `status`, boolean `connected` and
  string `login_method`.

This is insufficient for the requested complete adapter. `status` has no enum,
`data` has no per-action required-field contract, and the error examples do not
establish expiry/replacement mapping, cancellation or source session epoch.
In particular, the authentication HTTP 400 example describes `1003` as invalid
request; the v1 adapter maps `1003` to QR expiry. Reusing that mapping would be
an unsupported assumption. No guessed v2 error mapping or state machine was added.

Two ready tonghuashun instances independently declare `app_qr` and session
support; one is connected and one disconnected. Both are eligible from the
available declarations. Lookup's single-connected predicate does not uniquely
select a QR target. No public selector or default-instance fallback was added.

## Delivered diagnostic boundary

`fqgate205-qr-acceptance.ps1 -Mode Preflight` invokes a standalone local probe,
not the Bridge runtime. It reports separate gates for:

- validated config and exact checkout SHA; actual running Bridge build separately;
- exclusive 127.0.0.1 listeners on 17281/17282;
- process record PID/path and native executable/creation-time consistency;
- exact nine-file payload/state, pending transaction and WebView2 profile separation;
- exact version/health, selected operation/transitive-schema fingerprint,
  source/account/authentication modes and sampled continuity;
- configured fixed Access cert endpoints, with no JWT/signature validation claim;
- unauthenticated remote edge response, HTTP 502 or transport failure, with no
  authenticated origin acceptance claim;
- pre/post file/process/listener/profile continuity and `LIVE_QR=NOT_EXECUTED`.

Native fixtures also cover JSON integer/date representations across Windows
PowerShell 5.1 and PowerShell 7, rejecting strings/floating-point PIDs.
Creation-time matching requires native and recorded timestamps within one
millisecond. A record holding only launch time cannot establish this gate and
must stay BLOCKED; the probe never repairs/adopts it. WebView profile location
is inferred from readable native descendant command lines and the pinned file
tree; it is not a complete data-preserving rollback proof. Continuity is sampled,
so transient changes between observations cannot be excluded.

All HTTP calls in the probe are GET, redirect following is disabled, responses
are size/time bounded, JSON uses fatal UTF-8 decoding, source IDs stay private,
and source/account values are reduced in memory to counts/continuity. An observed
fingerprint is not an approved compatibility fingerprint. Even a hypothetical
schema containing more enums never enables QR: a separate reviewed adapter is
still mandatory. The diagnostic cannot start processes or change configuration.

`-Mode Live` and `-AllowLiveQr` are recognized but **cannot execute QR** in this
blocked-contract delivery. Both approval-absent and approval-present invocations
return NOT_EXECUTED/nonzero without POST. No scan/MFA is requested. A working
Live harness, local protected QR rendering and automatic exact-flow polling
remain dependent on the missing upstream contract and unique source policy.

Receipts include UTC, checkout and running build identities separately, Node/
platform, source/test hashes, command, exit code, per-gate reason/evidence/impact/
recovery/retry, totals and a SHA-256 sidecar. A blocked receipt exits 1;
receipt existence is never a passing result. No raw config, response, account,
source identifier, command line, JWT or QR material is written to evidence.
External evidence defaults to `D:\code\research\fqgate-205-qr-evidence`.

## Repeatable Windows checks

Run from the permanent checkout, using the existing Node/Git installation and
repo-pinned pnpm. The probe only writes external receipts; no restart, QR,
service/task, process.json, profile, daed or Cloudflare change is performed.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json
node .\scripts\windows\fqgate205-readonly-probe.mjs `
  --config D:\code\research\fqgate-acceptance-config.json
node .\scripts\windows\phase5c-matrix.mjs --local
```

If Node/Git are unavailable in a WSL-launched Windows shell, use process-local
PATH/PATHEXT only; do not change persistent environment or Git trust:

```powershell
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json
```

If native executable-path access is denied, stop and retain BLOCKED. To repeat
with elevation, open **Windows Terminal → PowerShell → Run as administrator**,
then run the same complete Set-Location/environment/Preflight commands above.
Expected: individual gates and exit 1 while QR contract is blocked. Stop on any
identity mismatch; no repair follows. System configuration writes: none. Return
to ordinary automation by rerunning the same probe; elevation is not a waiver.

## Validation and remaining work

The implementation adds 19 deterministic census tests and native PowerShell
behavior fixtures executed in Windows CI, including the actual native collector
with fake Win32 inputs. Full baseline tests cover v1 QR states/opaque UUID,
local/human/admin/machine policy, Host/JWT/Origin/CSRF and v1/v2 lookup. These
are distinct from unimplemented v2 QR success/expiry/replacement/cancel tests.
Those tests and real QR local/remote acceptance remain NOT_EXECUTED, not fixture
success. Exact delivery commit/CI and final Windows totals are recorded in the
external delivery receipt and final report.

### Actual Windows results — 2026-10-15

Implementation `f3680f528cf55d76c71e0418501e8eac28c5e589` passed native
Windows frozen install with pinned pnpm 11.23.0, CLI build, typecheck, lint,
554 tests, format check and **25/25 native PowerShell behavior fixtures**.
Full Linux build and 15 browser tests passed; both OS jobs of
[implementation CI 38666726318](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38666726318)
passed. The final receipt binds the later delivery head and its own CI separately.

Native Preflight at 01:39Z returned **17 PASS / 2 BLOCKED / 1 NOT_EXECUTED**,
exit 1. BLOCKED: incomplete QR contract and two eligible sources. NOT_EXECUTED:
real QR. Native PID 34980 / creation `2026-10-14T03:15:00.2208930Z`, record,
pinned payload, separate WebView profile, listeners, version/health, sampled
source/account/protocol/runtime continuity and configured Access cert transports
all passed. Observation-only six-operation/transitive-schema fingerprint:
`1cc165c2086e6eece42f8a79b2ade2d13ffd7bf33edfec21d771e3c76cd87103`.
Remote unauthenticated human/admin 302 and machine 401 only prove edge responses.

The existing running Bridge reports
`3f78bb9948d95bf7ffb21809bba2baab283e7fed`, independently of the checkout.
No restart/deployment was performed. Its local **6/6** matrix and real Vault-backed
remote_machine **22/22** matrix passed again at 01:39–01:40Z, including machine
QR denials. These are existing-socket regressions, not proof that this PR's build
was deployed or that v2 QR works. The standalone probe loads the checkout's
compiled diagnostic directly. Full Windows production rebuild was left to CI
to preserve the currently served build; native local CLI build was executed.

External receipts: `native-checks.json`, `native-quality-checks.json`,
`remote-check.json`, per-command logs and `preflight-*.json` with SHA-256 sidecars
under the evidence directory above. Initial PATH/PATHEXT and PowerShell native
stderr-capture tooling attempts failed and were corrected; those attempts are
not counted as acceptance passes. No session mutation or recovery followed.

A supplemental public code search for `app_qr_poll` in publisher org `fqgate`
returned no indexed results. The public FQGate-agent tree at
`7ae0f216e5ca5d98a0808b7dae7b20da5d97f097` contains no named authentication/QR
implementation file. This limited corroborating search does not prove that a
contract cannot exist elsewhere; it supplies no missing wire semantics.

The next minimal task is to obtain a version-bound publisher contract for the
missing QR states/errors/session identity, and define an evidence-backed unique
QR source policy. Do not begin login to discover those semantics. Publisher
signature authentication, authenticated anti-replay, complete reverse-directory/
power-loss rollback, startup and Phase 7-B2/7-C retain their prior risk states.

### Observed configuration protection prerequisite

At 07:25Z on 2026-10-15, read-only ACL inspection found the current external
config inherits `Authenticated Users: Modify` and `Builtin Users: ReadAndExecute`.
The existing pre-binding backup grants only the current operator. Content hashes
remain unchanged; no ACL was modified by that inspection. Protected-config
verification does not establish operator-only protection for this file. The
operator correctly questioned treating optional ACL hardening as a mandatory gate
for a single-owner research trial; that strict interpretation is withdrawn.
Content/hash/native identity checks remain mandatory. A replacement approval may
explicitly retain the known existing ACL; it must not claim operator-only custody.

The operator separately approved narrowing only this file's DACL. The attempted
write was denied with `UnauthorizedAccessException / 0x80070005` before any ACL
change. Content and permissions remain unchanged; the original DACL was backed up
in the existing operator-only private directory. No elevation, ownership change,
file replacement or process stop followed. Optional hardening remains BLOCKED on
Windows write-DACL authority; it does not prove a QR protocol defect or require
expanding this personal project into a multi-user deployment. Actual subsequent
replacement/Live approvals and results belong in the external delivery receipt.
Real QR and post-Live matrices remain independently unexecuted.
