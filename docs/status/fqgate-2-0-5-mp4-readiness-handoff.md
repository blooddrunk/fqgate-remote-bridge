# MP-4 Native Source contract and GET-only readiness handoff

Date: 2026-10-23, Asia/Taipei. **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.
MP-4 implements read-only engineering readiness. **NO-GO for production
multi-account integration**; real native account isolation remains unqualified.

## Delivered behavior and decision

The [version-pinned contract matrix](../plans/fqgate205-mp4-native-source-contract.md)
reviews public exact-version release/docs, installed client bytes and fresh native
OpenAPI structure. There is no reviewed non-display account ID or monotonic
session epoch. Source lifecycle and Saved Login client actions exist; independent
restore/storage, concurrent accounts and L2 behavior remain UNPROVEN. Independent
process port and complete storage/IPC startup contracts separately remain UNKNOWN.
No claim is based on token scans, display equality or equal snapshots alone.

The smallest future research step is one separately approved login to existing
Source B while observing A. The [future protocol](../operations/windows-fqgate205-mp4.md)
specifies exact host/artifact/private mapping/build fences, visible readiness and
phone authorization, one begin, serial ≥2-second polls, ≤120 seconds/60 polls,
stop conditions, retained-login/displacement risks and rollback limits. It is
design only: **no reachable POST mode was added**, no upstream question was sent,
no phone/account/L2/Saved Login experiment was performed.

MP-2's standalone preflight is reused. Its old TypeScript entry now re-exports
`source-readiness.ts`; the Windows wrapper imports that new compiled module.
This avoids replacing any existing permanent-host dist/.output file. Private
alias→Source ID/number/state mapping is immutable and checked against the full
bounded inventory. No connected-account fallback. New checks cover:

- Exclusive listener owners, repeated CIM PID+creation+parent+executable facts,
  readable non-reparse executable ancestors, worker creation no earlier than
  parent and no worker PID shared across Sources.
- Fixed exact 2.0.5 client/OpenAPI, current Bridge version expectation and checkout
  comparison; final build/process checks. Absent/unverified 17282 suppresses
  Bridge requests and reports BLOCKED, never launches a process.
- Observation timestamp age ≤30 seconds, future skew ≤2 seconds, explicit
  timezone, no regression, still fresh after final verification. This is a local
  freshness policy, not native epoch proof. A→B→A remains undetectable.
- Immediate failure/cancellation fencing of peer follow-up requests and delayed
  publication; no retries. Existing in-flight reads retain their bounded timeout.
- Explicit identity/epoch/L2/Saved Login UNPROVEN gates, process/account experiment
  NOT_EXECUTED gates, and a concrete resume-procedure reference in receipts.

## Source and runtime custody

First WSL status was clean at MP-3 source `a73e047`. Fetch/prune and main log
confirmed PR #23 merged as `eb70a6dc4e3d04bbb94974bbfb3dd7b562f3ce97`.
Created `codex/fqgate205-mp4-native-source` from that fetched main. Existing clean
permanent Windows checkout was inspected, fetched and switched to the same base
in place. No reset/clean, force push, second checkout or production rebuild.

Before native work, external SHA-256 manifests covered 283 existing permanent
Windows dist/.output files plus application/private mapping configuration. Only
the previously absent standalone diagnostic artifact was added. Its four direct
compiled dependencies were byte-equal to the WSL build before reuse; existing
runtime outputs/configuration are preserved. Source/scripts and tool hashes are
recorded separately from checkout and unknown running-Bridge identity. No
FQGate/Bridge/cloudflared launch/stop/restart, deployment, config/ACL change or
native Source/Saved Login/WebView mutation occurred.

## Real Windows observation — BLOCKED, not live acceptance

Current GET-only receipt (2026-10-23T06:45:26.597Z) records **7 OBSERVED /
9 BLOCKED / 4 UNPROVEN / 2 NOT_EXECUTED**, exit **1**, **16 GET / 0 POST /
0 account writes / 0 QR begin / 0 QR poll**. Receipt SHA-256:
`438796b64f08d8d4992f55f911f406fe36ae2a51f4759449e5cb5afa9cdb6bbe`.
Later final-source repeat metadata is bound in the external delivery receipt.

| Gate                               | Actual output classification and consequence                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native 17281                       | OBSERVED: exactly one IPv4 loopback owner, two ready direct workers with stable sampled native creation identities. Version 2.0.5 / ready and scoped OpenAPI passed read-only checks.                                                          |
| Existing A/B Sources               | OBSERVED: A number 1 connected, Saved Login available, L2=false; B number 2 disconnected, Saved Login unavailable, L2 unknown. Both bounded samples equal and fresh. These are not account/epoch credentials or simultaneous-login acceptance. |
| Bridge 17282                       | **BLOCKED / LISTENER_ABSENT** in each native sample. No current Bridge owner or running commit exists to inspect. Private expected build is historical `481db65097cd63ea0f9c28f39e526e341b700721`, not current evidence.                       |
| Bridge version/method denial       | **BLOCKED / RUNNING_BUILD_UNAVAILABLE / METHOD_DENIALS_UNVERIFIED**. No GET issued to an unowned Bridge port; authenticated remote policy acceptance cannot be claimed.                                                                        |
| Payload/process record             | **BLOCKED / INSTALL_OR_PROCESS_RECORD_UNVERIFIED**. Matching exact EXE/client slices do not verify the complete installed tree/process record. No repair follows.                                                                              |
| Account identity/session epoch     | **UNPROVEN**: no reviewed strong identity/epoch; A→B→A blind spot persists.                                                                                                                                                                    |
| Saved Login/L2 independence        | **UNPROVEN**: availability/entitlement flags are not restore/storage/peer-data evidence.                                                                                                                                                       |
| Native experiment/process mutation | **NOT_EXECUTED**. No approval needed for MP-4; no approval sought for account or process mutation.                                                                                                                                             |

