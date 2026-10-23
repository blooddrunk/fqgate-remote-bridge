# Windows MP-3 read-only repeat and future experiment

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**. These commands collect evidence,
not qualification or deployment. Use the existing permanent Windows checkout;
no second checkout, native launch, login, saved-data edit or service repair.

## Repeat automated observation now

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
# Existing validated config; read in memory, never display or save its contents.
$mp3Config = Get-Content D:\code\research\fqgate-acceptance-config.json -Raw | ConvertFrom-Json
$mp3Current = Join-Path $mp3Config.installDirectory 'fqgate\current'
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp3-native.ps1 -CurrentDirectory $mp3Current
$mp3NativeExit = $LASTEXITCODE
node .\scripts\audit-fqgate205-isolation.mjs --executable (Join-Path $mp3Current 'FQGate.exe')
$mp3StaticExit = $LASTEXITCODE
Write-Output "Native observation exit=$mp3NativeExit; static observation exit=$mp3StaticExit"
```

Native exit 0 means CIM/listener/ancestor-attribute reads completed, **not**
isolation PASS. Missing Bridge emits BLOCKED_LISTENER_ABSENT; unreadable native
reads exit 1. Unknown/relative WebView directories and unreadable/reparse
ancestors remain explicit. Zero roots or zero apps never proves separation.
The static reader requires the pinned 53,590,016-byte EXE/hash, otherwise exit 2.
It never executes even `--help`. String offsets are observations, never supported
launch options. Do not copy WebView/profile directories or modify environment
variables to try to redirect storage. No native data content is collected.

Repeat current identity/status verification using the existing private alias
expectations, without rewriting expectations to match a failure:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp2-preflight.ps1 `
  -Config D:\code\research\fqgate-acceptance-config.json `
  -Profiles D:\code\research\fqgate-mp2-profiles.json `
  -EvidenceDirectory D:\code\research\fqgate-mp3-evidence
$mp3PreflightExit = $LASTEXITCODE
Write-Output "MP2 GET-only preflight exit=$mp3PreflightExit"
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json `
  -EvidenceDirectory D:\code\research\fqgate-mp3-evidence
```

Expected today: Preflight exit 1, 17282 absent, account identity/epoch UNPROVEN,
QR NOT_EXECUTED. No restart or automatic reconciliation follows. Existing
permanent-host `dist` dependencies were retained; MP-3 needs no production
build there. Follow the [MP-2 build custody procedure](windows-fqgate205-mp2.md)
if its standalone compiled diagnostic is missing. WSL shell success is not a
native child exit: unattended receipts should use explicit executable paths
and `Start-Process -Wait -PassThru`, with stdout/stderr redirected externally.
Do not save full CIM command lines or private account/config responses.

Synthetic repeat commands:

```powershell
corepack pnpm exec vitest run tests/mp3-isolation.test.ts tests/profile-resolver.test.ts tests/profile-preflight.test.ts tests/mp2-live-model.test.ts
node .\scripts\audit-profile-prototype.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp3-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp2-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1
node .\scripts\windows\test-fqgate205-qr-identity.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate-v2-observation.ps1
```

Expected exit 0 and FIXTURE_ONLY behavior; zero native authentication effects.
The complete quality matrix and Ubuntu/Windows CI remain required. Existing CI
runs browser E2E on Ubuntu; **Windows browser E2E is skipped**.

## Smallest next task: supported deployment contract

Before another process is even proposed for launch, obtain an exact-2.0.5
publisher-supported specification (or reviewable native server implementation)
for bind address/port, full user data/cache/credentials/WebView roots, singleton
lock/IPC scope, worker creation/exit and graceful application exit/session
restore. The public distribution/Agent clients do not provide those guarantees.
All startup options must have provenance and a version binding. A successful
binary string search is insufficient. No guessed multi-instance command is
provided or authorized by this procedure.

If the publisher does not supply these capabilities, stop process-per-profile
integration. There is no benefit in asking the operator to run unsupported
flags. Continue native-Source research only if the operator wants the narrower
observable-displacement experiment below; this is not a prerequisite for
merging MP-3 engineering.

## Separately authorizable single-attempt native-Source experiment

