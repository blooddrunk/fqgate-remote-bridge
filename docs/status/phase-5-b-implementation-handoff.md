# Phase 5-B implementation handoff

Date: 2026-09-20

Status: **CLOSED — deterministic, permanent-Windows, real remote and CI acceptance passed**

## Evidence before privilege expansion

Permanent runtime: `D:\code\research\fqgate-remote-bridge`, synchronized from
clean `ce421b5` to `main@4cfd725`. Windows Node v24.15.0 / pnpm 11.23.0.
FQGate managed process running, version 1.0.1, explicitly validated by the
existing external compatibility configuration. Both listeners are IPv4 loopback.

Live fixed `/openapi.json`: OpenAPI 3.1.0, 265990 bytes, 89 operations,
canonical fingerprint
`8abc1d0ece7c2129152aa7d65ee48d05454fc0dcd037d797225ec0b46b757e6d`.

Observed candidates (not authorization):

- `POST /v1/market/catalog/search-symbols`: strict object request with required
  string `pattern`, optional `need_market`; success data has `items`, `item_count`;
  item fields `code`, `market`, `name`, `ths_code` are strings.
- `POST /v1/market/realtime/quote`: required securities and numeric fields;
  response uses generic decoded nested records, rather than a typed quote DTO.

Secondary read-only evidence: upstream public repository commit
`b949c542bc722ebe601662ba0c06c80eed9c8da8`, Python
`sdk/python/src/fqgate_client/client.py` search/quote helpers, and
`AI-plugins/ui-apps/src/adapters/local-api/FqgateSecuritySearchService.ts` plus
`FqgateMarketQuoteService.ts`. These implement catalog lookup and snapshot reads,
not subscription/session/trading mutation. Source:
<https://github.com/zhuyifang/tonghuasun-agent/tree/b949c542bc722ebe601662ba0c06c80eed9c8da8>.

Fixed bounded semantic probes (5000 ms / 65536 bytes, no redirects intended):

- P5B-C3: catalog request `{ "pattern": "600000" }`, HTTP 200, envelope code 0,
  322 bytes, one item, four string fields. No raw values retained.
- P5B-C4: one returned instrument, fixed quote fields
  `[5,55,10,6,7,8,9,13,19]`, HTTP 200, envelope code 0, 531 bytes, one nested
  record. No raw values retained. No login action was needed; health reported
  `unknown`, so health alone must not deny a successful market read.
- P5B-C5: lookup operation plus transitive schema-reference fingerprint
  `a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5`.

Selection: **one operation**, exact six-digit instrument-code lookup. Quote is
intentionally deferred: decoding its generic fields and documenting price/unit/
freshness semantics would enlarge this first contract. Historical APIs are not
needed. No new route or permission existed when these observations were recorded.

Implemented Bridge contract: `market.instruments.lookup`,
`POST /api/v1/instruments/lookup`, body `{ "code": "600000" }`, no other fields;
contexts exactly local + remote_machine. Upstream method/path remain fixed.
Maximum 16 upstream items, 65536 response bytes, 128-character names,
16-character market IDs, 32-character instrument IDs; normalized output contains
only explicitly validated item fields. Exact 1.0.1 plus the scoped schema hash
and actual response parsing gate the operation; unrelated schema additions do
not alter its hash. Update activation requirements remain unchanged.

## Baseline checks

Windows install frozen, typecheck, lint, 149 tests, build, 13 E2E passed.
Baseline format check failed on three pre-existing main documentation files;
format-only correction is included in this change. Existing CLI/loopback smoke
and P5A-W1/W2/W4–W9 passed; W3 intentionally defers ingress evidence.

## Final implementation and verification identity

Runtime implementation SHA: `f22279e1af5cdf4c4c16d53c8e71d87598ef54fd`.
Final acceptance implementation SHA: `cce0f6ac36dd2fa720d1cb096f5852c397354e6a`.
The latter changes only the live harness and its procedure; runtime code is
identical. The documentation closure commit is the commit containing this update.
Draft review: <https://github.com/blooddrunk/fqgate-remote-bridge/pull/4>.

Final implementation CI run:
<https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/35501156122>

- Ubuntu job 106053038401: success.
- Windows job 106053038537: success.
- All 17 deterministic files / 189 tests passed, including 40 new Phase 5-B
  tests and the old human/admin/machine regression matrix.
- Ubuntu CI E2E: 13 passed. Windows CI skips browser E2E by its established
  condition; permanent Windows browser E2E was run separately and passed 13/13.

Linux and permanent Windows both passed typecheck, lint, tests, build, format
check and E2E; Windows also passed the required frozen-lockfile install. The Windows final full-gate command
exited 0. Existing CLI/production loopback smoke and Phase 5-A local acceptance
were rerun on the implementation: P5A-W1/W2/W4–W9 PASS, W3 reserved SKIP.
No closed-phase privilege or JWT validation rule was relaxed.