Independent existing QR Preflight: **14 PASS / 7 BLOCKED / 1 NOT_EXECUTED**,
exit **1**. Its blocked outputs are `PAYLOAD` (installation drift/transaction/
unreadable), `LISTENER_17282` (absent), `PROCESS_RECORD` (native identity mismatch/
unreadable), `WEBVIEW_PROFILE` (inside immutable payload), `BRIDGE_BUILD`
(unavailable/unbound), `QR_SCOPED_READINESS` (process identity mismatch), and
`RUNTIME_CONTINUITY` (changed/unverified). Those are concrete unresolved gates;
passing exact-client/schema checks do not override them. Unauthenticated edge/
certificate GETs in this existing diagnostic do not establish remote login or
machine authorization. No authenticated remote/lookup POST smoke was run.

Reproduce from existing Windows checkout using the exact commands in the
[MP-4 procedure](../operations/windows-fqgate205-mp4.md): listener table, MP-2
wrapper with existing private config/mapping and MP-4 evidence directory, then
QR `-Mode Preflight`. Missing Bridge requires a separately authorized Bridge-only
launch/deployment decision; it is not an automatic recovery step. Installation,
process-record and WebView blockers likewise require their own review. Even after
those are resolved, identity/epoch/L2/Saved Login remain unqualified.

## Automated verification

External logs/exit/hash receipts:
`/home/jelinenaro/research/fqgate-mp4-evidence-20261023` and
`D:\code\research\fqgate-mp4-evidence`. Final PR HEAD, CI run/jobs and exact-source
native repeat are recorded in `delivery-receipt.json` outside Git to avoid a
self-referential commit. CI success establishes source/fixture behavior only.

| Command                                    | Result / exit                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `corepack pnpm install --frozen-lockfile`  | PASS / 0                                                                       |
| `corepack pnpm typecheck`                  | PASS / 0                                                                       |
| `corepack pnpm lint`                       | PASS / 0                                                                       |
| `corepack pnpm test`                       | 808 PASS, 0 failed, 37 files / 0                                               |
| `corepack pnpm build`                      | PASS / 0                                                                       |
| `corepack pnpm format:check`               | PASS / 0                                                                       |
| `corepack pnpm test:e2e`                   | 19 PASS, 0 failed / 0                                                          |
| `node scripts/audit-profile-prototype.mjs` | PASS; zero production imports of MP-1, MP-3 model or readiness diagnostics / 0 |
| Windows `test-fqgate205-mp2-native.ps1`    | 14 fixture assertions / 0                                                      |
| Windows `test-fqgate205-mp3-native.ps1`    | 14 fixture assertions / 0                                                      |
| Windows `test-fqgate205-mp4-cli.ps1`       | 6 rejected-flag scenarios / 0                                                  |
| Windows `test-fqgate205-qr-preflight.ps1`  | 28 fixture assertions / 0                                                      |
| Windows `test-fqgate205-qr-identity.mjs`   | 5 identity + 1 no-approval guard / 0                                           |
| Windows `test-fqgate-v2-observation.ps1`   | 40 fixture scenarios / 0                                                       |
| Real MP-4 GET-only / existing QR Preflight | BLOCKED as detailed above / 1 each                                             |

Windows commands use `powershell.exe -NoProfile -NonInteractive -File
.\scripts\windows\<name>.ps1`; identity uses `node` on the named MJS. Native exits
are captured with explicit Windows executable paths and `Start-Process -Wait
-PassThru`, not inferred from WSL shell exit. **Windows browser E2E is skipped**
by unchanged CI platform policy; Linux Chromium E2E runs. CI's fixture Bridge
smoke is not a permanent-host deployment or real FQGate process launch.

The preflight suite now has 56 cases (42 retained MP-2 + 14 MP-4). New negative
names: MP4-01 stale/future/zone-less; MP4-02 timestamp regression; MP4-03
reparse/parent-after-worker (including 100-ns order)/shared-worker/unreadable-creation; MP4-04 absent Bridge
with no unowned GET; MP4-05 unknown OpenAPI; MP4-06 failed-peer/delayed-response
race; MP4-07 redacted native collector failure; MP4-08 expiration before
publication. Existing reversed A/B completion, cancellation, unknown identities,
Source recreation/renumbering, account/Saved Login/L2 drift and A→B→A limitation
remain covered. Native additions reject unreadable/reparse ancestors, PID reuse
at seven-decimal creation precision, vanished processes and listener drift.
CLI fixtures reject Live/apply/generic URL/method/source and allow-live-qr flags
before native reads. No new simulation framework or native login executor.

## Preserved production boundary

Production v1 and exact-2.0.5 market/QR adapters, single-connected-source guard,
operation registry, Host/JWT/Origin/admin confirmation, remote-machine QR denial,
configuration, routes/UI and Cloudflare are unchanged. Full regression includes
these suites plus the complete four-context × operation matrix. MP-1 remains
unconnected; import audit now additionally rejects production reachability into
either readiness diagnostic. No library dependency or lockfile change.
