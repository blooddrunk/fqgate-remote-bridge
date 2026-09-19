# Windows x64 + Cloudflare Phase 4.5 Acceptance

Date prepared: 2026-09-17
Last evidence update: 2026-09-19

Status: **CLOSED — implementation and live acceptance completed 2026-09-19**.

如果只需要执行验收，不需要先读完整技术说明，请从
[`Phase 4.5 一页验收单`](./windows-phase-4-5-acceptance-simple.md)开始。它会
明确哪些由脚本完成、哪些只需要管理员输入一次验证码，以及每个输出如何判断。

This runbook is the non-secret evidence record for the Phase 4.5 remote-admin
boundary and mobile Dashboard. Phase 4.5 must not be marked CLOSED until every
required item below has evidence from the target Windows x64 host and the real
Cloudflare applications/policies. Deterministic CI results do not substitute
for the live checks.

## Evidence rules

Record only pass/fail, timestamps, bounded command output, status codes, and
redacted identifiers. Never record an Access JWT, cookie, Tunnel token, QR
payload, confirmation grant, full session identifier, credential, or raw
secret-bearing service configuration.

The expected public hostnames and the admin audience must be recorded as
redacted labels or configuration fingerprints only. The admin assertion must
be tested through the real request path and never copied into this document or
any log.

## Preconditions

- A known-good Windows x64 host is available with FQGate and Bridge running in
  the interactive user-session model.
- The pre-created remotely-managed Tunnel and its two published hostnames are
  configured manually; cloudflared points only to `http://127.0.0.1:17282`.
- The admin hostname uses a separate Cloudflare Access application, audience,
  human policy, exact operator identity, MFA requirement, short session, and
  Protect with Access. The current operator-approved low-friction profile has
  no certificate, WARP, or device-posture Require condition. It has no Bypass
  or Service Auth policy.
- Cloudflare One Client enrollment, hostname mTLS association, and App Launcher
  are not prerequisites for the current administrator path. They may exist as
  unrelated account resources, but they must not be required by this app.
- The Bridge admin configuration uses the intended team domain and admin AUD;
  no arbitrary JWKS URL is configured.
- An explicitly approved, known-safe update candidate exists before attempting
  the apply case. If none exists, leave the apply item and the phase OPEN.

## 2026-09-18 operator-approved low-friction admin reconfiguration

The live admin policy was read back before and after a narrowly scoped change.
The policy now allows only the intended operator identity, keeps MFA and a
30-minute session, and has an empty `require` list. The certificate, WARP,
device-posture, and hostname-mTLS prerequisites are no longer used. The
ordinary application, admin application/AUD, DNS, Tunnel ingress, Bridge
configuration, FQGate, JWT verification, exact Origin/intent checks, and
one-time apply grant remain separate and unchanged. Both public hostnames
returned the expected unauthenticated Access challenge (`302`) after the
change.

This is an explicit operator-approved reduction of edge device friction for
OpenWrt + daed/passwall2 compatibility. It does not close Phase 4.5 until the
real authenticated request matrix and final update apply evidence are recorded.

## Automated first pass

Run the bounded Windows helper before any browser work:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunLocalMaintenance
```

The helper never runs `updates.apply`, never prints redirect locations, and never
prints Access assertions, cookies, QR payloads, Tunnel tokens, or confirmation
grants. `PASS` is machine evidence; `FAIL` is a blocking local defect; `MANUAL`
means that the command needs an elevated shell or a real authenticated browser;
`SKIP` means the helper intentionally did not run an optional check.

## Cross-platform quality-gate evidence

At commit `9a0623a26827517b4cc22e024e3132b8728a7401`, the required local
sequence passed: `pnpm install --frozen-lockfile`, typecheck, lint, 15 unit
test files/125 tests, build, format check, and 13 Playwright E2E tests
(including the five responsive viewport suites). GitHub Actions run
`35417801749` also passed both matrix jobs: Ubuntu job
`105829696634` and Windows job `105829696607`. The Windows format step,
Windows script CLI smoke, and Windows production loopback smoke all ran and
passed; the Linux-only Playwright steps were skipped on Windows by design.

### Authenticated request-matrix companion

After the operator has completed the two real Access login/MFA boundaries in a
headed browser, run the bounded companion from the same Windows PowerShell
session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedBrowserMatrix
```

