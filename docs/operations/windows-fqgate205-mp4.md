# Windows MP-4 GET-only repeat and future one-attempt protocol

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**. These commands are read-only.
There is no MP-4 Live switch or POST executor. Do not use the existing
single-source QR Live harness for an A/B experiment: it is not alias-aware.

## Current host, inputs and non-mutating repeat

Existing Windows x64 host and checkout:
`D:\code\research\fqgate-remote-bridge`. Existing protected application config:
`D:\code\research\fqgate-acceptance-config.json`. Existing private diagnostic
mapping: `D:\code\research\fqgate-mp2-profiles.json`; its immutable mapping
pins Source A number 1 / connected and Source B number 2 / disconnected.
Actual native IDs and alias values stay in that file, not Git or logs.
The explicitly expected historical Bridge build is
`481db65097cd63ea0f9c28f39e526e341b700721`; absence of a listener means the
currently running build is **unknown**, not that historical SHA.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
$env:Path = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Windows\System32;C:\Windows\System32\WindowsPowerShell\v1.0;' + $env:Path
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
& 'C:\Program Files\Git\cmd\git.exe' -c safe.directory=D:/code/research/fqgate-remote-bridge status --short
& 'C:\Program Files\Git\cmd\git.exe' -c safe.directory=D:/code/research/fqgate-remote-bridge rev-parse HEAD
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(17281,17282) } |
  Select-Object LocalAddress,LocalPort,OwningProcess
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp2-preflight.ps1 `
  -Config D:\code\research\fqgate-acceptance-config.json `
  -Profiles D:\code\research\fqgate-mp2-profiles.json `
  -EvidenceDirectory D:\code\research\fqgate-mp4-evidence
Write-Output "Readiness exit=$LASTEXITCODE"
```

Expected: exit 1, reduced JSON receipt + SHA-256, zero POST/account/QR counters.
Healthy reads are OBSERVED; identity/epoch/L2/Saved Login remain UNPROVEN. Exit 2
means invalid tooling/arguments/config or receipt-save failure, not a native
contract result. Never change expected SHA or A/B mapping automatically to make
an observed mismatch pass. `checkoutCommit` describes source; the receipt's tool
hashes bind actual scripts/compiled diagnostic. Neither is a deployed-runtime claim.

The updated wrapper imports the new standalone compiled
`dist/fqgate/diagnostics/source-readiness.js`; MP-2's old TypeScript entry re-exports
it for offline compatibility. On the permanent host, do **not** run a whole
build over served output. In this delivery only that previously absent compiled
diagnostic file was copied from the reviewed WSL CLI build, after its four direct
dependencies were byte-compared with existing Windows dist. Prior 283 dist/.output
files and both private configuration files are protected by external before/after
SHA-256 manifests. An ordinary development checkout uses `pnpm build` normally.
Do not overwrite a pre-existing artifact on a different host without reviewing
its custody; an unavailable diagnostic is a tooling BLOCKED condition.

## Current blocking conditions and recovery checks

1. `LISTENER_17282=BLOCKED/LISTENER_ABSENT`: expected exactly one
   `127.0.0.1:17282` listener; none exists. Actual Bridge owner/build and method
   denials cannot be attested. The diagnostic sends no Bridge GET without a
   verified exclusive owner. Review the listener table above. A Bridge-only
   launch/deployment is a **separate authorization decision**, not a repeat step.
2. `PAYLOAD_PROCESS_RECORD=BLOCKED/INSTALL_OR_PROCESS_RECORD_UNVERIFIED`:
   exact EXE/client bytes can match while complete payload/process-record gates
   fail. The independent QR Preflight reports installation drift/unreadable
   transaction/tree, process-record native mismatch/unreadable and WebView profile
   inside immutable payload. Do not move WebView, rewrite the process record,
   alter configuration/ACL or reinstall. Rerun the following read-only baseline
   to separate these gate IDs:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json `
  -EvidenceDirectory D:\code\research\fqgate-mp4-evidence
Write-Output "QR Preflight exit=$LASTEXITCODE"
```

3. Account identity/epoch are missing reviewed native semantics, not a login
   failure. L2 and Saved Login independence have no real acceptance. No human
   login can clear those contract gaps by itself. A→B→A remains undetectable.
4. Unknown OpenAPI, changed Source/worker/PID+creation/path, parent newer than
   worker, path reparse/unreadable ancestry, listener ambiguity, stale/future or
   regressing `observed_at`, peer state/account/Saved Login/L2 notice changes:
   discard all summaries and stop. Repeat the same GET-only command after
   independently reviewing the change; never rebind or fall back to peer B/A.

Freshness policy is a diagnostic limit: age ≤30 seconds, future skew ≤2 seconds,
explicit timezone, no regression, and still fresh at publication. It is not an
upstream guarantee that observation time is a login epoch. GETs are fixed to
loopback, no redirects/credentials/body; 5-second request, 64-KiB response
(OpenAPI 4 MiB), 60-second total deadline, ≤16 mapped Sources. Native subprocesses
are bounded to 15 seconds / 16 KiB. Cancellation/failure fences subsequent
requests and publication; already-started read subprocesses may finish within
their own bounds. No retry or process repair follows.

