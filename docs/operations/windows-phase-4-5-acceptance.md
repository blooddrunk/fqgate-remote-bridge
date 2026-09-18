# Windows x64 + Cloudflare Phase 4.5 Acceptance

Date prepared: 2026-09-17
Last evidence update: 2026-09-18

Status: **OPEN — implementation is complete in code, but live acceptance is not recorded**.

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
  human policy, MFA requirement, enforceable device-posture rule, short session,
  and Protect with Access. It has no Bypass or Service Auth policy.
- The Cloudflare One Client has a separate WARP device-enrollment application
  and identity-only Allow policy for the intended operator, with independent
  MFA and a short enrollment session. Device posture is checked only after
  enrollment; it is not used as an enrollment prerequisite.
- The team App Launcher is enabled with a separate identity-only Allow policy
  for the intended operator. This policy only permits entry to the Launcher;
  it does not grant access to the admin hostname or any Bridge operation.
- The Bridge admin configuration uses the intended team domain and admin AUD;
  no arbitrary JWKS URL is configured.
- An explicitly approved, known-safe update candidate exists before attempting
  the apply case. If none exists, leave the apply item and the phase OPEN.

## Required live evidence

| ID  | Required proof                                                                                                                                                                                                                                      | Status             | Evidence reference                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | FQGate listens only on `127.0.0.1:17281`; Bridge listens only on `127.0.0.1:17282`.                                                                                                                                                                 | PASS               | 2026-09-18 bounded Windows `netstat.exe` probe while the production Bridge was running: exactly one IPv4 loopback listener on each port                                                                                     |
| T2  | Both published hostnames route through cloudflared only to Bridge; no direct FQGate route exists.                                                                                                                                                   | PASS               | 2026-09-18 Cloudflare Tunnel configuration review: both redacted public host entries target `http://127.0.0.1:17282`; the final catch-all is HTTP 404; no `17281` route exists                                              |
| T3  | cloudflared Windows service runs, reconnects after service restart, and its command contains a token-file path rather than a raw token.                                                                                                             | PASS               | 2026-09-18 elevated Windows check: service restarted successfully, returned `Running`, ordinary public route returned HTTP 302 after reconnect, and service command remained `tunnel run --token-file` with no inline token |
| T4  | Existing Phase 4 ordinary-human access still reaches Dashboard, status, QR, and reference surfaces.                                                                                                                                                 | NOT EVIDENCED      | Real human-browser smoke required                                                                                                                                                                                           |
| T5  | An ordinary-human request to each of `updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh` is denied server-side.                                                                                                                 | NOT EVIDENCED      | Two-host request matrix required                                                                                                                                                                                            |
| T6  | Unauthenticated access to the admin hostname is challenged/denied by Access.                                                                                                                                                                        | NOT EVIDENCED      | Real browser/private-session check required                                                                                                                                                                                 |
| T7  | A non-compliant or non-enrolled device is denied by the admin Access policy.                                                                                                                                                                        | NOT EVIDENCED      | Device posture test required                                                                                                                                                                                                |
| T8  | The intended compliant device with MFA reaches the admin Dashboard.                                                                                                                                                                                 | OPERATOR CONFIRMED | 2026-09-18 operator reported successful administrator verification through `fqgate-admin.haoqi90.top`; the assertion itself was not recorded                                                                                |
| T9  | Bridge accepts a real admin JWT only for the exact configured issuer and AUD, with no JWT logging; wrong-app/ordinary-human assertions are denied.                                                                                                  | NOT EVIDENCED      | Redacted request/log review required                                                                                                                                                                                        |
| T10 | Remote admin can perform `updates.check`, `updates.plan`, and `openapi.refresh`.                                                                                                                                                                    | NOT EVIDENCED      | Real admin request trace required                                                                                                                                                                                           |
| T11 | Remote `updates.apply` without a grant, with an expired grant, replayed grant, wrong-principal grant, operation mismatch, and plan/candidate mismatch is denied.                                                                                    | NOT EVIDENCED      | Real admin negative cases required                                                                                                                                                                                          |
| T12 | Concurrent/double redemption of one grant has exactly one successful consumer.                                                                                                                                                                      | NOT EVIDENCED      | Real or controlled acceptance race required                                                                                                                                                                                 |
| T13 | One explicitly approved known-safe remote-admin apply succeeds through the existing source/version/size/SHA-256/compatibility/health/concurrency/rollback protections. If no safe candidate exists, record `NOT AVAILABLE` and keep the phase OPEN. | NOT EVIDENCED      | Target Windows update transaction required                                                                                                                                                                                  |
| T14 | cloudflared install/update/service control, Tunnel-token operations, Cloudflare provisioning, arbitrary process/service control, Bridge self-update, market-data APIs, and financial state changes remain unavailable remotely.                     | NOT EVIDENCED      | Negative-path request review required                                                                                                                                                                                       |
| T15 | Raw/unregistered FQGate paths remain unreachable through both public hostnames.                                                                                                                                                                     | NOT EVIDENCED      | Negative-path request review required                                                                                                                                                                                       |
| T16 | Local loopback CLI/browser maintenance, including update check/plan/apply and OpenAPI refresh, remains usable.                                                                                                                                      | NOT EVIDENCED      | Local maintenance smoke required                                                                                                                                                                                            |
| T17 | A real mobile browser smoke pass covers `/`, `/login`, `/updates`, and `/api-reference` at phone/tablet sizes without page overflow or an authorization difference.                                                                                 | NOT EVIDENCED      | Real mobile-browser check required                                                                                                                                                                                          |

## Safe evidence collection notes

Use read-only Windows listener/service inspection and bounded HTTP status checks.
Capture only the listener address/port, service state, route destination,
response status, and a redacted command-shape assertion. Do not dump complete
service configuration or environment variables. For the apply case, record
the candidate version and a shortened hash prefix/suffix only, plus the final
transaction outcome and whether rollback was needed.

## Closure decision

Current decision: **KEEP OPEN**. T1–T3 are now evidenced on the Windows 11 x64
host. The current production build also passed the local loopback and
deny-by-default smoke checks; local version/update-status returned `200`,
raw/unregistered paths were denied, and unknown Host plus forwarding-header
spoofing returned `421`. The ordinary public route still returns the expected
unauthenticated Access challenge (`302`) after the cloudflared restart.

The admin Access application, independent audience, MFA requirement, two
device-posture rules, second Tunnel route, and admin DNS record are now
provisioned. The separate identity-only App Launcher policy is also enabled;
the intended operator has completed the browser WARP/MFA enrollment flow. The
previous multi-level hostname was replaced with the service-scoped first-level
hostname `fqgate-admin.haoqi90.top`. A bounded probe now negotiates TLS
successfully and receives the expected unauthenticated Access challenge
(`302`); the ordinary public hostname continues to return its own `302`. The
operator has also reported successful administrator verification through the
new hostname. This records the access checkpoint, but does not replace the
remaining request-matrix, confirmation, negative-path, local-maintenance,
mobile-browser, and known-safe-update evidence. No live acceptance result is
fabricated here. Once T4–T17 are recorded with non-secret evidence, update this
runbook and the Phase 4.5 implementation handoff, then review whether the
phase can be closed.
