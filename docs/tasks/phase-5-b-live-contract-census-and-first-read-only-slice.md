# Phase 5-B Task — Live contract census and first read-only market slice

Date: 2026-09-20

Status: **ACTIVE**

Planning baseline: main@ce421b5e26ec496f56e1f2d3cd256420b521cfec.

Baseline CI run 35496757254 is green on Ubuntu and Windows. Phase 5-A is
CLOSED with deterministic, permanent-Windows, CI, and real Cloudflare
service-token evidence.

## Objective

Deliver the smallest useful, evidence-backed read-only market-data surface for
remote software clients.

Phase 5-B must do two things in this order:

1. inspect the **running target FQGate** in the permanent Windows environment and
   produce a bounded contract census using the live /openapi.json plus
   non-mutating semantic probes; then
2. implement **at most two** Bridge-owned read-only market operations selected
   from that evidence.

Do not guess endpoint names from public examples and do not expand the machine
allowlist before the census proves the upstream contract.

Phase 5-C remains separate. It will generate filtered machine-facing OpenAPI and
perform final Phase 5 remote closure.

## Source of truth

Read in this order before editing:

1. README.md
2. AGENTS.md
3. docs/architecture.md
4. docs/security.md
5. docs/upstream-contracts.md
6. docs/roadmap.md
7. docs/plans/phase-5-remote-machine-read-only-api.md
8. this task
9. docs/status/phase-5-a-implementation-handoff.md
10. docs/operations/windows-phase-5-a-acceptance.md
11. docs/agent-guide.md

## Hard boundaries

Preserve all closed Phase 0 through Phase 5-A behavior.

Do not:

- expose a generic/raw FQGate path parameter or catch-all proxy;
- authorize an operation because it appears in runtime OpenAPI;
- add trading, order placement, order cancellation, funds transfer,
  brokerage/account control, or any other financial-state mutation;
- grant remote_machine QR/session/update/admin/openapi.refresh privilege;
- grant the new market operations to remote_human or remote_admin merely for
  convenience;
- expose the human Dashboard on the machine hostname;
- add MCP or WebSocket support;
- automate Cloudflare provisioning; that remains Phase 6;
- persist service-token Client ID/Secret, Access JWTs, cookies, Tunnel tokens,
  login secrets, or raw contract dumps in Git, logs, docs, command arguments, or
  test artifacts;
- silently create a temporary Windows acceptance checkout when the permanent
  D:\code\research working tree exists.

## A. Baseline and environment preflight — automatic

Resolve the permanent Windows repository under D:\code\research. Prefer
D:\code\research\fqgate-remote-bridge when it is the existing Git root.

Record bounded non-secret diagnostics:

```text
resolved Git root
git status --short
git rev-parse HEAD
node --version
corepack pnpm --version
FQGate version
Bridge version/commit
```

Fast-forward the permanent checkout to origin/main only when safe. Never delete
operator-owned changes.

Run the normal baseline gates before changing behavior:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Also run the existing Windows CLI/loopback smoke and Phase 5-A local acceptance
so the zero-privilege baseline is re-proven before privilege expansion.

## B. Build a bounded live contract census — before market API code

Add a repeatable Phase 5-B census/acceptance entry under scripts/windows. It may
reuse existing OpenAPI discovery and HTTP primitives; do not write a second
unbounded downloader.

The census must automatically:

1. ensure FQGate is reachable only at the configured loopback target;
2. obtain the running FQGate version and verify it is within the supported and
   currently validated compatibility policy;
3. fetch only http://127.0.0.1:17281/openapi.json with the existing bounded
   timeout/size/structure rules;
4. record only bounded metadata such as OpenAPI version, bytes, operation count,
   deterministic fingerprint, and candidate operation identifiers;
5. identify plausible read-only market candidates from the live document;
6. cross-check candidate semantics against official/public upstream code or
   documentation as **secondary evidence**;
7. reject candidates whose purpose is ambiguous or state-changing;
8. execute only fixed, explicitly reviewed, non-mutating semantic probes;
9. record request/response shape, envelope behavior, error states, permission or
   login requirements, and practical result bounds without committing raw
   market payloads or the whole OpenAPI document.

The census must fail closed. A path being GET is not sufficient proof that it is
safe, and a POST path may still be read-only only when its semantics are
explicitly established.

Explicitly exclude any candidate associated with trading, buy/sell, orders,
cancellation, transfer, account mutation/control, credential/session mutation,
updates, or process control.

## C. Candidate selection gate

After the census, choose the smallest useful slice. Implement no more than two
operations in Phase 5-B.

Selection criteria, in order:

1. read-only semantics are independently evidenced;
2. request shape is narrow and can be fully typed;
3. response can be normalized and strictly bounded;
4. failure/login/permission behavior is understood;
5. the operation is useful to software consumers;
6. runtime contract compatibility can fail closed.

Preferred semantic categories are symbol/instrument lookup and a bounded
realtime quote. Historical/intraday bars may replace one of them only when the
live contract is clearer and the implementation can enforce a deterministic
row/time-range bound.

Do not preselect exact upstream paths or operation IDs in this task document.
The running target FQGate is authoritative.

If no candidate satisfies the safety gate, stop before adding permissions and
write the exact census evidence and blocker. Do not claim Phase 5-B complete.

## D. Implement typed FQGate adapters

For each selected operation:

- use a fixed upstream method and path;
- define a typed Bridge-owned request contract;
- validate every field and reject unknown/unbounded input;
- never forward a caller-supplied URL/path/method;
- decode the normal FQGate response envelope separately from endpoint data;
- normalize into a Bridge-owned response DTO;
- ignore incidental upstream fields unless explicitly needed;
- bound timeout, request size, response bytes, collection count, string lengths,
  and any date/range/limit parameter;
- redact/bound upstream messages and never echo raw upstream bodies;
- make compatibility failure distinct from ordinary market-data unavailability;
- document whether a logged-in FQGate session or market permission is required.

Prefer a dedicated market adapter module rather than placing upstream parsing in
route or React files.

## E. Add Bridge operations with narrow authorization

Each selected capability gets:

- a Bridge-owned operation ID;
- a stable Bridge-owned HTTP method/path;
- an explicit registry entry;
- exact allowedContexts;
- typed handler/service wiring;
- compatibility requirements.

For Phase 5-B the allowed contexts for the new market operations must be exactly:

```text
local
remote_machine
```

Do not add remote_human or remote_admin unless a later separately reviewed task
changes that policy.

Existing Phase 5-A behavior remains unchanged for all old operations:
remote_machine must still be denied QR/session/update/admin/openapi-refresh and
all other pre-existing operations.

The machine hostname must continue to reject page/static routes and raw
/v1/... paths as authorization bypasses.

## F. Compatibility and drift handling

The new market operations must depend on explicit compatibility evidence, not
only on the presence of a route at startup.

At minimum:

- verify the selected upstream path and method are present in the validated
  runtime OpenAPI;
- validate the minimum request/response structural assumptions needed by each
  adapter;
- add endpoint-specific semantic probes where structure alone is insufficient;
- fail only the affected operation closed when its runtime contract cannot be
  established;
- keep local diagnostics/update/recovery usable;
- never fall back to a transparent proxy.

If activation policy is extended so a future FQGate update must preserve these
contracts, document that change explicitly and add rollback tests.

## G. Deterministic automated tests

Normal CI remains credential-free.

Add deterministic coverage for each selected operation:

- valid request and normalized response;
- unknown fields / malformed input;
- minimum/maximum lengths, counts, ranges, and limits;
- exact upstream path/method/body formation;
- successful HTTP with non-zero FQGate envelope code;
- malformed envelope;
- malformed endpoint data;
- timeout/network failure;
- oversized response and oversized result collection;
- compatibility contract missing/drifted;
- no raw upstream body/message leakage;
- no arbitrary upstream path selection.

Authorization/regression coverage must include:

- complete context x operation matrix after adding the new operations;
- only the selected market operations gain remote_machine;
- every old operation remains denied to remote_machine;
- remote_human and remote_admin permissions are unchanged;
- local semantics remain valid;
- unknown Host and forwarded-host spoofing fail closed;
- machine page/static/raw routes remain denied;
- no wildcard CORS or generic proxy is introduced;
- Phase 5-A JWT/principal-isolation tests remain green.

## H. Permanent Windows validation — automatic by default

After implementation, use the permanent D:\code\research checkout and rerun:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Run the Windows CLI/loopback smoke plus the new Phase 5-B acceptance mode.

The Windows acceptance must automatically prove:

- FQGate listener is still only 127.0.0.1:17281;
- Bridge listener is still only 127.0.0.1:17282;
- live OpenAPI fingerprint/census is bounded and reproducible;
- each selected operation succeeds locally with a known-safe bounded probe when
  the required upstream session/permission is available;
- malformed/oversized inputs are rejected before unsafe upstream forwarding;
- raw FQGate paths and unknown hosts remain denied;
- every non-selected machine operation remains denied;
- no secret-bearing value or raw market payload is printed.

## I. Real remote-machine smoke — automate everything after secret entry

Phase 5-A already created and validated the independent machine Access
application, service token, hostname, DNS, and Tunnel ingress. Phase 5-B should
not create new Cloudflare resources.

