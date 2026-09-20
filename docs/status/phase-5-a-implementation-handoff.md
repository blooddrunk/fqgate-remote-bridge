# Phase 5-A Implementation Handoff

Date: 2026-09-20

Status: **CLOSED — deterministic, permanent-Windows, CI, and real Cloudflare
service-token acceptance completed**

## Closure identity

The source baseline before Phase 5-A implementation was:

```text
2a87426f8b511031759b0b434052144476d0951f
```

The final implementation/evidence commit before this documentation closure is:

```text
9197c2f0df4a5589d10c94d34bd03ac354aa6802
```

The final documentation commit is the commit containing this handoff update.

Final GitHub Actions run for the implementation/evidence SHA:

- workflow run: 35495046546
- Ubuntu job: 106036408369 — success
- Windows job: 106036408475 — success
- Ubuntu Browser E2E: 13 passed
- Windows Browser E2E: skipped by the workflow condition; Windows CLI and
  production loopback smoke steps passed.

## Implemented boundary

Phase 5-A adds only the remote-machine identity and request-context foundation:

- independent remoteAccess.machineHostname and machine Access team-domain /
  audience metadata;
- pairwise-distinct human, admin, and machine host validation;
- first-class remote_machine request context with exact Host classification;
- separate CloudflareAccessMachineJwtVerifier and machine claim validator;
- shared bounded RS256/JWK transport only where claim profiles remain explicit;
- exact issuer/AUD/time checks, type=app, bounded non-empty common_name, and
  empty service-token sub semantics;
- minimal kind: "machine" principal;
- unchanged human-admin non-empty sub semantics;
- no current operation includes remote_machine in allowedContexts;
- top-level page/static/raw/unregistered-route denial before UI rendering;
- unchanged IPv4 loopback-only FQGate and Bridge origins.

No Phase 5-B market-data operation, machine-facing generated OpenAPI,
financial state mutation, MCP/WebSocket capability, supervisor, automatic
update, packaging, or Cloudflare provisioning automation was added.

## Deterministic evidence

tests/phase5a.test.ts covers the required configuration, hostname, JWT/JWK,
principal-separation, route, and authorization cases, including the complete
four-context by current-operation matrix. The final deterministic suite result
was 16 test files / 149 tests passed. The additional test covers the FQGate
manual-start health-readiness race observed on Windows during acceptance.

The service-token acceptance companion has bounded retries only for connection
errors and HTTP 502/503/504. It never retries or relaxes HTTP 401/403 policy
results, never prints response bodies/JWTs, and never calls a mutating
operation.

## Required quality gates

All required commands completed successfully. The final GitHub Actions run
above validates the final implementation/evidence SHA on both Ubuntu and
Windows.

```text
corepack pnpm install --frozen-lockfile  PASS
corepack pnpm typecheck                 PASS
corepack pnpm lint                      PASS
corepack pnpm test                      PASS — 16 files / 149 tests
corepack pnpm build                     PASS
corepack pnpm format:check              PASS
corepack pnpm test:e2e                  PASS — 13 tests (Ubuntu)
```

The permanent Windows checkout at
D:\code\research\fqgate-remote-bridge was fast-forwarded to the final
implementation/evidence SHA and rebuilt with the Windows Node toolchain. Its
CLI/loopback smoke and Phase 5-A acceptance passed. The final Windows CI job
passed install, typecheck, lint, deterministic test, build, format, CLI smoke,
and loopback smoke.

## Permanent Windows evidence

The final phase5a-acceptance.ps1 -VerifyLocal result was exit code 0:

```text
P5A-W1 PASS  permanent Windows CLI smoke
P5A-W2 PASS  human/admin/machine hostname collision check
P5A-W3 SKIP  reserved for authenticated Tunnel evidence
P5A-W4 PASS  Bridge HTTP 200 on 127.0.0.1:17282
P5A-W5 PASS  Bridge listener exactly 127.0.0.1:17282
P5A-W6 PASS  FQGate listener exactly 127.0.0.1:17281
P5A-W7 PASS  local raw FQGate path HTTP 404
P5A-W8 PASS  unknown Host / forwarded-host spoofing HTTP 421
P5A-W9 PASS  cloudflared token-file service with no inline token
```

