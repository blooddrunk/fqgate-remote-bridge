# Phase 5-C implementation handoff

Date: 2026-09-21

Status: **ACTIVE — implementation complete; permanent-Windows, real remote and exact-final-commit CI closure pending**

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

## Deterministic and baseline evidence so far

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

## Remaining closure work

1. Commit and push the implementation branch and obtain green Ubuntu/Windows CI.
2. Fast-forward the permanent Windows checkout to that exact implementation.
3. Run the full frozen quality gate plus CLI, Phase 5-A, Phase 5-B and Phase 5-C local acceptance.
4. Run the Phase 5-C real remote matrix after the operator enters the existing service token into hidden prompts.
5. Record machine-derived local/remote totals and any conditional QR action.
6. Update closure documents, commit the final evidence, and require Ubuntu and Windows CI green for that exact final commit.

Until every item passes, Phase 5-C and Phase 5 remain OPEN. The repeatable
commands and secret boundary are in
`docs/operations/windows-phase-5-c-acceptance.md`.