This is a future task contract, **NOT_EXECUTED**, not a request to act now.
The full fixed wire sequence and stop counters are already specified in
[MP-2's future experiment](windows-fqgate205-mp2.md#independently-authorizable-future-native-experiment).
MP-3 adds the following explicit decision and measurement requirements:

1. **Why offline/GET cannot answer:** no observation can show the effect of a
   second login that was never performed, saved-login restoration not attempted,
   or an invisible A → B → A transition. Current masked display and time fields
   cannot establish account identity/epoch. Process separation does not repair
   those semantics. Narrow the experiment to observable displacement if native
   identity remains unavailable; do not call it strong isolation acceptance.
2. **Exact host/runtime prerequisite:** use the existing Windows x64 host and
   checkout above. Before approval, record host identity privately, current EXE
   size/hash (pinned `d0a104f6...`), GET version=2.0.5, current actual Bridge
   build from GET version, parent and both worker PID/path/creation, listener
   ownership, and frozen private A/B alias→source/number mapping. MP-3 observed
   parent PID 9656, creation `2026-10-21T02:59:51.8892760Z`; this is historical
   preflight evidence, never a future kill target or identity expectation.
   Current 17282 absence stops the procedure. Starting/replacing Bridge needs
   its own approval and concrete staged/rollback review; no FQGate restart is
   needed or authorized merely for this research.
3. **Reviewable runner before permission:** a separate engineering task must
   deliver a local standalone runner, default GET-only, binding the exact source
   B, one-shot approval, visible readiness, one begin maximum and bounded polls.
   It must not wire MP-1 into production or bypass the current single-connected
   adapter. MP-3 contains **no runnable alias-aware Live command**. Before asking
   for real approval, provide its actual reviewed PowerShell command, build SHA
   and checks; until then, execute only the GET commands above. The existing
   single-pin QR Live command cannot select B and must not be repurposed.
4. **Precisely permitted future mutation:** after separate approval and readiness,
   one POST to `/v2/source-instances/{frozen_B_id}/authentication` with
   `{"action":"app_qr_begin"}`; poll only the returned memory-only flow on that
   same path with `{"action":"app_qr_poll","flow_id":<bound_integer>}`. At least
   2 seconds between polls, at most 60 polls, total <=120 seconds starting before
   begin or the shorter existing TTL. No second begin, source CRUD, saved-login
   clear/restore, logout, process lifecycle, configuration edit or concurrent QR.
   No command with arbitrary URL/path/port/body input is acceptable.
5. **Operator actions and risks:** the local readiness window must identify B's
   private alias. Click readiness only after seeing that exact window. On the
   phone, select the intended distinct account, scan and confirm once. Wrong
   account/replacement prompt or unreviewed MFA -> cancel; do not confirm.
   The login may replace B, displace A or another device's session/L2, and may
   persist credentials/native state even if the request later times out. Existing
   lookup will deny when two Sources become connected; do not weaken that guard.
   Retain original config/source inventory metadata externally. Do not copy live
   credential/WebView files or promise a transactional account rollback.
6. **What to measure:** GET the same A/B account/auth/inventory/version descriptors
   and native creation/ownership immediately before every authentication request
   and after each result. Record bounded status/L2/saved-availability and peer
   change booleans. If separately approved and a reviewed source-specific
   read-only query contract exists, one bounded six-digit instrument query per
   alias can establish routing; route attribution must be checked, not inferred
   from equal stock results. Such a query establishes neither fresh L2 service
   nor distinct-account identity. An L2 entitlement field alone is not a measured
   L2 operation. Saved-login isolation needs a **different** approved restart/
   restoration experiment and evidence of which storage was consumed; it cannot
   be proved by this one-login experiment. Record those gates NOT_EXECUTED.
7. **Success/failure/cancel:** expected observable sequence is waiting → connected
   on B with only the approved transition and no observed A degradation. Any
   parent/worker/source/alias/build drift, unexpected account or peer state,
   L2 loss, listener absence, malformed/unknown response, denied permission,
   timeout/expiry or user cancellation stops scheduling immediately. Abandon
   QR/poll memory, suppress all delayed callbacks, retain only reduced receipt,
   and do not retry/restart/logout/restore. An unresolved upstream authentication
   may still take effect; no automatic second attempt or safety claim follows.
8. **Automatic GET-only resume:** run the exact MP-2 Preflight command in the
   first section, using the frozen original expectations, then the same MP-3
   native/static observation commands. A changed B state should BLOCK the old
   expectations. A separately reviewed post-experiment expectation may record
   the intended transition; do not silently rewrite it to manufacture success.
   If 17282 remains absent, report BLOCKED and stop. Recovery of A/B/L2 requires
   a new operator instruction and cannot be rolled back by GET.
9. **Unprovable conclusions:** one sampled success cannot prove global saved-login
   namespace isolation, same-account duplicate policy, all provider L2 limits,
   unobserved transitions or monotonic native session epoch. Record exactly what
   occurred, including no phone/MFA action when not attested, and retain
   **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED** until its independent real
   acceptance contract is actually satisfied.

A later process-per-profile experiment additionally needs the supported launch
syntax, two disjoint fully enumerated storage ownership scopes and nonconflicting
loopback ports reviewed **before** authorization. Its exact start/quit commands
must come from that contract; their absence currently prevents offering a safe
executable experiment. Native Source and process experiments are separate choices,
not two steps implicitly approved by a single QR permission.
