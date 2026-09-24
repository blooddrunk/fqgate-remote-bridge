# Phase 6-B1 — stale-plan guarded DNS apply foundation

Date: 2026-09-24
Status: **AUTHORIZED NEXT TASK — implementation not started**

Codex handoff: `docs/prompts/phase-6-b1-codex-goal.md`

## Goal

Introduce the first bounded Cloudflare write capability without turning the Bridge
into a generic provisioning proxy and without widening the already-closed Phase
6-A security model.

Phase 6-B1 consumes the deterministic Phase 6-A desired state and plan, re-reads
Cloudflare immediately before mutation, rejects stale fingerprints, and may apply
exactly one supported drift check per invocation.

The first production write surface is deliberately narrow: create one missing,
exact DNS CNAME record for the existing human, admin or machine hostname. The
record target is derived from the already-selected remotely-managed Tunnel,
must be proxied, and may never point at FQGate or an arbitrary caller-provided
origin.

This task does **not** authorize Access application/policy mutation, Tunnel
configuration mutation, arbitrary DNS update/delete, adoption, token
creation/rotation, background reconciliation, a generic Cloudflare REST proxy,
new Bridge operations, or Phase 6-B2/6-C.

## Why the first write slice is DNS-only

The current deployment is already live and in sync. Access application identity
includes Cloudflare-generated AUD state, and Tunnel configuration updates are
whole-configuration writes that can accidentally drop unknown fields if a
normalized read model is written back. Neither is appropriate for the first
mutation slice.

DNS record creation has a smaller, independently verifiable contract and can be
guarded by exact zone, hostname, type, target and proxy requirements. Broader
mutation remains separately planned.

## Production apply contract

Add a CLI surface equivalent to:

```text
cloudflare apply --desired-state <path> --expected-fingerprint <sha256> --check-id <id> --json
```

Required behavior:

1. Load and validate the same repo-external desired-state schema used by Phase
   6-A.
2. Discover current state with the existing read-only token and rebuild the
   canonical Phase 6-A plan.
3. Reject unless the supplied fingerprint exactly matches the newly computed
   fingerprint.
4. Reject if the plan contains any `unsafe_conflict`, `ambiguous`,
   `blocked` or `manual_required` check.
5. Reject unless `--check-id` names exactly one supported DNS check whose
   classification/action is `missing/create`.
6. Apply at most one mutation per invocation. A second action requires a new
   discovery/plan/fingerprint.
7. Derive the DNS payload from validated desired/observed state only:
   - zone is the uniquely selected desired zone;
   - name is exactly one desired human/admin/machine hostname;
   - type is exactly `CNAME`;
   - content is exactly `<selected-tunnel-id>.cfargotunnel.com`;
   - `proxied` is exactly `true`.
8. Re-read current state immediately before POST and again after POST. If the
   pre-write fingerprint changed, do not write.
9. Capture the created DNS record ID only in memory. If the POST succeeded but
   postcondition verification or the required remote regression fails, delete
   only that exact record ID created by the current invocation, then prove the
   pre-apply plan/fingerprint is restored.
10. The production reconciler has no desired-state `remove` action in B1.
    Transaction-local rollback deletion is permitted only for the record ID
    returned by the same invocation; callers cannot supply an arbitrary delete
    target.

## Write transport boundary

Use the fixed Cloudflare API base and typed endpoint builders. The B1 write
transport may expose only:

- POST the exact DNS-record collection for the selected desired zone;
- DELETE the exact DNS-record item returned by the current invocation, and only
  from the rollback path.

No arbitrary URL, method, account, zone, record type, hostname or body input may
reach the write transport. Redirects remain disabled; timeout, body and envelope
bounds must match or strengthen Phase 6-A.

The existing Phase 6-A GET-only transport remains unchanged and independently
testable.

## Credentials

Keep the closed three-entry acceptance vault unchanged. Phase 6-B1 must not add a
long-lived write credential to that vault.

For a real B1 write/canary verification, use a separately scoped, time-bounded
Cloudflare API token with the minimum DNS write permission for the exact zone.
It enters only through a hidden Windows `Read-Host -AsSecureString` boundary,
is converted only briefly in memory, is passed to the bounded child process via
environment, and is cleared in `finally`.

