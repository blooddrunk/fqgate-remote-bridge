# Windows MP-2 read-only preflight and future experiment specification

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**. This task authorizes only the
Preflight below and fixture tests. Do not run the existing single-account Live
QR command to investigate aliases; that harness cannot bind a profile alias.

## Run now: GET-only diagnostic

Use the existing Windows x64 host/check-out `D:\code\research\fqgate-remote-bridge`,
the existing external Bridge config, and an external private diagnostic file.
Do not replace runtime output or build over the deployed `.output`/`dist` merely
to run this tool. For ordinary offline development, `corepack pnpm build` creates
the diagnostic under dist; on the permanent host use the already verified build
dependencies and add only the new standalone diagnostic module, byte-compared
with the reviewed source build. This adds no production import or runtime wiring.

Private file schema (placeholders must be replaced from reviewed GET evidence;
neither a masked account nor connected count establishes an account mapping):

```json
{
  "schemaVersion": 1,
  "expectedBridgeCommit": "0000000000000000000000000000000000000000",
  "profiles": [
    {
      "alias": "p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sourceId": "REVIEWED_NATIVE_SOURCE_A",
      "instanceNumber": 1,
      "expectedState": "connected"
    },
    {
      "alias": "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "sourceId": "REVIEWED_NATIVE_SOURCE_B",
      "instanceNumber": 2,
      "expectedState": "disconnected"
    }
  ]
}
```

The file is not production configuration and does not register native profiles.
Pin the expected actual reviewed Bridge build separately from checkout SHA.
Never modify expectations automatically after a failed comparison.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
& 'C:\Program Files\Git\cmd\git.exe' -c safe.directory=D:/code/research/fqgate-remote-bridge rev-parse HEAD
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(17281,17282) } |
  Select-Object LocalAddress,LocalPort,OwningProcess
# The collector emits minimal private process facts; never capture full CIM command lines.
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp2-native.ps1
# Reuses protected existing config without saving or changing it.
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-mp2-preflight.ps1 `
  -Config D:\code\research\fqgate-acceptance-config.json `
  -Profiles D:\code\research\fqgate-mp2-profiles.json `
  -EvidenceDirectory D:\code\research\fqgate-mp2-evidence
$code=$LASTEXITCODE
Write-Output "MP2 preflight exit=$code"
```

Expected result: exit 1, structured receipt and SHA-256, all write/QR counters 0,
no source/account/display strings. Healthy observed bindings may be OBSERVED,
but ACCOUNT_IDENTITY/SESSION_EPOCH remain UNPROVEN and MP1_NATIVE_REQUIREMENTS
BLOCKED. Missing 17281/17282 -> LISTENER_ABSENT/BLOCKED; unreadable process record
or path -> BLOCKED. A runtime/checkout mismatch is explicit, even when the
expected historical runtime matches. Exit 2 is a tooling/config/receipt failure.
Stop; never launch/restart/redeploy, change ACL or alter accounts to clear a gate.

Additional existing GET-only baseline (may independently return BLOCKED):

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\fqgate205-qr-acceptance.ps1 `
  -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json `
  -EvidenceDirectory D:\code\research\fqgate-mp2-evidence
```

Native synthetic checks (no authentication/network writes):

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-mp2-native.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1
node .\scripts\windows\test-fqgate205-qr-identity.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate-v2-observation.ps1
```

## Independently authorizable future native experiment

Why GET is insufficient: the account snapshot lacks a reviewed non-display ID
and login epoch. Two equal samples cannot exclude A → B → A. Two declared sources
do not prove simultaneous logins, native storage independence, or L2 continuity.
An experiment can establish only its explicitly observed transitions. Stable
identity/epoch still requires upstream semantics, not user visual attestation.

The executable specification is `tests/helpers/mp2-live-model.ts` plus tests:

```powershell
corepack pnpm exec vitest run tests/mp2-live-model.test.ts tests/profile-preflight.test.ts tests/profile-resolver.test.ts
```

Expected: all fixture assertions pass with FIXTURE_ONLY evidence; no real QR.
There is deliberately no MP-2 real Live command or transport. Supplying `-Live`
or `-AllowLiveQr` to the new wrapper is an argument error, not authorization.
Implementing a native experiment runner is a separate bounded engineering task
after the following approval record and prerequisites are reviewed. The model
cannot be pointed at the existing live adapters.

