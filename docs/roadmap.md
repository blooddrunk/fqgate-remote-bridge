# Development Roadmap

This roadmap is ordered to reduce risk before Internet exposure. The repository has closed the local lifecycle, local operator UI, upgrade center, runtime API discovery, and authenticated remote human access milestones while preserving loopback-only origin services and deny-by-default operation policy.

## Current state

- Phase 0: **CLOSED**
- Phase 1: **CLOSED**
- Phase 2: **CLOSED**
- Phase 3: **CLOSED**
- Phase 4: **CLOSED**
- Phase 4.5: **CLOSED**
- Phase 5: **CLOSED**
- Phase 6-A: **CLOSED** — permanent-Windows live acceptance and Ubuntu/Windows CI
  passed on `9c6babb`
- Post-Phase-6-A credential custody and secret-directory retirement:
  **READY task; not implemented**
- Phase 6-B/C+: planned only

Current deployed topology remains:

```text
remote human browser
  -> Cloudflare Access
  -> remotely-managed Cloudflare Tunnel
  -> cloudflared Windows service
  -> 127.0.0.1:17282 bridge
  -> explicit remote-human operation exposure policy
  -> FQGate adapters
  -> 127.0.0.1:17281 FQGate
```

There is never an intended `cloudflared -> FQGate` direct route.

---

## Phase 0 — Repository and contracts

Status: **CLOSED**.

Delivered repository structure, architecture/security contracts, compatibility ledger, TypeScript/config/logging/CI baseline, and secret-safe defaults.

## Phase 1 — Local FQGate lifecycle manager

Status: **CLOSED**.

Delivered trusted FQGate installation/update primitives, integrity checks, process lifecycle, health/compatibility validation, rollback, and Windows x64 acceptance.

## Phase 2 — Local TanStack bridge API and QR login UI

Status: **CLOSED**.

Delivered the loopback-only TanStack Start application, React 19/TanStack Query Dashboard, explicit operation registry, FQGate QR adapters, ephemeral QR registry, Chinese operator UX, Windows launcher, automated tests, and real Windows QR acceptance.

Security baseline retained by every later phase: no catch-all proxy, no trading/state-changing financial operation, no wildcard CORS, no raw `/v1/market/*` fallback, and no browser exposure of upstream QR flow IDs/secrets.

## Phase 3 — Local upgrade center and runtime OpenAPI/docs foundation

Status: **CLOSED**.

Delivered:

- local `/updates` explicit check/plan/apply workflow reusing the lifecycle transaction;
- fixed trusted GitHub release source, stale-plan rejection, concurrency protection, size/SHA/version/compatibility/health/rollback checks;
- fixed-target runtime `http://127.0.0.1:17281/openapi.json` discovery with bounded fetch, validation, cache, deterministic fingerprint, operation catalog/diff, and required-contract checks;
- candidate activation gating on health + runtime OpenAPI + required Bridge contracts + semantic probes;
- local `/api-reference` separating complete upstream reference, Bridge API, and compatibility/change views;
- deny-by-default behavior where discovery never authorizes a route;
- target Windows x64 acceptance recorded in `docs/operations/windows-phase-3-acceptance.md`.

Detailed closed task package:

`docs/tasks/phase-3-fqgate-upgrade-and-runtime-openapi.md`

---

## Phase 4 — Secure remote human access: Cloudflare Tunnel + Access

Status: **CLOSED**.

Delivered selected authenticated remote human Dashboard/QR/status/reference access while preserving loopback-only FQGate/Bridge listeners and a server-side operation allowlist.

Remote-human allowed operations remain:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

For the Phase 4 `remote_human` context, the following remain local-only. The
separately reviewed Phase 4.5C policy gives only `remote_admin` access to them
after independent authentication and control-request checks:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Phase 4 uses a pre-created remotely-managed Tunnel, Cloudflare Access human policy, fixed loopback Bridge origin, protected token file, fixed-source cloudflared lifecycle, unknown-Host fail-closed handling, and assertion-presence defense-in-depth. The real Windows x64 + Cloudflare acceptance was completed on 2026-09-17.

Historical artifacts:

