# Phase 5-C Task — Filtered machine OpenAPI and final remote closure

Date: 2026-09-20

Status: **ACTIVE**

Planning baseline: `main@26ba745d4634655223519ad6ad2586a25952f5a2` after Phase 5-B merge.

## Objective

Finish Phase 5 without widening its market-data privilege surface.

Phase 5-C has exactly two deliverables:

1. expose a machine-facing OpenAPI document generated only from Bridge-owned operations whose registry policy explicitly allows `remote_machine`; and
2. execute the final deterministic, permanent-Windows, and real remote-machine closure proving the filtered documentation and the already-approved read-only operation behave safely through Cloudflare Access + Tunnel.

Phase 5-C does **not** add quote/history/bars or any second market operation. It does not provision Cloudflare resources. It does not add MCP/WebSocket. It does not add trading or any financial state mutation.

## Source of truth

Read in order:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/plans/phase-5-remote-machine-read-only-api.md`
8. this task
9. `docs/status/phase-5-b-implementation-handoff.md`
10. `docs/operations/windows-phase-5-b-acceptance.md`
11. `docs/agent-guide.md`

## Non-negotiable boundaries

Preserve every closed Phase 0–5-B boundary.

- FQGate stays IPv4 loopback-only, normally `127.0.0.1:17281`.
- Bridge stays IPv4 loopback-only, normally `127.0.0.1:17282`.
- Tunnel ingress may target only `http://127.0.0.1:17282`.
- Runtime FQGate `/openapi.json` remains descriptive evidence only. It must never create or authorize Bridge routes.
- Machine OpenAPI must be generated from Bridge policy metadata, not copied or filtered from upstream OpenAPI by path matching.
- `remote_machine` may call only explicitly allowed machine operations. At this baseline that is exactly `market.instruments.lookup`.
- Human/admin identities must not gain the machine market operation.
- Machine identity must remain denied QR/session/update/admin/openapi-refresh/page/static/raw/unregistered paths.
- No trading, order placement, cancellation, transfer, brokerage/account mutation, arbitrary upstream path, catch-all proxy, wildcard CORS, or caller-supplied URL/method/path.
- No Cloudflare provisioning in this phase.
- No credentials, JWTs, cookies, Tunnel tokens, QR/session material, raw OpenAPI documents, or raw market payloads in Git, logs, command arguments, screenshots, or acceptance artifacts.

## A. Baseline preflight — AUTO_DETERMINISTIC / AUTO_WINDOWS

On the permanent Windows checkout `D:\code\research\fqgate-remote-bridge`:

1. inspect `git status --short --branch`; do not overwrite operator changes;
2. synchronize by safe fast-forward only when clean;
3. record current commit and non-secret tool/runtime versions;
4. run:
   - `corepack pnpm install --frozen-lockfile`
   - `corepack pnpm typecheck`
   - `corepack pnpm lint`
   - `corepack pnpm test`
   - `corepack pnpm build`
   - `corepack pnpm format:check`
   - `corepack pnpm test:e2e`
5. rerun existing Windows CLI/loopback smoke, Phase 5-A local regression, and Phase 5-B local/census acceptance.

Any failure blocks Phase 5-C implementation or closure until explained and fixed.

## B. Machine-facing OpenAPI contract — AUTO_DETERMINISTIC

Implement a Bridge-owned machine OpenAPI surface with these properties:

- generated from explicit operation-registry metadata only;
- includes only operations where `allowedContexts` contains `remote_machine`;
- therefore initially includes exactly `POST /api/v1/instruments/lookup`;
- uses Bridge public request/response schemas and public normalized errors;
- excludes upstream FQGate paths, upstream schema names, upstream response envelopes, internal compatibility fingerprints, local filesystem paths, Access configuration, secrets, admin operations, human operations, QR/session operations, update operations, and `openapi.refresh`;
- deterministic ordering and stable serialization;
- bounded document size;
- no runtime discovery dependency required to render the document;
- a change in upstream FQGate OpenAPI cannot silently add a machine route to the generated document.

Choose one stable public Bridge route for the machine document and one registry operation ID for it. The new documentation operation may be allowed to `local` and `remote_machine` only. Do not grant it to `remote_human` or `remote_admin` unless a later separately reviewed task changes policy.

If an existing generic Bridge OpenAPI generator can be safely reused, filter by registry authorization metadata before schema emission. Do not implement string/path blacklists as the authority.

## C. Deterministic policy and schema tests — AUTO_DETERMINISTIC

Tests must prove at minimum:

1. machine OpenAPI contains exactly the currently approved machine-callable operations;
2. adding an unrelated local/human/admin registry operation does not make it appear;
3. an upstream-only FQGate path never appears;
4. operation order and serialized output are deterministic;
5. document size is bounded;
6. no secret/config/runtime-only fields appear;
7. machine docs route is allowed only for intended contexts;
8. complete context × operation matrix still holds;
9. `market.instruments.lookup` remains the sole market-data privilege for `remote_machine`;
10. all closed Phase 4/4.5 human/admin permissions remain unchanged;
11. raw/unregistered/page/static paths remain denied to machine context;
12. unknown Host and forwarded-host spoofing still fail closed;
13. compatibility drift still disables lookup without disabling local diagnostics/recovery.