1. **Host/prerequisites:** same Windows x64 host and permanent checkout; preserve
   current two native sources, operator config, saved login and WebView storage.
   No second machine, process-per-profile setup or native Source CRUD is implied.
   Both loopback listeners, pinned installed bytes, current process creation and
   reviewed actual Bridge build must be automatically verified by Preflight.
   An absent Bridge requires a separate deployment approval; this experiment
   must stop before QR while it remains absent.
2. **Identity prerequisite:** define the exact evidence and semantics for expected
   A and B accounts, epochs, saved-login baseline and L1/L2 state. Current
   account_display is insufficient; if publisher evidence remains unavailable,
   the approval must explicitly narrow the experiment to observable displacement
   research and retain UNPROVEN strong identity/epoch. Do not run the strong
   isolation specification with an invented native proof.
3. **Approval contents:** name the exact runtime commit, parent/worker PID plus
   creation times, immutable private alias/source/number mapping and baseline
   account state. Request permission for exactly one `app_qr_begin` on exactly
   Alias A **or** B, finite `app_qr_poll` requests for its same flow, and the
   operator's phone scan/confirmation (MFA only if actually presented). Explain
   that beginning or confirming login may replace the selected login, displace
   another source's L2/session, and change native saved state. It cannot promise
   automatic rollback. A second begin, another account or another alias needs
   independent approval; an existing research approval never implies them.
4. **Runner contract:** default Preflight sends no POST; real mode needs a separate
   one-shot approval record plus visible readiness click. Freeze alias, exact
   Source ID/number, runtime, parent/worker creation, account and epoch bindings
   before begin. Revalidate immediately before every authentication command and
   after every result. No global current-source variable, runtime reselection,
   queue, fallback, default-account choice or concurrent begin is permitted.
5. **Exact wire sequence for that future runner:** GET the same fixed version,
   health, OpenAPI, inventory/account/authentication descriptors used by MP-2.
   Once approved and readiness clicked, issue one POST to the pinned
   `/v2/source-instances/{pinned_source_id}/authentication` with
   `{"action":"app_qr_begin"}`. Keep native flow_id and QR image memory-only.
   Poll only that path/flow with
   `{"action":"app_qr_poll","flow_id":<memory-only-positive-integer>}` at
   intervals >=2 seconds, at most 60 polls and <= existing `QR_FLOW_TTL_MS`
   (120 seconds), counting from **before begin**. Each network/native operation
   also has its own bounded deadline. No generic method/path/body inputs.
   A fixture clock that fails to advance still stops at the poll count cap.
6. **Operator steps:** the readiness page must identify the selected private alias
   locally without exposing account secrets. Click readiness only when the actual
   window is visible. On the phone, check the intended account, scan the displayed
   QR, and confirm once. If it offers the wrong account, asks to replace an
   unexpected login, or presents unreviewed MFA, do not confirm; close the window.
   Record only “scanned/confirmed/MFA presented” booleans, never QR or MFA content.
7. **Expected output/failure:** one begin counter, waiting-for-scan/confirmation
   transitions, then a native connected state consistent with the approved
   expected account evidence; no foreign profile result. In strict identity mode,
   unresolved account/epoch is a failure before begin. Any changed source/worker,
   runtime, account/epoch or peer state; unknown response; terminal error;
   malformed JSON; deadline; missing listener; or cancelled readiness is STOP.
   Authentication already performed is not undone by discarding its response.
8. **Stop strategy:** stop scheduling immediately, abandon QR/poll memory and
   suppress delayed publication. Do not retry begin/poll, log out, restore/clear
   saved login, change source, create a source, repair configuration or restart.
   Preserve existing processes and collect only reduced read-only gates. Closing
   the browser stops local visibility/polling; it does not revoke native login.
9. **Resume automation:** after any stop or successful attempt, rerun the exact
   MP-2 Preflight command above with the original frozen private expectations.
   A changed connected state produces BLOCKED; do not edit expectedState just to
   make it pass. A separately reviewed post-experiment diagnostic config may
   record the approved intended transition. Account/L2 displacement requires
   new operator instruction, not automated restoration. The same Vitest command
   reruns the executable specification without contacting the host.
10. **Remaining limits:** repeatable sampled success cannot qualify invisible
    transitions, globally stable account identity, saved storage isolation,
    simultaneous same/different-account behavior or L1/L2 independence. Neither
    phone confirmation nor a hashed nickname upgrades those to native proof.
    Keep **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED** until a future explicit
    real isolation contract and acceptance actually close those gates.

This is a complete bounded runner specification and executable fixture model,
not an instruction to execute the wire sequence now. MP-2 has not collected
real QR approval and contains no live executor capable of that sequence.