The existing Vault-backed Cloudflare read token and machine Access credentials
remain the sources for discovery and remote regression. Never request a Global
API Key.

## Live write canary

Do not manufacture drift in the three production hostnames merely to prove a
write path.

Instead add a permanent-Windows acceptance-only canary that uses the same typed
DNS write client against one hard-coded reserved name:

```text
_fqgate-remote-bridge-phase6b-canary.<desired-zone>
```

The canary:

1. fails closed if any record already exists at that exact name;
2. creates one TXT record containing only non-secret commit/evidence metadata;
3. re-reads and proves the exact returned record exists;
4. deletes only the returned record ID;
5. re-reads and proves the reserved name is absent;
6. records no token, authorization header or response body.

The canary is acceptance-only and does not expand the production desired-state
action set to TXT or arbitrary delete.

## Automated verification first

All machine-verifiable work must run automatically. Add deterministic fake-HTTP
coverage for at least:

- stale fingerprint rejection before write;
- unsupported check/action rejection;
- global unsafe/ambiguous/blocked/manual gate;
- exact DNS payload construction;
- one-action-per-invocation;
- redirect, timeout, pagination/body/envelope bounds;
- token/header redaction;
- POST failure with no rollback attempt;
- successful POST + successful postcondition;
- successful POST + failed postcondition -> exact-record rollback;
- rollback failure surfaced as a distinct bounded error with created record ID
  metadata only, never secret material;
- concurrent/current-state drift detected by the second pre-write re-read;
- canary collision refusal and cleanup.

Do not close the task based on prose evidence when a command can verify the
condition.

## Permanent Windows acceptance

Use only:

```text
D:\code\research\fqgate-remote-bridge
```

Do not create a second checkout to bypass local state.

Required evidence:

| ID | Required evidence |
| --- | --- |
| P6B1-T1 | write transport has only fixed DNS POST plus same-invocation rollback DELETE |
| P6B1-T2 | stale fingerprint and second pre-write state check reject before mutation |
| P6B1-T3 | only one `missing/create` desired DNS check may apply per invocation |
| P6B1-T4 | exact CNAME/proxied/tunnel-derived payload; no arbitrary body/path/method |
| P6B1-T5 | write token is hidden, ephemeral, redacted and absent from vault/config/log/evidence |
| P6B1-T6 | deterministic create/postcondition/rollback/canary fixture coverage passes |
| P6B1-W1 | frozen install, typecheck, lint, tests, build, format and Playwright pass on permanent Windows |
| P6B1-W2 | live Phase 6-A plan on the real deployment is re-read and remains safe/in-sync before B1 testing |
| P6B1-W3 | live reserved TXT canary create/read/delete/absence passes with the scoped write token |
| P6B1-W4 | live production `apply` on an in-sync plan returns bounded no-op/refusal and performs zero writes |
| P6B1-W5 | Vault-backed Phase 6-A 14/14 and Phase 5-C 21/21 remote regression pass after the canary |
| P6B1-CI | Ubuntu/Windows CI passes on the exact final implementation commit |

If a real supported production DNS drift happens to exist, the same invocation
may repair exactly one missing record after the operator has supplied the
expected current fingerprint. Do **not** create drift solely for acceptance.
Record `NO_SUPPORTED_PRODUCTION_DRIFT` as the expected live state when the
deployment is already in sync; this is complete evidence, not missing evidence.

## Human-only boundaries

The normal implementation and verification flow should be autonomous.

Human intervention is limited to:

1. entering the separately scoped write token through a hidden local PowerShell
   prompt when the live canary or a real supported apply runs;
2. physical FQGate QR approval only after automation returns exact normalized
   `LOGIN_REQUIRED`;
3. a genuinely API-unobservable Cloudflare check only if the agent prints the
   exact Dashboard path, field, expected value, reason automation cannot prove
   it, and exact resume command.

Do not ask the operator to copy credentials into chat, command arguments,
temporary files or evidence.

## Closure

Create `docs/status/phase-6-b1-implementation-handoff.md` and a permanent
Windows operations procedure during implementation. Keep Phase 6-B1 OPEN until
all deterministic gates, live canary cleanup, post-canary remote regression and
exact-final-commit CI pass.

Phase 6-B2 and Phase 6-C remain unauthorized by this task.