- `docs/plans/phase-4-secure-remote-human-access.md`
- `docs/tasks/phase-4-cloudflare-tunnel-access.md`
- `docs/prompts/phase-4-codex-goal.md`
- `docs/status/phase-4-implementation-handoff.md`
- `docs/operations/windows-phase-4-acceptance.md`

Phase 4 remains closed; future work must not retroactively expand its contract.

---

## Phase 4.5 — Remote administrator hardening + mobile Dashboard

Status: **CLOSED**; 4.5A, 4.5B, and 4.5C are implemented and the live Windows
x64 + Cloudflare acceptance completed on 2026-09-19.

Goal: introduce a separately authenticated and separately authorized remote-administrator context for a very small existing maintenance surface, and optimize the existing React/TanStack Dashboard for phone use, without weakening Phase 4 or implementing Phase 5 market-data APIs.

Detailed design:

`docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`

Detailed task package:

`docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`

Codex handoff:

`docs/prompts/phase-4-5-codex-goal.md`

### 4.5A — Policy/authentication foundation, no privilege expansion

Status: **IMPLEMENTED**. The operation registry now uses independent allowed
caller contexts and confirmation metadata. An optional distinct admin Host and
Access team/AUD can produce `remote_admin` only after Bridge-side RS256 JWT
verification with exact issuer/audience, temporal claims, `kid` rotation, and a
bounded fixed-endpoint JWK cache. The admin context still has no maintenance
permission; the four update/OpenAPI control operations remain local-only.

Refactor caller context and operation authorization into orthogonal policy dimensions so the project can represent:

```text
local
remote_human
remote_admin
later: remote_machine
```

without combinatorial exposure enums.

Add a distinct admin hostname and distinct Cloudflare Access application/audience. Remote-admin requests require stronger origin-side Cloudflare Access JWT verification with exact issuer/AUD/signature/time checks and bounded fixed-source JWK handling. The admin Access application must be human-only, require MFA, use a short administrative session, enable Protect with Access, and contain no Bypass/Service Auth path. The current operator-approved low-friction profile does not require WARP, client certificates, hostname mTLS, or device posture; a future stronger posture profile must remain separately documented and must not be inherited by `remote_machine`.

At the end of 4.5A there is **no maintenance privilege expansion**: remote admin may use only the same safe surface as the current remote human. This checkpoint must land before any admin mutation becomes remotely callable.

### 4.5B — Mobile Dashboard optimization, no authorization changes

Status: **IMPLEMENTED**.

Keep one React 19/TanStack Start application and existing routes. Optimize Dashboard, QR login, update view, and API reference for ~360px+ viewports, touch targets, bounded long content, safe responsive navigation, mobile viewport/safe-area behavior, keyboard/focus usability, and phone/tablet Playwright coverage.

Responsive UI must never become an authorization mechanism. Ordinary remote-human update behavior remains read-only.

### 4.5C — Minimal remote-admin maintenance + second confirmation

Status: **CLOSED**; live Windows x64 + Cloudflare acceptance is recorded in the
Phase 4.5 acceptance runbook.

Only after 4.5A/4.5B are stable, permit strongly authenticated remote admin to call exactly:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

`updates.apply` additionally requires a short-lived, one-time, server-side confirmation grant bound to verified admin principal, admin audience, operation, and exact update plan/candidate identity. Existing stale-plan/source/version/size/hash/compatibility/health/rollback checks remain mandatory and additive.

Remote-admin control POSTs also require explicit browser-origin/CSRF protections. cloudflared management, Tunnel-token operations, Cloudflare provisioning, arbitrary process/service control, raw FQGate routes, Bridge self-update, and market-data operations remain outside remote admin.

### Phase 4.5 exit criteria

Phase 4.5 closed on 2026-09-19 after:

1. Phase 4 remote-human behavior was preserved;
2. admin hostname/AUD/context was independently authenticated and authorized;
3. the approved short-session admin Access policy with MFA was live and its low-friction posture choice was documented;
4. Bridge validated real admin Access JWTs without logging them;
5. mobile Dashboard requirements and viewport tests passed;
6. only the four listed maintenance operations gained remote-admin permission;
7. remote `updates.apply` required one-time principal/action/plan-bound confirmation and rejected expiry/replay/mismatch;
8. CSRF/origin defenses passed;
9. all deterministic quality gates passed;
10. real Windows x64 + Cloudflare acceptance re-proved loopback-only listeners, ordinary-human denial, the approved admin edge policy, admin flow, confirmation flow, raw-path denial, local maintenance, and mobile-browser smoke behavior;
11. one known-safe real remote-admin update apply completed successfully.