Fixture repeat, each expected exit 0:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp2-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp3-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp4-cli.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1
node .\scripts\windows\test-fqgate205-qr-identity.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate-v2-observation.ps1
```

## Future separate authorization — design only, NOT_EXECUTED

The smallest experiment asks only whether one login to existing disconnected
Source B visibly displaces connected peer A. It cannot establish account identity,
Session Epoch, Saved Login restoration or valid concurrent L2 data. No L2 market
query, saved-login action, same-account duplicate login or second process belongs
to that one attempt; each needs a separate future scope and approval.

Before requesting approval, a future reviewed change must supply a bounded local
alias-aware runner. MP-4 has **no reachable POST code path**. Do not weaken the
production connected-source guard to reuse it for B. Preconditions in the future
reviewed change:

1. Name this exact Windows host, exact 2.0.5 EXE/client hashes from the
   [matrix](../plans/fqgate205-mp4-native-source-contract.md), current actual
   Bridge build and owner PID+creation. All install/process/loopback/OpenAPI gates
   must pass independently. Current absent 17282 and process/payload gates are
   STOP conditions, not bypassable readiness warnings.
2. Review the private mapping file/hash: sole target B alias → exact native ID,
   number 2, worker PID+creation/restart; peer A alias → exact ID, number 1,
   worker PID+creation/restart. If either differs, stop before begin. No auto-created
   Source, renumbering, connected-source choice or alternate account fallback.
3. The operator privately identifies the actual existing account on A and the
   distinct real account intended for B. Masked names and equal displays do not
   verify distinctness. Pin these in an operator-only approval record, not Git;
   public evidence contains only “operator-attested distinct accounts”. If that
   attestation is unavailable, stop. Do not infer it from GET.
4. Explain the exact account/session mutation, risk of replacing A/B or another
   phone/desktop terminal, persistence of native Saved Login, and L2 downgrade.
   Require a new explicit approval for **one** B begin plus this exact phone
   action after the reviewed runner/build is available. Approval must bind the
   private target and peer, hashes/build, deadline and attempt ID. An MP-4 goal,
   UI click, old QR authorization or generic permission is insufficient.

Prospective sequence only:

1. Capture fresh prechecks and a local no-QR readiness page naming B number 2
   and observed peer A state without private identifiers. Operator must actually
   see it and click Ready; a launched/topmost window flag is not visibility proof.
   Missing click or cancellation → zero begins. Require the separate explicit
   phone-operation authorization as well; do not infer it from Ready.
2. Recheck exact build/process/target/peer immediately before one prospective
   fixed `app_qr_begin` on B's authentication path. The future runner must have no
   generic URL/method/body, alternate flow selector, CRUD or parallel QR path.
   Reserve a global attempt before sending; timeout/unknown begin outcome never
   permits automatic replay.
3. Only after successful bounded begin may the operator scan the visibly shown
   QR with the approved B account and confirm on the phone. If the phone shows
   the wrong account, replacement/MFA prompt outside the approved steps, or no
   QR is visible: cancel/stop. Never save QR/token/flow ID/screenshots containing
   account data. Phone success is explicit operator testimony, not a fixture.
4. Poll only the reserved B flow, serially, ≥2 seconds apart, ≤60 polls and
   ≤120 seconds from the attempt start (whichever ends first). Before/after each
   stage independently fence build, Source mapping, worker/parent creation,
   contract and peer A observation. B may change only along the approved login
   transition; peer account/state/L2/Saved Login changes → STOP and record visible
   displacement. No further poll/retry after failure, cancellation or late reply.
5. Stop on one connected result, terminal native status/error, unknown response,
   stale/drifted identity, process exit, lost visibility, operator cancellation,
   deadline or any peer change. Record bounded enum transitions/counters and
   GET-only post-observation even after timeout where safe; do not rerun begin.

Reduced evidence: UTC, approval/visibility/phone-attestation booleans, attempt
ordinal, reviewed source/tool/build hashes, per-gate status/reason, zero/one begin,
poll count/interval/duration, target/peer ordinals and state/L2/Saved Login
booleans. No displays or their hashes, native Source/account/flow identifiers,
QR, tokens, cookies, SDK/WebView data or raw responses in evidence/Git.

Cancellation only abandons local presentation/polling. It cannot revoke a scanned
QR, undo provider-side authentication, restore displaced sessions or guarantee
Saved Login erasure. Restoring Bridge files would not roll back those effects.
No automatic logout/restore/clear/relogin is permitted. Any restoration requires
new scope and operator account/phone action; report what remains changed.

After stop, use only the GET-only repeat command above; changed expected state
requires explicit review of the private diagnostic mapping, never automatic
rewriting. All real begin/poll/phone/displacement/Saved Login/L2 experiment gates
are **NOT_EXECUTED in MP-4**. No approval is being requested as part of this delivery.
