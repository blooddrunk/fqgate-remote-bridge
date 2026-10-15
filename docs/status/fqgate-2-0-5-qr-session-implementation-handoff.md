# FQGate 2.0.5 QR/session census and continuity diagnostics

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
