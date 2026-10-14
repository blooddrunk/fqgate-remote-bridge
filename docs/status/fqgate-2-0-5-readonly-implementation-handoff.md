# FQGate 2.0.5 read-only compatibility and recovery readiness

Updated: 2026-10-14. **Bounded read-only local and remote runtime acceptance PASS.**
Full v2 installation/signature/replay/rollback qualification remains unproven.
Task: `docs/tasks/fqgate-2-0-5-readonly-compatibility.md`.
Implementation PR: [#17](https://github.com/blooddrunk/fqgate-remote-bridge/pull/17),
Final head, CI jobs and PR/merge state are bound in the external delivery receipt.
No Issue or planning-only PR was created.

## Delivered behavior

The existing six-digit `market.instruments.lookup` now selects an independent
exact Windows 2.0.5 adapter when managed installation state selects v2. The
original v1 adapter/qualification probe, global supportedRange/validatedVersions,
registry, routes, human/admin/machine permissions and Access verifiers are
preserved. Unknown v2 artifacts/versions do not inherit v1 qualification.

The adapter verifies the full pinned nine-file payload, native recorded PID,
executable path/creation time and sole IPv4 listener. It checks the actual
canonical version/health and reviewed five-operation OpenAPI fingerprint,
discovers exactly one connected ready tonghuashun source, independently checks
that source's account snapshot, and sends fixed canonical search with a
server-owned instance header. It rechecks source/worker identity, account,
version, contract, process and payload before returning. Observed drift discards
the result. It cannot prove an undetectable disconnect/reconnect between samples.

The HTTP flow shares 5000 ms; both native identity subprocesses separately allow
5000 ms, and filesystem scans have count/size limits. Search permits 64 KiB and
16 items, validates envelope/row count/data state/coverage, and returns exact
code matches only. It never retries or guesses a default source. v2's
`instrumentId` is explicitly `market:code` (e.g. `XSHG:600000`); v1 identifiers
are unchanged. No source/account selector or raw proxy is public.

The existing inert directory hash scanner now accepts only the official root
`.fqgate-plugin-package` directory; other hidden/nested names and links still
fail. The transaction/authority kernel remains unconnected to an installer.
New fixtures prove profile/data separation and repeat-safe failed recovery.
Strict enum types and fatal UTF-8 decoding reject coercible arrays and malformed
text rather than normalizing an unverified response.
The remote matrix now emits bounded `REQUEST_TIMEOUT` / `REMOTE_HTTP_502`
classification without exception text, headers, credentials or raw bodies.

Primary files:

- `src/fqgate/market/v2.ts`, `v2-identity.ts`, `lookup.ts`, `contract.ts`;
- `src/app/runtime.ts`, `src/fqgate/v2/directory-transaction.ts`;
- `tests/fqgate-v2-lookup.test.ts`, `fqgate-v2-identity.test.ts`,
  `fqgate-v2-transaction.test.ts`;
- `scripts/windows/fqgate205-readonly-probe.mjs`, `phase5c-matrix.mjs`;
- AGENTS, README, roadmap, architecture, security, upstream contracts and agent guide.

## Source and code verification

Fetched main was and remains `b7a497ec020d5f4c78c87560264488a67169b5a9`.
PR #15 is merged at `30de05d5694648ce2dc82ca71c6b9e478ff5817e`; #12/#13 and
Issue #16 are closed. #15's merge CI passed; latest main CI
[38381910281](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38381910281)
failed only formatting of AGENTS/roadmap. This implementation fixes those files.

Final runtime implementation `1830d90703d351752b9fc564181fb47c5dc41fdd` passed all
seven requested Linux checks, 29 suites / 535 tests and 15 browser tests. The
permanent Windows checkout passed frozen install, pinned pnpm 11.23.0,
typecheck, lint, 535 tests, build:cli, format and 15 browser tests. Full production build on that installed Windows checkout passed during the
explicitly authorized Bridge-only deployment; exit 0, pinned pnpm 11.23.0.
Initial tooling/version failures and the hidden-directory rejection are retained
as separate failed-attempt receipts, excluded from PASS totals.

The initial runtime implementation passed Ubuntu/Windows
[CI 38384495297](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38384495297).
The subsequent matrix-classification commit
`0d8d387f6e5a7bd94d600800f0580a2ed9a94f33` passed Ubuntu/Windows
[CI 38386272352](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38386272352).
The strict-decoder runtime commit passed Ubuntu/Windows
[CI 38388074453](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/38388074453).
The final documentation commit must also pass exact-head CI. Its SHA/job URLs
are recorded in the external delivery receipt, avoiding a self-referential
commit/CI claim in this file.

v1 deterministic regressions passed on Linux/native Windows: Phase 5-A 22,
5-B 44, 5-C 5, lifecycle 15, health 9, candidate 9 and config/compatibility 18
(122 tests in these named suites). The full remaining baseline also passed.
A real v1 runtime switch was NOT_EXECUTED to preserve the running 2.0.5.

## Historical Windows local results — 2026-10-13

The operator explicitly approved restarting only Bridge. On 2026-10-13 at
13:32:14Z, the deployment replaced the identity-checked old Bridge PID 57956
with PID 5860, build `3f78bb9948d95bf7ffb21809bba2baab283e7fed`.
The native full build and socket matrix both exited 0. FQGate PID 30424 remains
on 127.0.0.1:17281; cloudflared PID 6908 remains running with unchanged creation
time. Config, current/previous payload, state and process-file hashes are unchanged.
Bridge remains solely on 127.0.0.1:17282. No QR/login approval was needed.

| Gate                          | Expected                 | Deployed 17282 socket |
| ----------------------------- | ------------------------ | --------------------- |
| P5C-L2 machine OpenAPI        | 200, 2 paths / 5 schemas | PASS / 200            |
| P5C-L3 exact lookup           | 200, one exact result    | PASS / 200            |
| P5C-L4 extra input field      | 400 REQUEST_INVALID      | PASS / 400            |
| P5C-L5 oversized body         | 413 REQUEST_TOO_LARGE    | PASS / 413            |
| P5C-L6 raw upstream path      | 404, no proxy            | PASS / 404            |
| P5C-L7 unknown/forwarded Host | 421 HOST_NOT_ALLOWED     | PASS / 421            |

Deployed local acceptance: **6/6**, 13:32:16Z–13:32:22Z. The earlier old-socket
5/6 and separate in-process 6/6 receipts remain historical evidence.

## Historical remote matrix — 2026-10-13T13:32:46Z to 13:37:41Z

Existing `phase5c-matrix.mjs` with current-user Vault and the existing ingress
binding completed **3/22**, exit 1. No updates.apply or Cloudflare mutation.
All tests were executed; none is counted PASS for a transport failure.

| Gate                      | Result | Actual          |
| ------------------------- | ------ | --------------- |
| R1 no-token challenge     | PASS   | 401             |
| R2 machine OpenAPI        | FAIL   | REQUEST_TIMEOUT |
| R3 instrument lookup      | FAIL   | REMOTE_HTTP_502 |
| R4 malformed input        | FAIL   | REQUEST_TIMEOUT |
| R5 oversized input        | FAIL   | REMOTE_HTTP_502 |
| R6 raw upstream path      | FAIL   | REMOTE_HTTP_502 |
| deny bridge.version       | FAIL   | REMOTE_HTTP_502 |
| deny bridge.capabilities  | FAIL   | REQUEST_TIMEOUT |
| deny bridge.status        | FAIL   | REMOTE_HTTP_502 |
| deny session.qr.begin     | FAIL   | REQUEST_TIMEOUT |
| deny session.qr.poll      | FAIL   | REMOTE_HTTP_502 |
| deny updates.status       | FAIL   | REQUEST_TIMEOUT |
| deny updates.check        | FAIL   | REMOTE_HTTP_502 |
| deny updates.plan         | FAIL   | REMOTE_HTTP_502 |
| deny updates.qualify      | FAIL   | REMOTE_HTTP_502 |
| deny openapi.catalog      | FAIL   | REMOTE_HTTP_502 |
| deny openapi.refresh      | FAIL   | REQUEST_TIMEOUT |
| page /                    | FAIL   | REMOTE_HTTP_502 |
| page /assets/probe.js     | FAIL   | REMOTE_HTTP_502 |
| page /api/v1/unregistered | FAIL   | REMOTE_HTTP_502 |
| human hostname isolation  | PASS   | 302             |
| admin hostname isolation  | PASS   | 302             |

Layered observations:

- FQGate and Bridge each have exactly one expected IPv4 loopback listener;
  FQGate native path/PID/creation and payload verification pass.
- Real canonical upstream search and the deployed local socket pass 6/6;
  application permission fixtures pass.
- cloudflared service is running; post-deployment local metrics returned 200, one HA
  connection (earlier observation: two) and zero reported request errors. Its LocalSystem executable path
  is unreadable at current privileges, so independent native path identity is
  BLOCKED, not silently accepted.
- Existing read-only Cloudflare plan passed 46/46, zero drift/conflicts/writes,
  with exact Bridge-only ingress and distinct human/admin/machine resources.
- Windows Node requests to the configured fixed Access cert endpoint timed out
  after 10006/10012 ms for admin/machine. That authentication transport
  prerequisite is BLOCKED. No JWT/AUD/issuer/Origin/policy check is weakened.
- Remote responses contain 13 HTTP 502 and six request timeouts without a
  normalized Bridge result. Certificate unavailability is established, but
  these observations do not prove it is the exclusive cause of every 502.
  Real authorized machine success and remote denial behavior remain unverified.

## Artifact and recovery readiness

Fresh native official non-executing audit passed 2026-10-13T10:54:47Z:
2.0.5 ZIP 29236811 bytes, SHA-256
`c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba`,
nine entries / 60709870 uncompressed bytes, temporary ZIP cleanup REMOVED.
Current nine-file tree matches
`9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f`.
The configured WebView2 profile exists outside current payload. Transaction and
recovery locks are absent. Previous 1.0.5 EXE remains 23707648 bytes / SHA-256
`2b9613dbf2d0f10b1672684f2e24ac8917d2d8d3fa9bd7fbbae04d57dd73d83c`.
This previous executable does not establish a complete data-preserving rollback.

78 inert transaction tests pass on both platforms, including five crash points,
failed rollback/retained guards, repeated recovery, profile/data separation,
corruption/replay and link/path cases. Real power-loss/rollback and full separate
v2 data backup/reverse transaction are NOT_EXECUTED. Publisher signature and
end-to-end authenticated replay are BLOCKED; signatureVerified remains false.
The exact operator risk exception is not general installation authority.
Only the explicitly authorized Bridge restart occurred; no FQGate/cloudflared
restart, directory switch or automatic recovery occurred.

## Final live restoration — 2026-10-14

Windows booted at 2026-10-13T21:33:24.5000000Z. Before restoration, FQGate was
PID 24856 and cloudflared PID 5788, while Bridge had no 17282 listener. This
explains the fresh 19 fast 502 responses on that observation; it does not
retroactively prove the cause of every historical 502. The already-authorized
Bridge-only recovery launched detached PID 38140 from the existing reviewed
production bundle, build metadata `3f78bb9948d95bf7ffb21809bba2baab283e7fed`.
No startup service or Scheduled Task was installed. A successful listener/build
proof is separate from the initial PowerShell exit-code wrapper failure.

The fixed Access certificate path was initially variable: DNS resolved the same
two public IPv4 addresses, direct TCP/TLS/HTTPS sometimes succeeded and sometimes
timed out. Router WAN headers confirmed direct traffic. Windows curl success
alone did not establish the Node/Bridge 5-second prerequisite. The operator
explicitly authorized and applied this exact rule before the existing China
rules, preserving Tunnel/7844/DNS/node rules and Cloudflare configuration:

```text
domain(full: haoqi90.cloudflareaccess.com) -> premium
```

After reload, four independent native Node cold processes all fetched the fixed
certificate endpoint with HTTP 200 and two keys in 801/372/368/372 ms. This is a
bounded successful sample, not a guarantee of future network availability. The
remote matrix then passed 21/22; lookup alone failed the local identity gate.

The restarted FQGate PID no longer matched the stale process.json PID 30424.
The official nine-file subset still matched its pinned tree, but a new
`current/FQGate.exe.WebView2` directory made the full payload unsafe. The adapter
correctly denied lookup; neither gate was relaxed or bypassed.

The operator separately authorized one maintenance window for a graceful exit,
verified independent backups of both profiles, relocation of the current profile
to the already-configured external directory, restart of the same EXE with
process-local WEBVIEW2_USER_DATA_FOLDER and native-verified process-record refresh.
Ordinary window closure did not exit the app, so the operator used its own Exit
entry. No force-kill occurred. An initial Windows directory-copy semantic error
stopped before profile/record writes, restored the preceding running topology,
and retained its failed-attempt receipt. The corrected copy was verified with an
inert native Windows fixture before continuing in the authorized window.

Both complete profile backups passed before any directory was moved:

- current profile: 314 files / 33714217 bytes;
- preceding external profile: 337 files / 38807599 bytes.

Sensitive profiles/manifests remain in a separate protected application backup
folder, never Git or the secret-free evidence folder. The original directory
copies also remain. The external profile path and operator policy are unchanged.
The full nine-file payload again matches its pinned tree; same FQGate 2.0.5 EXE
now runs as PID 34980. The refreshed process-record SHA is
`acefd2c955daafc3d7a042f79bf92fd9d33697cb511363870d26dabe05beccd7`.
Bridge PID 38140 and cloudflared PID 5788 were preserved through that maintenance.
Config/state/previous artifact and policy remain unchanged. No QR or MFA was
needed; the real exact lookup and before/after native identity proof passed.

### Final local matrix — 2026-10-14T03:16:42Z to 03:16:50Z

| Gate                          | Result | Actual                   |
| ----------------------------- | ------ | ------------------------ |
| P5C-L2 machine OpenAPI        | PASS   | 200, 2 paths / 5 schemas |
| P5C-L3 exact lookup           | PASS   | 200, one exact match     |
| P5C-L4 extra input field      | PASS   | 400 REQUEST_INVALID      |
| P5C-L5 oversized body         | PASS   | 413 REQUEST_TOO_LARGE    |
| P5C-L6 raw upstream path      | PASS   | 404, no proxy            |
| P5C-L7 unknown/forwarded Host | PASS   | 421 HOST_NOT_ALLOWED     |

**6/6, exit 0**, against the deployed Windows HTTP socket.

### Final remote matrix — 2026-10-14T03:17:37Z to 03:18:05Z

Existing Vault-backed phase5c-matrix.mjs: **22/22, exit 0**. No updates.apply,
Access-policy change or Cloudflare API write was used.

| Gate                      | Result | Actual                  |
| ------------------------- | ------ | ----------------------- |
| R1 no-token challenge     | PASS   | 401 NO_BRIDGE_ERROR     |
| R2 machine OpenAPI        | PASS   | 200 NO_BRIDGE_ERROR     |
| R3 instrument lookup      | PASS   | 200 NO_BRIDGE_ERROR     |
| R4 malformed input        | PASS   | 400 REQUEST_INVALID     |
| R5 oversized input        | PASS   | 413 REQUEST_TOO_LARGE   |
| R6 raw upstream path      | PASS   | 403 OPERATION_FORBIDDEN |
| deny bridge.version       | PASS   | 403 OPERATION_FORBIDDEN |
| deny bridge.capabilities  | PASS   | 403 OPERATION_FORBIDDEN |
| deny bridge.status        | PASS   | 403 OPERATION_FORBIDDEN |
| deny session.qr.begin     | PASS   | 403 OPERATION_FORBIDDEN |
| deny session.qr.poll      | PASS   | 403 OPERATION_FORBIDDEN |
| deny updates.status       | PASS   | 403 OPERATION_FORBIDDEN |
| deny updates.check        | PASS   | 403 OPERATION_FORBIDDEN |
| deny updates.plan         | PASS   | 403 OPERATION_FORBIDDEN |
| deny updates.qualify      | PASS   | 403 OPERATION_FORBIDDEN |
| deny openapi.catalog      | PASS   | 403 OPERATION_FORBIDDEN |
| deny openapi.refresh      | PASS   | 403 OPERATION_FORBIDDEN |
| page /                    | PASS   | 403 OPERATION_FORBIDDEN |
| page /assets/probe.js     | PASS   | 403 OPERATION_FORBIDDEN |
| page /api/v1/unregistered | PASS   | 403 OPERATION_FORBIDDEN |
| human hostname isolation  | PASS   | 302 NO_BRIDGE_ERROR     |
| admin hostname isolation  | PASS   | 302 NO_BRIDGE_ERROR     |

## Evidence and remaining boundaries

Original implementation receipts remain under
`D:\code\research\fqgate-205-readonly-evidence`. The final live diagnostics,
maintenance journal, native proof, local/remote case results and per-file evidence
SHA-256 bindings are under `D:\code\research\fqgate-access-diagnostics-20261014`.
The final delivery report binds the final source/main/PR state and exact-head CI;
initial failures and historical 3/22 or 21/22 receipts are not counted as PASS.

Repeat current observation from the permanent checkout:

```powershell
node scripts/windows/fqgate205-readonly-probe.mjs --config D:\code\research\fqgate-acceptance-config.json
node scripts/windows/phase5c-matrix.mjs --local
powershell.exe -NoProfile -File D:\code\research\fqgate-access-diagnostics-20261014\remote-after-maintenance.ps1
```

The one-use maintenance helper is bound to the preceding process and refuses a
new runtime state. It is not a generic startup/recovery actuator. Future manual
startup must preserve the external WebView2 profile and independently verified
process record; no unattended startup integration is implemented here.

Signature verification, authenticated release replay, full data-preserving v2
upgrade/reverse transaction and power-loss qualification remain BLOCKED or
NOT_EXECUTED. The copy-failure runtime restoration is not full v2 version
rollback qualification. Independent LocalSystem executable-path reading remains
unavailable at current privilege; service PID/creation/listener and remote
functional results do not relabel that optional native-path proof PASS.
Next bounded work is v2 QR/session compatibility or independently authenticated
installation/rollback qualification. Phase 7-B2/C remains unauthorized. No new
Issue or planning-only PR is created.
