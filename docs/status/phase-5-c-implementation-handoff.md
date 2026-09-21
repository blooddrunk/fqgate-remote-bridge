# Phase 5-C implementation handoff

Date: 2026-09-21

Status: **CLOSED — deterministic, permanent-Windows, real remote and CI acceptance passed**

## Implemented contract

Phase 5-C adds one non-market operation:

```text
openapi.machine
GET /api/v1/openapi/machine
allowedContexts = [local, remote_machine]
```

The machine document is built only from Bridge operation-registry entries whose
`allowedContexts` contains `remote_machine`. Every such entry must carry
explicit `machineOpenApi` public schema metadata; a machine operation without
metadata, or metadata on a non-machine operation, fails registry invariants.
At this baseline the document contains exactly:

```text
POST /api/v1/instruments/lookup  market.instruments.lookup
GET  /api/v1/openapi/machine     openapi.machine
```

The generator does not read or filter runtime FQGate `/openapi.json`. It
canonicalizes object keys and operation order, enforces a 64-KiB serialized
limit, and exposes only Bridge public lookup/document/error schemas. It omits
upstream paths and envelopes, upstream/internal schema names, compatibility
fingerprints, filesystem paths, runtime observations, Access config/secrets,
and human/admin/session/update operations.

No quote, history, bars, second market operation, trading/account mutation,
generic proxy, Cloudflare provisioning, supervisor/notification, automatic
update, MCP/WebSocket, packaging or consumer integration was added.

## Policy preservation

`remote_machine` receives only `market.instruments.lookup` and
`openapi.machine`. Lookup remains the sole `market_read` privilege. The seven
remote-human operations and eleven remote-admin operations remain unchanged;
human/admin callers cannot fetch the machine document or use lookup. Machine
callers remain denied bridge version/capabilities/status, QR session,
updates, upstream catalog/refresh, page/static/raw/unregistered paths and
unknown/forwarded Host spoofing. The distinct hostname/AUD/JWT claim profiles,
loopback listeners and Bridge-only Tunnel origin are unchanged.

## Deterministic and baseline evidence

The synchronized implementation baseline is
`main@4f32acc0f99b5ff668668451814941b9980f4bb9`. The permanent Windows baseline
recorded Node v24.15.0 and pnpm 11.23.0. Frozen install, typecheck, lint,
17 files/189 tests and build passed. The only baseline failure was a
pre-existing README table-spacing format check; this change applies the
format-only correction. Windows browser E2E passed 13/13. Existing Windows
CLI/loopback, Phase 5-A local, and Phase 5-B census/local regression passed.

New deterministic coverage verifies registry-only inclusion, unrelated
local/human/admin exclusion, upstream-only path exclusion, stable serialization
under reversed registry order, bounded size, forbidden metadata exclusion,
the complete four-context matrix, sole machine market privilege, and local /
machine-only HTTP access. Existing compatibility-drift and raw/page/static /
Host-spoof tests remain green.

The generated document serializes to 3085 bytes and contains exactly two paths,
two operation IDs and five Bridge-owned public schemas. The final deterministic
suite passed 18 files / 196 tests. The added drift regression proves a failed
lookup compatibility gate does not disable local diagnostics or machine docs.

## Final implementation and CI identity

Runtime implementation: `bab377b86225a0603aef9716f012f21beb80471f`.
Final remote-acceptance implementation:
`06ae7c01b780ba856a4f70bfcd3612ef9258abd0`. Commits between them add the
compatibility-drift regression and harden only the bounded Windows acceptance
harness; the Bridge runtime contract is unchanged. Draft review:
<https://github.com/blooddrunk/fqgate-remote-bridge/pull/5>.

CI run [35553157256](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/35553157256)
passed on the final acceptance implementation:

- Ubuntu job `106191573144`: success, including 196 tests and 13 browser E2E;
- Windows job `106191573251`: success, including frozen install, typecheck,
  lint, 196 tests, build, format, CLI smoke and production loopback smoke.

The documentation closure commit is the commit containing this handoff. It must
also receive green Ubuntu and Windows checks before the goal is reported
complete.