Do not live-call `updates.apply` or any financial-state-changing operation to prove denial.

## D. Permanent Windows acceptance — AUTO_WINDOWS by default

Add/extend one Phase 5-C acceptance entry under `scripts/windows`. It must use the existing permanent checkout and external config under `D:\code\research`.

The automated local run must prove:

- FQGate listener is exactly IPv4 loopback 17281;
- Bridge listener is exactly IPv4 loopback 17282;
- machine OpenAPI route succeeds locally;
- generated document contains only approved machine route(s);
- generated document does not contain known forbidden operation IDs/paths;
- lookup still succeeds with the known bounded probe when the required FQGate session/permission exists;
- malformed/oversized lookup inputs remain rejected;
- raw FQGate paths and spoofed Host remain denied;
- output is bounded and secret-safe.

The acceptance harness must calculate its own check count from emitted records. Do not manually hard-code narrative totals such as “21 checks passed” without machine-derived totals.

## E. Real remote-machine closure — AUTO_REMOTE after MANUAL_SECRET_ENTRY

Reuse the existing machine hostname, Access application, AUD, service token, Tunnel, and ingress evidence from Phase 5-A/B. Do not create or modify Cloudflare resources.

The only normal manual boundary is:

### MANUAL_SECRET_ENTRY — existing machine service token

Reason: Client ID/Secret are intentionally kept outside repository/configuration.

Operator steps:

1. run the documented Phase 5-C remote acceptance command from `D:\code\research\fqgate-remote-bridge`;
2. enter Client ID and Client Secret only into `Read-Host -AsSecureString` prompts;
3. do not paste them into chat, command arguments, scripts, JSON, screenshots, or files.

Expected result: after those two hidden entries, automation must perform the entire remote matrix without more operator action.

The remote matrix must automatically prove:

- no-credential machine request is challenged/denied by Access;
- valid service token can fetch the filtered machine OpenAPI;
- that document exposes only approved machine routes;
- valid service token can call `market.instruments.lookup` successfully;
- malformed/oversized lookup requests are rejected;
- every old Bridge operation remains forbidden to `remote_machine`;
- QR/session/update/admin/openapi-refresh remain forbidden;
- raw/unregistered/page/static paths remain unavailable;
- the same machine credential does not obtain human/admin context;
- Tunnel ingress evidence points only to `127.0.0.1:17282` and contains no 17281 route;
- loopback listeners remain unchanged.

The companion must emit only bounded check ID, PASS/FAIL, HTTP status, normalized Bridge error code, bounded route/schema counts, redacted host label, and timestamp. Never print response bodies, credentials, assertions, cookies, or raw market values.

## F. Conditional manual boundary — MANUAL_FQGATE_LOGIN only when observed

If an automated market probe reports `LOGIN_REQUIRED`:

1. automation must first print the exact failed check ID and normalized `LOGIN_REQUIRED`;
2. operator opens `http://127.0.0.1:17282/login` on the permanent Windows machine;
3. operator starts the existing QR flow and completes the physical scan/approval;
4. operator reruns the exact same Phase 5-C acceptance command.

Automation must then resume every remaining probe. Do not ask the operator to inspect JSON or copy session data.

If no `LOGIN_REQUIRED` occurs, no QR/manual login step is required.

## G. CI and closure — AUTO_DETERMINISTIC

After implementation and Windows/remote evidence:

- push the implementation branch;
- require final GitHub Actions Ubuntu and Windows checks to pass;
- inspect the exact workflow run for the final commit;
- create/update:
  - `docs/status/phase-5-c-implementation-handoff.md`
  - `docs/operations/windows-phase-5-c-acceptance.md`
  - README / AGENTS / security / architecture / roadmap as applicable;
- record exact non-secret commit IDs, workflow run IDs, automated check totals, failed/pending totals, and any manual boundary actually used.

Phase 5 may be marked **CLOSED** only when all deterministic, permanent-Windows, real remote-machine, and final CI evidence pass with no unresolved security blocker.

## Acceptance criteria

Phase 5-C is complete only when all are true:

1. generated machine OpenAPI is Bridge-registry-derived and deterministic;
2. it exposes only machine-authorized Bridge operations;
3. runtime FQGate OpenAPI cannot grant or document machine authority;
4. no privilege expansion beyond the already-approved lookup plus its docs route occurred;
5. all deterministic policy/schema tests pass;
6. all standard quality gates pass;
7. permanent Windows local acceptance passes from `D:\code\research`;
8. real service-token remote acceptance passes after at most the documented hidden secret entry and conditional physical FQGate login;
9. Tunnel/Access topology remains unchanged and Bridge-only;
10. final Ubuntu + Windows CI passes on the exact final commit;
11. evidence counts are machine-derived;
12. source-of-truth documentation is synchronized;
13. Phase 6 provisioning and all later-phase work remain unimplemented.

If any item is missing, keep Phase 5-C and Phase 5 OPEN and report the exact failing check, observed status/error, what is already proven, and the next precise operator or engineering action.
