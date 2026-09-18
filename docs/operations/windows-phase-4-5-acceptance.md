# Windows x64 + Cloudflare Phase 4.5 Acceptance

Date prepared: 2026-09-17
Last evidence update: 2026-09-18

Status: **OPEN — implementation is complete in code, but live acceptance is not recorded**.

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
15-minute session, and has an empty `require` list. The certificate, WARP,
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
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -RunLocalMaintenance
```

The helper never runs `updates.apply`, never prints redirect locations, and never
prints Access assertions, cookies, QR payloads, Tunnel tokens, or confirmation
grants. `PASS` is machine evidence; `FAIL` is a blocking local defect; `MANUAL`
means that the command needs an elevated shell or a real authenticated browser;
`SKIP` means the helper intentionally did not run an optional check.

## Required live evidence

| ID  | Required proof                                                                                                                                                                                                                  | Status           | Evidence reference                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | FQGate listens only on `127.0.0.1:17281`; Bridge listens only on `127.0.0.1:17282`.                                                                                                                                             | PASS             | 2026-09-18 bounded Windows `netstat.exe` probe while the production Bridge was running: exactly one IPv4 loopback listener on each port                                                                                                                    |
| T2  | Both published hostnames route through cloudflared only to Bridge; no direct FQGate route exists.                                                                                                                               | PASS             | 2026-09-18 Cloudflare Tunnel configuration review: both redacted public host entries target `http://127.0.0.1:17282`; the final catch-all is HTTP 404; no `17281` route exists                                                                             |
| T3  | cloudflared Windows service runs, reconnects after service restart, and its command contains a token-file path rather than a raw token.                                                                                         | PASS             | 2026-09-18 elevated Windows check: service restarted successfully, returned `Running`, ordinary public route returned HTTP 302 after reconnect, and service command remained `tunnel run --token-file` with no inline token                                |
| T4  | Existing Phase 4 ordinary-human access still reaches Dashboard, status, QR, and reference surfaces.                                                                                                                             | NOT EVIDENCED    | Real human-browser smoke required                                                                                                                                                                                                                          |
| T5  | An ordinary-human request to each of `updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh` is denied server-side.                                                                                             | NOT EVIDENCED    | Two-host request matrix required                                                                                                                                                                                                                           |
| T6  | Unauthenticated access to the admin hostname is challenged/denied by Access.                                                                                                                                                    | PASS             | 2026-09-18 after simplification, both ordinary and admin public roots returned HTTP 302 without an Access session                                                                                                                                          |
| T7  | The admin policy does not accidentally require WARP, certificate, or device posture in the operator-approved low-friction profile.                                                                                              | PASS             | 2026-09-18 policy read-back: exact operator email, `require: []`, no Bypass/Service Auth; certificate/WARP/posture are not prerequisites                                                                                                                   |
| T8  | The intended operator with MFA reaches the admin Dashboard.                                                                                                                                                                     | RECHECK REQUIRED | The browser must complete one post-change login; no certificate selection or Cloudflare One Client is required                                                                                                                                             |
| T9  | Bridge accepts a real admin JWT only for the exact configured issuer and AUD, with no JWT logging; wrong-app/ordinary-human assertions are denied.                                                                              | NOT EVIDENCED    | Redacted request/log review required                                                                                                                                                                                                                       |
| T10 | Remote admin can perform `updates.check`, `updates.plan`, and `openapi.refresh`.                                                                                                                                                | NOT EVIDENCED    | Real admin request trace required                                                                                                                                                                                                                          |
| T11 | Remote `updates.apply` without a grant, with an expired grant, replayed grant, wrong-principal grant, operation mismatch, and plan/candidate mismatch is denied.                                                                | NOT EVIDENCED    | Real admin negative cases required                                                                                                                                                                                                                         |
| T12 | Concurrent/double redemption of one grant has exactly one successful consumer.                                                                                                                                                  | NOT EVIDENCED    | Real or controlled acceptance race required                                                                                                                                                                                                                |
| T13 | One explicitly approved known-safe remote-admin apply succeeds through the existing source/version/size/SHA-256/compatibility/health/concurrency/rollback protections.                                                          | BLOCKED          | 1.0.1 passed isolated Windows x64 validation and is now `validated`; two real local apply attempts reached candidate activation but ended in `HEALTH_TIMEOUT` and automatic rollback. Current FQGate is 1.0.0/ready; remote-admin apply remains unaccepted |
| T14 | cloudflared install/update/service control, Tunnel-token operations, Cloudflare provisioning, arbitrary process/service control, Bridge self-update, market-data APIs, and financial state changes remain unavailable remotely. | NOT EVIDENCED    | Negative-path request review required                                                                                                                                                                                                                      |
| T15 | Raw/unregistered FQGate paths remain unreachable through both public hostnames.                                                                                                                                                 | NOT EVIDENCED    | Negative-path request review required                                                                                                                                                                                                                      |
| T16 | Local loopback CLI/browser maintenance, including update check/plan/apply and OpenAPI refresh, remains usable.                                                                                                                  | PARTIAL          | 2026-09-18 local production Bridge returned HTTP 200 for version and plan; target 1.0.1 is `action: update` with `compatibility: validated`; two apply attempts rolled back with `HEALTH_TIMEOUT`, and 1.0.0 was restored to `ready`                       |
| T17 | A real mobile browser smoke pass covers `/`, `/login`, `/updates`, and `/api-reference` at phone/tablet sizes without page overflow or an authorization difference.                                                             | NOT EVIDENCED    | Real mobile-browser check required                                                                                                                                                                                                                         |