## Permanent-Windows acceptance

The permanent checkout was
`D:\code\research\fqgate-remote-bridge`, Node v24.15.0 / pnpm 11.23.0.
Frozen install, typecheck, lint, 18 files / 196 tests, build, format check and
13/13 browser E2E passed. Existing CLI/production-loopback smoke, Phase 5-A
local regression, and Phase 5-B census/local regression all passed. FQGate
remained 1.0.1 with the same 265990-byte, 89-operation runtime OpenAPI and
approved scoped lookup fingerprint. No second market operation was selected.

Phase 5-C local records were machine-counted:

| Records               | Result                                                              |
| --------------------- | ------------------------------------------------------------------- |
| P5C-L2                | PASS: HTTP 200, two paths, five schemas, 3085-byte bounded document |
| P5C-L3                | PASS: approved lookup HTTP 200, one normalized item                 |
| P5C-L4/L5             | PASS: malformed HTTP 400 / oversized HTTP 413                       |
| P5C-L6/L7             | PASS: raw path HTTP 404 / explicit Host spoof HTTP 421              |
| P5C-SUMMARY           | PASS: total 6, passed 6, failed 0                                   |
| P5C-W2-17281/17282    | PASS: exactly one IPv4-loopback listener each                       |
| P5C-W-SUMMARY (local) | PASS: total 2, passed 2, failed 0                                   |

## Real remote closure

The final exact command reused the existing machine hostname, Access
application/AUD, service token, Tunnel and ingress evidence. After the operator
entered Client ID/Secret only into hidden secure-string prompts, the matrix ran
without further action. No FQGate QR login was required.

The bounded evidence file outside Git is
`D:\code\research\fqgate-phase5c-remote-evidence.json`, timestamp
`2026-09-21T02:09:22.1581867Z`, acceptance SHA `06ae7c0`, failed=0,
pending=0, matrixExitCode=0. Its machine-derived summary is total 21, passed 21,
failed 0:

| Records                | Result                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| P5C-R1                 | PASS: no credential, HTTP 401 Access challenge                           |
| P5C-R2                 | PASS: filtered document HTTP 200, two paths/five schemas, one attempt    |
| P5C-R3                 | PASS: approved lookup HTTP 200, one normalized item                      |
| P5C-R4/R5              | PASS: malformed HTTP 400 / oversized HTTP 413                            |
| P5C-R6                 | PASS: raw FQGate path HTTP 403 / OPERATION_FORBIDDEN                     |
| P5C-R-deny-*           | PASS: ten old operations HTTP 403 / OPERATION_FORBIDDEN                  |
| P5C-R-page-*           | PASS: page/static/unregistered paths HTTP 403                            |
| P5C-R-human/admin      | PASS: both isolated by HTTP 302 Access challenge                         |
| P5C-W2/W3              | PASS: both listeners loopback-only; ingress is Bridge-only with no 17281 |
| P5C-W-SUMMARY (remote) | PASS: total 3, passed 3, failed 0                                        |

`updates.apply` was never live-called; its machine denial remains deterministic
test evidence. The result file contains no credential, assertion, cookie, JWT,
QR/session material, raw OpenAPI, raw market value or compatibility fingerprint.
No Cloudflare resource was created or changed.

Two pre-final runs exposed acceptance-only defects: a cold JWK fetch exceeded
the Bridge's bounded timeout once, and direct native Git output was unavailable
under the launched PowerShell host. The harness now retries only the exact
fail-closed `ACCESS_ASSERTION_INVALID` document probe once, records its attempt
count, and resolves Git through bounded redirected `ProcessStartInfo`. A stale
PowerShell `$LASTEXITCODE` check was replaced with the script invocation status.
The final document and lookup both passed on one attempt.

## Closure audit and next boundary

Every Phase 5-C acceptance criterion is satisfied. Phase 5-C and Phase 5 are
CLOSED. Quote, history, bars, a second market operation, Cloudflare provisioning,
supervisor/notifications, automatic updates, MCP/WebSocket, packaging, consumer
integration, trading, brokerage control and every financial state mutation
remain unimplemented and require separate authorization.