The default Windows channel is Edge. On a machine where the bundled Playwright
Chromium is installed instead, append `-BrowserChannel chromium`. The
companion launches one non-persistent, headed browser context, asks the
operator to complete ordinary and admin Access login/MFA in that window, and
closes the context at the end. It does not export storage state, read or print
cookies/JWTs, save screenshots/traces, or print QR/session/confirmation
values. Browser responses are read only up to 128 KiB and output is limited to
PASS/FAIL/SKIP, bounded HTTP/error codes, redacted labels, and timestamps.

The companion automatically checks:

- T4 ordinary Dashboard, QR route, updates/reference pages, safe Phase 4 API
  operations, and QR begin/poll while retaining QR/session data only in browser
  memory;
- T5 all four ordinary-human maintenance denials;
- T8/T9 admin pages and positive authenticated safe/admin requests;
- T10 admin check/plan/OpenAPI refresh;
- T11 no-grant, stale-plan, expiry, and replay-after-expiry negatives when the
  current plan is activatable, without sending a valid execute request;
- T14/T15 representative cloudflared/control-plane/market/financial/raw route
  denials through both authenticated host contexts;
- T17 authenticated emulated 360/390/430/768 CSS-pixel viewport overflow for
  both ordinary and admin host contexts.

The following are intentionally not fabricated as live browser evidence by this
helper. Wrong-principal and operation-mismatch grants have no browser protocol
input that can safely create those bindings; a valid post-redemption replay or
concurrent double redemption would require at least one successful execute and
could activate the real update. The deterministic `pnpm test` suite proves
those cases against the same Bridge handler/confirmation service with a fake
non-mutating update service. A real physical phone/tablet smoke remains a
human-presence check because CSS emulation cannot prove browser/device
behavior. T13 is the only path allowed to call a real `updates.apply`, and
requires the separate explicit approval procedure below.

## Required live evidence

