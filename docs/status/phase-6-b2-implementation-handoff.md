# Phase 6-B2 implementation handoff

Status: **CLOSED on 2026-09-29**. Scope is
`docs/tasks/phase-6-b2-bounded-tunnel-access-provisioning.md`. The final
runtime and acceptance implementation commit is
`a5b8023350acaebf60c596055d891ef1ea15e67b`. This handoff is a
subsequent documentation-only change.

## Bounded implementation

`cloudflare apply` consumes one selected check and the exact Phase 6-A plan
fingerprint. B2 supports only the fixed Tunnel ingress and human/admin/machine
Access application/policy create or narrow correction actions in the task
contract. It uses a separate typed write transport, a repo-external exact
policy profile and its SHA-256 fingerprint, and short-lived account-scoped
write-token capability verification. The Phase 6-A discovery transport stays
GET-only. B1 DNS uses its separate exact-zone credential and preserves its
single-action rollback. The Bridge has no new route or operation grant.

The fixed B2 write endpoint families are one Tunnel configuration `PUT`,
Access application `POST` or exact-app `PUT`, and Access policy `POST` or
exact-policy `PUT`. There is no generic method/path dispatch, Tunnel token
retrieval, application deletion, DNS update/delete, or background reconcile.
The write-token scope check uses only fixed account-token `GET` endpoints.
The profile and write credentials were not needed in the in-sync production
run and were not persisted.

## Deterministic checks and CI

Frozen pnpm install, typecheck, lint, 21 Vitest files with 272 tests,
production build, format check and 15 Playwright E2E tests passed. B2 fixtures
cover exact method/path/count, one action, stale plan, wrong origin/17281,
wildcards, duplicate/ambiguous identities, wrong AUD, cross-profile policy,
Bypass/Everyone, overbroad token scope, response bounds, redirect and partial
failure. Windows PowerShell parsed both B2 scripts. CI run
[36551417530](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/36551417530)
on the exact implementation commit passed Ubuntu job `109350231768` and
Windows job `109350232164`. Permanent Windows used Node `v24.19.0`, pnpm
`11.23.0`, PowerShell `5.1.26100.9549`, Git `2.55.0.windows.5`.

## Permanent-Windows live acceptance

The existing clean `D:\code\research\fqgate-remote-bridge` checkout was used;
no second Windows checkout or production drift was created. The reviewed
resource types/IDs were the remotely-managed Tunnel
`947df8a3-094d-439c-82dd-db43195ab99e` and independent Access
applications: human `3b7a2a2f-3a3e-4cb9-91ef-d96d9ef55233`, admin
`df569edc-d978-4758-8ea8-18eeb0fa6db6`, and machine
`b9bf0d7c-949a-4878-a765-257e63819a2e`. These are identifiers, not
credentials. All three desired hostnames use the same Bridge origin
`http://127.0.0.1:17282` with distinct Access identities. No direct 17281
or wildcard ingress was accepted.

The live Phase 6-A plan was fully in sync, read-only with zero mutation methods.
Its before and after fingerprint was
`07379ee05233c6f96c0a978f102c7be2622e2bee4f445edd6fe551232a2f3ee1`.
The B2 in-sync apply was rejected as designed without a write credential:
**production mutation count 0**. The fixed B2 write behaviors were tested
with deterministic fixtures; there was no isolated Tunnel/Access canary that
could be safely used without affecting production identities. The initial
secret-free record is
`D:\code\research\fqgate-phase6b2-acceptance-evidence.json`.
It records preflight/no-op/post-plan, Phase 6-A 14/14, real Phase 5-C remote,
and headed ordinary/admin browser PASS. The browser matrix covered ordinary
maintenance denial, admin check/plan/OpenAPI refresh, direct forbidden paths,
QR, and authenticated 360/390/430/768-pixel viewports. Operator Access login
and admin MFA occurred in the transient headed browser; no browser secrets
were saved.

The first local Phase 5-B census after the browser run failed transiently;
its bounded wrapper emitted `P6B2_ACCEPTANCE_FAILED`. The same census
subsequently returned PASS with FQGate session `connected`. The failure remains
in the initial evidence. Rather than erase it or repeat the human browser
steps, the exact-evidence resume script verified the earlier PASS records,
unchanged runtime sources, and a fresh in-sync plan. Its separate secret-free
record is `D:\code\research\fqgate-phase6b2-resume-evidence.json`: 6/6
PASS on `a5b8023350acaebf60c596055d891ef1ea15e67b`, including Phase 6-A
14/14 with real Phase 5-C service-token regression, local Phase 5-A/B/C,
and FQGate/Bridge listeners exactly `127.0.0.1:17281` and
`127.0.0.1:17282`. The Phase 6-A evidence at
`D:\code\research\fqgate-phase6a-discovery-evidence.json` records the same
commit, plan fingerprint, 14/14, and no failed/manual/skipped checks.

The read and machine service-token Vault entries were renewed through hidden
operator input before these checks. No token, Access assertion, browser
cookie, QR payload, policy-sensitive body, or Tunnel credential appears in
this handoff or the recorded evidence.

## Remaining boundary

Phase 6-C credential retirement, background reconciliation and broader
Cloudflare provisioning remain unauthorized. This closure does not authorize
production drift creation or a broad policy replacement.