## Safe evidence collection notes

Use read-only Windows listener/service inspection and bounded HTTP status checks.
Capture only the listener address/port, service state, route destination,
response status, and a redacted command-shape assertion. Do not dump complete
service configuration or environment variables. For the apply case, record
the candidate version and a shortened hash prefix/suffix only, plus the final
transaction outcome and whether rollback was needed.

## Closure decision

Current decision: **KEEP OPEN**. T1–T3, T6, T7, and T16 are evidenced on the
Windows 11 x64 host, subject to the post-change browser recheck for T8. The
`phase45-acceptance.ps1` helper passed the local loopback and deny-by-default
smoke checks; local version/update-status/catalog, check, plan, and OpenAPI
refresh returned `200`, raw paths returned `404`, and unknown Host plus
forwarding-header spoofing returned `421`. Both public hostnames returned the
expected unauthenticated Access challenge (`302`).

The live administrator policy now uses the exact operator email, MFA, and a
15-minute session with an empty `require` list. WARP, client certificate,
device posture, and App Launcher are not prerequisites. The independent admin
application/AUD, second Tunnel route, admin DNS record, Bridge JWT validation,
Origin/intent checks, and one-time apply grant remain in place. The browser-side
admin login, ordinary-human denial matrix, confirmation negative cases,
mobile-browser smoke, and final apply evidence are still required.

FQGate 1.0.1 was downloaded in an isolated Windows x64 verification directory.
Its official size and SHA-256 matched, `--verify-installation` and `--version`
succeeded, and an isolated 17283 run returned valid OpenAPI and health responses
with the required health/QR contracts. It is now marked validated in the live
instance configuration. Two real local apply attempts reached the candidate
activation step but ended in `HEALTH_TIMEOUT`; the lifecycle rollback restored
the managed 1.0.0 executable and its `ready` health state each time. The
candidate is therefore validated but not successfully installed, and T13 remains
open/blocked until the activation blocker is resolved and one remote-admin apply
is explicitly accepted.

Once T4, T5, T8–T12, T14, T15, and T17 are recorded with non-secret evidence,
and one approved update apply is either proven or explicitly documented as
unavailable, review whether the phase can be closed.