The Windows acceptance helper now has an explicit
`-RunAuthenticatedBrowserMatrix` mode backed by
`scripts/windows/phase45-authenticated-acceptance.mjs`. It reduces the live
request work to an operator's two Access login/MFA boundaries and uses a
non-persistent browser context; it does not change the exit criteria or run a
real apply.

Phase 4.5 non-goals include Phase 5 machine APIs/service tokens, Phase 6 provisioning, supervisor/notifications, automatic updates, MCP/WebSocket, final packaging, generic remote shell/process control, and any financial state-changing capability.

## Future planning item — operator setup simplification and multi-profile isolation

Status: **PLANNED; no implementation in Phase 4.5**.

The repeatable operator procedure is maintained as the Chinese long-lived
reference in `docs/operations/windows-phase-4-5-remote-admin-setup.md`. For
OpenWrt + daed/passwall2 deployments, the current documented target is direct
Access email + MFA with no Cloudflare One Client prerequisite. A future setup
doctor/wizard may validate the selected service-scoped hostnames, Access
application/AUD, Tunnel ingress, loopback listeners, token-file shape, and
policy/Bridge agreement with plan/dry-run behavior. A separate future profile
may opt into device posture, but neither profile may silently create broad
Cloudflare permissions, disable MFA, or bypass the one-time apply confirmation;
Cloudflare provisioning remains Phase 6 scope.

The related multi-account idea is recorded separately in
`docs/plans/future-multi-profile-account-isolation.md`. It must first establish
whether FQGate supports isolated multi-login sessions. The future design must
use explicit Bridge-owned profile IDs, per-profile secrets/session state,
cross-profile isolation tests, and profile-bound authorization/confirmation.
It must not be implemented by adding a raw profile/account parameter to an
upstream path, and it must not be conflated with the later `remote_machine`
context of Phase 5.

---

### Entry gate before Phase 5 implementation

Before any Phase 5 implementation, complete the active closure package:

`docs/tasks/phase-4-5-closure-and-phase-5-foundation.md`

The gate is strict: GitHub Actions must be green on Ubuntu and Windows, and Phase 4.5 T1-T17 must be evidenced, including the real authenticated remote-admin apply. Machine-verifiable checks must be automated wherever safe; genuine human-only checks must have exact steps, expected results, and documented automation boundaries.

## Phase 5 — Remote read-only HTTP API and filtered API docs

Status: **CLOSED — Phase 5-A/B/C deterministic, Windows, real remote and CI acceptance passed**.

Goal: make selected market-data capabilities safely consumable by remote
software without turning the Bridge into a generic FQGate proxy and without
allowing a machine identity to inherit any human/admin/session/update
privilege.

Detailed design:

`docs/plans/phase-5-remote-machine-read-only-api.md`

Closed Phase 5-B task:

`docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md`

Phase 5-B execution record:

`docs/prompts/phase-5-b-codex-goal.md`

Phase 5-A closed task/evidence remain historical baseline:

- `docs/tasks/phase-5-a-remote-machine-zero-privilege.md`
- `docs/status/phase-5-a-implementation-handoff.md`
- `docs/operations/windows-phase-5-a-acceptance.md`

### 5-A — remote-machine identity/context foundation, zero privilege

Implementation status: **CLOSED**. Deterministic identity, hostname, verifier,
zero-operation policy, secret-safe Windows harness, permanent Windows evidence,
Ubuntu/Windows CI, and real service-token acceptance are complete. Phase 5-B
remains a separate task with one instrument lookup implemented and all closure criteria passed.

Add a fourth request context:

```text
remote_machine
```

It must use its own API hostname and Cloudflare Access application/AUD with a
service-token identity. The Bridge must validate the signed Access application
JWT at the origin with the same bounded fixed-team-domain JWK discipline used by
the administrator verifier, but with a machine-specific claim profile:
`type=app`, exact issuer/AUD/time/signature, bounded non-empty
`common_name`, and the service-token empty-`sub` semantics documented by
Cloudflare. The resulting principal is machine-kind and must never be treated as
a human/admin principal.