The existing Windows CLI and production loopback smoke also exited 0. During
this acceptance the managed FQGate start path was hardened to wait for a valid
health response; a stop-then-start probe returned lifecycle ready and exit
code 0.

## Real Cloudflare service-token acceptance

The machine hostname is fqgate-api.haoqi90.top. Its configured team domain is
haoqi90.cloudflareaccess.com, and its separate machine application AUD is:

```text
2fc09614ef01c3416189195e5c4cea67739a5edc6b4bae39121a823f653eff3c
```

Cloudflare read-back confirmed:

- a separate self-hosted machine Access application exists;
- its Service Auth policy matches only the machine service token;
- the existing remotely-managed Tunnel maps the machine hostname only to
  http://127.0.0.1:17282;
- Access validation is required on that ingress;
- no Tunnel ingress contains 17281;
- the machine hostname has a proxied DNS CNAME to the existing Tunnel.

The operator-entered hidden-credential matrix completed with the following
bounded results:

| ID      | Result                                                                          |
| ------- | ------------------------------------------------------------------------------- |
| P5A-R1  | PASS — no service credential, HTTP 401 Access challenge                         |
| P5A-R2  | PASS — valid service credential, HTTP 403 OPERATION_FORBIDDEN on bridge.version |
| P5A-R3  | PASS — raw /v1/market/health, HTTP 403 OPERATION_FORBIDDEN                      |
| P5A-R4  | PASS — machine credential on ordinary-human hostname, HTTP 302                  |
| P5A-R5  | PASS — machine credential on admin hostname, HTTP 302                           |
| P5A-R6  | PASS — machine hostname reaches Bridge policy, HTTP 403 OPERATION_FORBIDDEN     |
| P5A-W10 | PASS — companion exited 0                                                       |
| P5A-W11 | PASS — bounded evidence contains Bridge origin and no 17281                     |

The non-secret ingress evidence file used by W11 is outside Git:

```text
D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

Client ID, Client Secret, Access JWT, cookies, and Tunnel token were not
written to Git, ordinary configuration, logs, documentation, command-line
arguments, or test evidence. The PowerShell wrapper used hidden secure-string
prompts, in-memory decryption, child-process environment passing, and finally
cleanup.

## Actual operator actions

The closure evidence records these actions that actually occurred:

1. The operator selected fqgate-api.haoqi90.top as the machine/API hostname
   and explicitly authorized the scoped Cloudflare API configuration using the
   external token file. The token value was never placed in chat or output.
2. The independent machine Access application, Service Auth policy, Tunnel
   ingress, and proxied DNS record were created/updated through that scoped
   operation. No Phase 6 provisioning code was added.
3. The operator used the permanent
   D:\code\research\fqgate-remote-bridge checkout, installed/started the
   validated FQGate binary, and kept the existing token-file cloudflared
   service and Bridge running for remote acceptance.
4. The operator entered the service-token Client ID and Client Secret only at
   the hidden PowerShell prompts. They were not shared with the assistant or
   stored in the repository.
5. The operator reran the bounded matrix after transient Tunnel retry support
   and after the non-secret W11 evidence file was corrected.

No updates.apply, trading, order, cancellation, transfer, or other financial
state-changing operation was called for acceptance.

## Changed files

Relative to baseline 2a87426f8b511031759b0b434052144476d0951f, the final
implementation/evidence change touched:

```text
AGENTS.md
README.md
docs/agent-guide.md
docs/architecture.md
docs/operations/windows-phase-5-a-acceptance.md
docs/roadmap.md
docs/security.md
docs/status/phase-5-a-implementation-handoff.md
scripts/windows/phase5a-acceptance.ps1
scripts/windows/phase5a-authenticated-acceptance.mjs
src/bridge/admin/confirmation.ts
src/bridge/auth/cloudflare-access.ts
src/bridge/policy/registry.ts
src/bridge/policy/request-context.ts
src/bridge/runtime.ts
src/bridge/service.ts
src/bridge/transport/http.ts
src/config/config.ts
src/fqgate/install/lifecycle.ts
src/server.ts
tests/lifecycle.test.ts
tests/phase45.test.ts
tests/phase5a.test.ts
tests/windows-scripts.test.ts
```

Phase 5-A is closed at the zero-privilege checkpoint. Phase 5-B remains a
separate future task and must not inherit permission merely from this
identity/context foundation.
