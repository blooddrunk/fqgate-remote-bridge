# Phase 5-B implementation handoff

Date: 2026-09-20

Status: **OPEN — implementation and acceptance in progress**

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

Planned Bridge contract: `market.instruments.lookup`,
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

Remaining: final implementation, deterministic checks, Windows final gates,
local normalized probes, hidden-token remote matrix, final Ubuntu/Windows CI.