The first checkpoint grants `remote_machine` **no existing Bridge operation**.
This deliberately proves authentication and isolation before market data is
added.

Phase 5-A closure evidence is recorded in the implementation handoff and
Windows acceptance document. Cloudflare provisioning automation remains Phase 6;
the one-time operator-authorized resource setup did not add provisioning code.

Implementation handoff: `docs/status/phase-5-a-implementation-handoff.md`.
Windows procedure/evidence: `docs/operations/windows-phase-5-a-acceptance.md`.

### 5-B — runtime contract census and first read-only market slice

Status: **CLOSED — census, one instrument lookup, Windows/remote/CI acceptance passed**. Executable contract: `docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md`.

Phase 5-A is closed, so inspect the **running target FQGate**
`http://127.0.0.1:17281/openapi.json` and execute bounded semantic probes from
the permanent Windows environment. Select the smallest useful read-only set
from real observed contracts and consumer needs.

Public upstream code currently suggests candidates such as symbol search,
realtime quote, and historical bars, but those names are evidence inputs, not
authorization or a frozen contract. Each chosen operation must get a
Bridge-owned operation ID, public path/method, typed request/response
normalization, timeout/body/result bounds, compatibility gate, redaction policy,
and explicit proof that it cannot mutate brokerage/financial state.

No raw upstream path parameter, wildcard proxy, or automatic exposure from
runtime OpenAPI is allowed.

### 5-C — filtered machine OpenAPI and live remote closure

Status: **CLOSED — implementation and final acceptance passed**. Executable contract:
`docs/tasks/phase-5-c-filtered-machine-openapi-and-remote-closure.md`.
Codex handoff: `docs/prompts/phase-5-c-codex-goal.md`.

Generate machine-facing OpenAPI only from explicit Bridge registry entries that
allow `remote_machine`. Upstream discovery remains descriptive only.

Implemented route: `openapi.machine`, GET `/api/v1/openapi/machine`, allowed
exactly for local + remote_machine. It emits a canonical 64-KiB-bounded document
containing the lookup and docs route only, using explicit registry-owned public
schema metadata without any runtime discovery dependency.

Phase 5 closed after a real machine client through the separate Access
application + Tunnel can call the approved read-only operations, forbidden
human/admin/session/update/raw routes remain denied, compatibility drift fails
closed, and the live Windows topology is still loopback-only.

A Phase 5 machine identity must never inherit QR/session maintenance,
update/admin operations, OpenAPI refresh, browser confirmation grants, or any
financial state-changing capability.

Phase 5 may share generic cryptographic/JWK plumbing with Phase 4.5 only when
hostname, Access application/audience, identity claim profile, principal kind,
operation allowlist, configuration, and tests remain independent.

---

## Closed maintenance track — FQGate release compatibility and 1.0.2 refresh

Status: **CLOSED — permanent Windows 1.0.2, local/remote acceptance and CI passed**.

The post-Phase-5 qualification work replaced literal patch-version coupling with artifact-bound,
operation-scoped evidence while preserving fixed official-source pinning, exact size/SHA-256,
health/OpenAPI checks, rollback, loopback-only listeners and deny-by-default Bridge policy.

Closure evidence is authoritative in:

- `docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`
- `docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`

Do not treat this closed maintenance track as a Phase 6 blocker.

---

## Phase 6-A — Cloudflare read-only discovery and deterministic plan

Status: **CLOSED** at implementation commit `9c6babb`. The implementation validates a short-lived scoped read token,
discovers the exact account/zone, remotely-managed Tunnel/configuration, three DNS
records, independent human/admin/machine Access applications/AUDs and policies,
then produces a stable secret-free reconciliation plan and SHA-256 fingerprint.
It is GET-only, bounded and fail-closed on ambiguous resources, direct 17281 or
wrong 17282 origin, broad ingress, unexpected AUD, Bypass/Everyone and policy
widening. It performs no Cloudflare mutation and changes no Bridge operation
allowlist. See:

- `docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md`;
- `docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md`;
- `docs/operations/windows-phase-6-a-acceptance.md`;
- `docs/status/phase-6-a-implementation-handoff.md`.