Extend or add a bounded remote acceptance companion that reuses the Phase 5-A
secret-safe pattern. After the existing Client ID/Secret are entered through
hidden PowerShell prompts, automatically verify:

1. the machine hostname without service credentials is denied/challenged;
2. valid machine credentials can call each newly approved read-only Bridge
   operation;
3. response shape/count/status are bounded and no raw payload is printed;
4. an old operation such as bridge.version remains OPERATION_FORBIDDEN for
   remote_machine;
5. QR/session/update/admin/openapi.refresh remain forbidden;
6. raw /v1/... remains unavailable;
7. the same service credential does not gain human/admin privilege;
8. Tunnel origin evidence remains Bridge-only with no 17281 ingress.

Do not live-call updates.apply or any financial-state-changing operation merely
to prove denial.

## J. Exact human-only boundaries

Automation is the default. Manual work is allowed only when the external system
cannot safely provide the secret or physical login action to the agent.

### MANUAL_SECRET_ENTRY — existing service token

Reason: Phase 5-A intentionally keeps the service-token Client ID/Secret outside
Git and automation configuration.

Operator steps:

1. run the documented Phase 5-B remote acceptance command;
2. type Client ID and Client Secret only into Read-Host -AsSecureString prompts;
3. do not paste them into chat, docs, command arguments, environment setup
   scripts, screenshots, or files.

Expected result: after the two hidden entries, the entire remote matrix runs
automatically and emits only test IDs, PASS/FAIL, HTTP/normalized error code,
bounded shape/count metadata, redacted host label, and timestamp.

### MANUAL_FQGATE_LOGIN — only if live market probes require a session

Reason: the upstream QR login requires a physical operator approval and must not
be replaced with stored credentials.

Operator steps:

1. first let the Phase 5-B script detect and report LOGIN_REQUIRED;
2. open the existing local Bridge login page at
   http://127.0.0.1:17282/login on the permanent Windows machine;
3. start the existing QR flow and complete the upstream scan/approval;
4. return to the terminal and rerun the exact census/acceptance command.

Automation resumes by polling the existing health/session contract and performs
all remaining probes. Do not ask the operator to inspect JSON manually.

### Cloudflare setup is not a normal Phase 5-B manual step

The Phase 5-A machine application/Tunnel should already exist. If it is missing
or drifted, report the exact missing resource/evidence. Do not silently create a
new application, token, DNS record, or Tunnel route; provisioning automation is
Phase 6 and must remain separate.

## K. Documentation and closure artifacts

During implementation update the relevant source-of-truth docs and create:

- docs/status/phase-5-b-implementation-handoff.md
- docs/operations/windows-phase-5-b-acceptance.md

Also update, when affected:

- README.md
- AGENTS.md
- docs/roadmap.md
- docs/architecture.md
- docs/security.md
- docs/upstream-contracts.md
- docs/agent-guide.md
- docs/plans/phase-5-remote-machine-read-only-api.md

The handoff must record the exact selected upstream contracts, Bridge operation
IDs/paths, bounds, final commit SHA, deterministic test counts, permanent
Windows results, remote result IDs, and any remaining blocker.

Do not commit the full runtime OpenAPI document or raw market-data samples.

## L. Phase 5-B closure criteria

Phase 5-B may be marked CLOSED only when all are true:

1. Phase 5-A regression suite remains green;
2. live census came from the permanent Windows FQGate runtime;
3. at least one and at most two read-only market operations were selected from
   evidence and implemented;
4. each selected operation has fixed upstream routing, typed input, normalized
   bounded output, and explicit compatibility gating;
5. allowedContexts are exactly local + remote_machine for the new operations;
6. all old machine-deny rules remain intact;
7. deterministic quality gates pass;
8. permanent Windows census/local acceptance passes;
9. real remote-machine smoke passes after hidden credential entry;
10. GitHub Actions is green on Ubuntu and Windows;
11. no secret/raw OpenAPI/raw market payload is committed;
12. docs and handoff accurately describe the final behavior.

If a mandatory live probe cannot run because FQGate needs operator login, use
the exact MANUAL_FQGATE_LOGIN boundary above and resume automation afterwards.
If a real blocker remains, keep Phase 5-B OPEN and name the exact test, observed
status/error, and next required action.

## M. Explicitly out of scope

Do not implement in Phase 5-B:

- generated/filter machine OpenAPI or machine API-reference UI;
- broad historical-data coverage;
- generic query forwarding;
- streaming/WebSocket/MCP;
- trading/account mutation;
- Cloudflare provisioning automation;
- supervisor/notifications;
- automatic updates;
- final packaging;
- consumer-specific turtle-value-engine integration.

Those remain Phase 5-C or later roadmap work.