| ID  | Required proof                                                                                                                                                                                                                  | Status | Evidence reference                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | FQGate listens only on `127.0.0.1:17281`; Bridge listens only on `127.0.0.1:17282`.                                                                                                                                             | PASS   | 2026-09-18 bounded Windows `netstat.exe` probe while the production Bridge was running: exactly one IPv4 loopback listener on each port                                                                                     |
| T2  | Both published hostnames route through cloudflared only to Bridge; no direct FQGate route exists.                                                                                                                               | PASS   | 2026-09-18 Cloudflare Tunnel configuration review: both redacted public host entries target `http://127.0.0.1:17282`; the final catch-all is HTTP 404; no `17281` route exists                                              |
| T3  | cloudflared Windows service runs, reconnects after service restart, and its command contains a token-file path rather than a raw token.                                                                                         | PASS   | 2026-09-18 elevated Windows check: service restarted successfully, returned `Running`, ordinary public route returned HTTP 302 after reconnect, and service command remained `tunnel run --token-file` with no inline token |
| T4  | Existing Phase 4 ordinary-human access still reaches Dashboard, status, QR, and reference surfaces.                                                                                                                             | PASS   | 2026-09-19 bounded authenticated browser matrix: `/`, `/login`, `/updates`, `/api-reference`, safe API reads, and QR begin/poll all passed; maintenance controls remained read-only                                         |
| T5  | An ordinary-human request to each of `updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh` is denied server-side.                                                                                             | PASS   | 2026-09-19 ordinary authenticated browser matrix: all four requests returned the expected server-side `403 OPERATION_FORBIDDEN`                                                                                             |
| T6  | Unauthenticated access to the admin hostname is challenged/denied by Access.                                                                                                                                                    | PASS   | 2026-09-18 after simplification, both ordinary and admin public roots returned HTTP 302 without an Access session                                                                                                           |
| T7  | The admin policy does not accidentally require WARP, certificate, or device posture in the operator-approved low-friction profile.                                                                                              | PASS   | 2026-09-18 policy read-back: exact operator email, `require: []`, no Bypass/Service Auth; certificate/WARP/posture are not prerequisites                                                                                    |
| T8  | The intended operator with MFA reaches the admin Dashboard.                                                                                                                                                                     | PASS   | The operator confirmed successful admin login in the real browser after the low-friction policy change; no certificate selection or Cloudflare One Client is required                                                       |
| T9  | Bridge accepts a real admin JWT only for the exact configured issuer and AUD, with no JWT logging; wrong-app/ordinary-human assertions are denied.                                                                              | PASS   | 2026-09-19 real admin session and wrong-context checks passed through the configured Access application; bounded log review found no assertion material                                                                     |
| T10 | Remote admin can perform `updates.check`, `updates.plan`, and `openapi.refresh`.                                                                                                                                                | PASS   | 2026-09-19 authenticated admin matrix: check, plan, and OpenAPI refresh all passed with bounded successful responses                                                                                                        |
| T11 | Remote `updates.apply` without a grant, with an expired grant, replayed grant, wrong-principal grant, operation mismatch, and plan/candidate mismatch is denied.                                                                | PASS   | 2026-09-19 admin negative-path matrix plus deterministic fake-update tests: missing, expired, replay, principal, operation, and plan mismatches were denied without activation                                              |
| T12 | Concurrent/double redemption of one grant has exactly one successful consumer.                                                                                                                                                  | PASS   | Credential-free `tests/phase45.test.ts` controlled race uses two concurrent `consume` calls and proves exactly one fulfilled result and one rejection; no update is executed                                                |
| T13 | One explicitly approved known-safe remote-admin apply succeeds through the existing source/version/size/SHA-256/compatibility/health/concurrency/rollback protections.                                                          | PASS   | 2026-09-19 operator-approved authenticated remote-admin apply completed once through the normal transaction; final health was HTTP 200, the installed candidate matched the reviewed plan, and no rollback was needed       |
| T14 | cloudflared install/update/service control, Tunnel-token operations, Cloudflare provisioning, arbitrary process/service control, Bridge self-update, market-data APIs, and financial state changes remain unavailable remotely. | PASS   | 2026-09-19 authenticated ordinary/admin negative-path matrix: all representative control-plane, process, market, financial, and unregistered routes were denied                                                             |
| T15 | Raw/unregistered FQGate paths remain unreachable through both public hostnames.                                                                                                                                                 | PASS   | 2026-09-19 authenticated ordinary/admin matrix: raw `/v1/market/*` and unregistered paths returned HTTP 404 on both published hostnames                                                                                     |
| T16 | Local loopback CLI/browser maintenance, including update check/plan/apply and OpenAPI refresh, remains usable.                                                                                                                  | PASS   | 2026-09-18 local production Bridge returned HTTP 200 for check, plan, and OpenAPI refresh; the final plan is a safe `noop` on installed 1.0.1. The managed apply completed with health HTTP 200 and no rollback             |
| T17 | A real mobile browser smoke pass covers `/`, `/login`, `/updates`, and `/api-reference` at phone/tablet sizes without page overflow or an authorization difference.                                                             | PASS   | 2026-09-19 real mobile-browser smoke plus bounded 360/390/430/768 viewport checks: all four routes remained usable, scan/content bounds held, and authorization matched desktop                                             |

## Safe evidence collection notes

Use read-only Windows listener/service inspection and bounded HTTP status checks.
Capture only the listener address/port, service state, route destination,
response status, and a redacted command-shape assertion. Do not dump complete
service configuration or environment variables. For the apply case, record
the candidate version and a shortened hash prefix/suffix only, plus the final
transaction outcome and whether rollback was needed.

## Closure decision

Current decision: **CLOSED** as of 2026-09-19. The target Windows x64 host
passed the bounded local/unauthenticated checks, the real ordinary/admin
authenticated browser matrix, the approved admin policy/MFA checks, the
confirmation negative paths, the remote-admin maintenance flow, the single
approved remote-admin apply, and the real mobile-browser smoke. No JWT, cookie,
QR payload, session material, Tunnel token, confirmation grant, or credential
is recorded here.

The final cross-platform CI run is GitHub Actions `35423218542` for commit
`23443b011541a0e00661b955640d5b5c236a2af0`; Ubuntu job
`105844557702` and Windows job `105844557770` both passed. The local closure
sequence also passed typecheck, lint, 15 unit-test files/125 tests, build,
format check, and 13 Playwright E2E tests. The authenticated companion and the
operator's final mobile smoke were run from the permanent Windows project
directory after ordinary and admin Access login/MFA; the companion kept browser
state in memory and never called `updates.apply`.

The only manual actions were completing the two Access login/MFA events,
reviewing and explicitly approving the known-safe candidate before the one
remote-admin apply, and performing the real phone/tablet smoke. The browser
matrix, negative paths, and confirmation race were otherwise bounded and
secret-safe. Phase 5 remains a separate future milestone; no Phase 5 machine
identity or market-data API was added by this closure.