The permanent-Windows run recorded 14/14 PASS, including the 21/21 Phase 5-C
remote matrix; the same commit passed Ubuntu and Windows CI run `35828737376`.

## Post-Phase-6-A — Windows credential custody and secret-directory retirement

Task defined; implementation has not started. The credential-custody task at
`docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md`
will let the current Windows user enroll a bounded Cloudflare read token and
the existing machine Client ID/Secret once, then explicitly use the local
Credential Manager for later live verification. The current `fqgate-secrets`
directory has broad inherited ACLs and is not a safe file-backed vault. The
task must preserve the prompt path, expiration handling, redaction and all
Phase 6-A read-only boundaries. It also plans to move the LocalSystem Tunnel
token to the protected `C:\ProgramData\FQGateRemoteBridge\secrets\tunnel-token`
default, verify service restart and remote access, then retire the old
`fqgate-secrets` files and directory. The Tunnel token remains a protected
service file and does not enter the user vault. It does not authorize Phase
6-B mutation or token rotation.

Phase 6 invariants:

- never request or accept a Cloudflare Global API Key;
- API base/endpoint families are fixed in code;
- Tunnel ingress always targets `http://127.0.0.1:17282`, never 17281;
- human/admin/machine Access apps, policies and AUDs remain distinct;
- no Bypass/Everyone widening is silently adopted;
- setup credentials never enter Git, normal config, logs or evidence;
- Bridge authorization remains independent of Cloudflare provisioning.

## Phase 6-B — bounded Cloudflare provisioning and drift application

Planned only. A separate task must authorize reviewed create/adopt/update/delete
adapters, stale-plan rejection, rollback and credential lifecycle. Phase 6-A
does not implement or imply any of them.

## Phase 6-C — live reconciliation and credential retirement

Planned only. A separate task must define no-op reconciliation on permanent
Windows, removal of setup write credentials from runtime requirements, remote
regressions and exact-final-commit Ubuntu/Windows CI.

## Phase 7 — Supervisor, recovery, audit trail, notifications

Goal: make the system dependable on an always-on Windows PC with bounded recovery, session/tunnel monitoring, redacted event journal, webhook notification provider, deduplication/cooldown, and recovery events.

## Phase 8 — Safe automatic updates

Goal: add conservative configurable update policy only after manual local and remote-admin update workflows are proven stable. Automatic updates remain off by default until explicitly configured.

## Phase 9 — MCP and realtime WebSocket compatibility

Goal: investigate and expose richer protocols only after the read-only HTTP security model is stable, with no generic transport tunnel around operation policy.

## Phase 10 — Packaging and operator UX

Goal: versioned Windows release artifact, install/uninstall/reconfigure flow, startup integration where proven, redacted diagnostics, configuration migration, release checksums, and troubleshooting documentation.

## Future / optional

- multiple FQGate hosts/failover;
- LAN-only deployment mode;
- alternative secure overlays such as Tailscale/Headscale;
- multiple notification providers;
- Prometheus/metrics exporter;
- consumer-specific adapters such as `turtle-value-engine` integration.

## Current development handoff

Phase 5, the post-Phase-5 FQGate 1.0.2 maintenance track and Phase 6-A are
closed. The next defined task is Windows credential custody and old
secret-directory retirement, with no Cloudflare mutation authority:

`docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md`

Codex handoff:

`docs/prompts/post-phase-6-a-credential-custody-codex-goal.md`

Phase 6-A historical implementation and evidence:

- `docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md`
- `docs/status/phase-6-a-implementation-handoff.md`
- `docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md`

Required historical baselines before implementation:

- `docs/status/phase-5-c-implementation-handoff.md`
- `docs/operations/windows-phase-5-c-acceptance.md`
- `docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`
- `docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`

Use the permanent Windows checkout at `D:\\code\\research\\fqgate-remote-bridge`.
Automate every machine-verifiable quality, fixture, discovery, reconciliation, loopback and
regression check. Human intervention is limited to the explicitly documented hidden credential
entry, exact `LOGIN_REQUIRED` QR boundary, or a `MANUAL_REQUIRED` result that includes the
exact Dashboard path, field, expected value, reason automation cannot prove it, and resume
command. Phase 6-B still needs a separate provisioning task; credential
custody does not authorize it.