## Final live evidence

The existing Bridge process was identified by exact permanent-checkout launcher
path, restarted with the final build, unchanged external configuration and
runtime commit metadata. FQGate and cloudflared were left running. Both listeners
remained exactly IPv4 loopback. No Cloudflare resource was created or changed.

2026-09-20 09:01 UTC, permanent Windows census/local matrix:

| IDs          | Observed result                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| P5B-W2       | PASS: 127.0.0.1:17281 and 127.0.0.1:17282 only                                             |
| P5B-C1/C2/C5 | PASS: 1.0.1 validated/running, same 89-operation OpenAPI and scoped hash                   |
| P5B-C3       | PASS: known exact-code lookup, HTTP 200, one normalized item                               |
| P5B-C6       | PASS: missing-code lookup, HTTP 200, zero items                                            |
| P5B-C4       | PASS: census-only quote, HTTP 200/code 0, 533 bytes; unexposed                             |
| P5B-L2       | PASS: public local lookup, HTTP 200, one normalized item                                   |
| P5B-L3/L4    | PASS: unknown field HTTP 400 / REQUEST_INVALID; 257-byte body HTTP 413 / REQUEST_TOO_LARGE |
| P5B-L5       | PASS: raw upstream path HTTP 404 (framework response)                                      |
| P5B-L6       | PASS: explicit native Host plus forwarded-host spoof HTTP 421                              |

The first harness attempt incorrectly required a Bridge JSON error on framework
404 and used Node fetch to override Host. The harness was corrected to check
raw-path HTTP denial and native Windows HttpWebRequest.Host respectively; the
second complete local run exited 0. This did not change runtime authorization.

At 09:02:40–09:02:50 UTC the operator entered the existing Client ID/Secret into
the two hidden secure-string prompts. The entire real matrix then ran without
further operator actions. All **21** remote checks passed:

| IDs                                                                  | Observed result                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P5B-R1                                                               | PASS: no credentials, HTTP 401                                                           |
| P5B-R2                                                               | PASS: approved lookup through Access/Tunnel, HTTP 200, one normalized item               |
| P5B-R3/R4                                                            | PASS: malformed HTTP 400 / REQUEST_INVALID; oversized HTTP 413 / REQUEST_TOO_LARGE       |
| P5B-R5                                                               | PASS: raw upstream path HTTP 403 / OPERATION_FORBIDDEN                                   |
| P5B-R-deny-bridge.version/capabilities/status                        | PASS: all HTTP 403 / OPERATION_FORBIDDEN                                                 |
| P5B-R-deny-session.qr.begin/poll                                     | PASS: both HTTP 403 / OPERATION_FORBIDDEN                                                |
| P5B-R-deny-updates.status/check/plan                                 | PASS: all HTTP 403 / OPERATION_FORBIDDEN                                                 |
| P5B-R-deny-openapi.catalog/refresh                                   | PASS: both HTTP 403 / OPERATION_FORBIDDEN                                                |
| P5B-R-page-/ and page-/assets/probe.js and page-/api/v1/unregistered | PASS: all HTTP 403 / OPERATION_FORBIDDEN                                                 |
| P5B-R-human/admin                                                    | PASS: both HTTP 302 Access challenge                                                     |
| P5B-W3 and reused P5A-W10/W11                                        | PASS: existing exact machine ingress targets Bridge, companion exit 0, no FQGate ingress |

`updates.apply` was never live-called; its denial remains part of the complete
deterministic matrix. Invalid bodies protected old POST denial probes against
side effects if authorization regressed. No QR login was required: successful
initial reads were accepted despite health `unknown`; final health was connected.

The non-secret result file is outside Git at
`D:\code\research\fqgate-phase5b-remote-evidence.json`, timestamp
`2026-09-20T09:02:50.2350317Z`, acceptance SHA cce0f6a, failed=0, pending=0,
matrixExitCode=0. It contains bounded metadata only. No credentials, assertions,
cookies, QR/session material, raw OpenAPI or raw market payload entered Git or
acceptance evidence.

## Closure audit and next boundary

All task-package L1–L12 criteria are met: regression, authoritative census,
one evidence-backed fixed/typed/bounded operation, exact contexts, old denial,
quality gates, permanent Windows local acceptance, real remote smoke,
Ubuntu/Windows CI, no secret/raw payload commits, and synchronized documentation.
There is no remaining Phase 5-B blocker. The final documentation commit must
also receive green CI before the goal is reported complete.

Phase 5-C remains a separate unimplemented milestone. No quote/history API,
generated machine OpenAPI, Cloudflare provisioning, WebSocket/MCP, financial
mutation, supervisor, notifications, automatic updates, packaging or consumer
integration was added. The default validated-version list and update activation
requirements are unchanged; the existing permanent config explicitly validates
1.0.1. Other runtimes cannot bypass the exact 1.0.1 lookup gate by broadening
configuration alone.
