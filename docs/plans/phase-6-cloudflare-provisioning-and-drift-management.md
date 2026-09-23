# Phase 6 — Cloudflare provisioning and drift-management design

Date: 2026-09-22
Status: **Phase 6-A CLOSED; Phase 6-B/C remain separately unauthorized**

## Purpose

Phase 4, Phase 4.5 and Phase 5 proved a secure deployment manually:

```text
Cloudflare Access
  -> remotely-managed Cloudflare Tunnel
  -> http://127.0.0.1:17282 Bridge
  -> explicit Bridge operation policy
  -> http://127.0.0.1:17281 FQGate
```

Phase 6 converts that manually managed control-plane setup into a bounded, auditable reconciler
without making Cloudflare credentials a permanent runtime dependency and without weakening the
Bridge security model.

## Non-negotiable invariants

- FQGate remains exactly loopback-only on 127.0.0.1:17281.
- Bridge remains exactly loopback-only on 127.0.0.1:17282.
- Cloudflare ingress may target the Bridge only; direct 17281 ingress is unsafe.
- No Global API Key.
- Human, admin and machine hostname/application/AUD/policy boundaries remain distinct.
- No Bypass/Everyone widening may be silently adopted.
- Runtime OpenAPI never authorizes Cloudflare or Bridge resources.
- The Bridge operation registry remains the application authorization source.
- Cloudflare setup credentials never enter Git, standard JSON config, logs, command-line
  arguments or evidence.
- Existing Phase 0-5 behavior and acceptance remain regression requirements.

## Phase split

### Phase 6-A — read-only discovery + deterministic reconciliation plan

Implemented and closed. Permanent-Windows live acceptance and exact-commit
Ubuntu/Windows CI passed on final Phase 6-A implementation commit
`9c6babb08eaf9a31a226c7950d64b642fc0b2c90`. The separate
post-Phase-6-A acceptance credential custody task adds no Cloudflare mutation
authority.

Build a fixed-endpoint read-only Cloudflare client and inventory exactly the resources that
implement the current deployment. Compare observed state with explicit desired state and produce
a stable plan/fingerprint.

There is no control-plane mutation in 6-A. The implementation must make POST/PUT/PATCH/DELETE
impossible at the Cloudflare transport layer.

The implementation lives in `src/cloudflare/` and exposes exactly
`cloudflare discover` and `cloudflare plan` through the CLI. The desired-state
template is `config/cloudflare-phase6a-desired.example.json`. Phase 6-A does not
add Bridge routes or change the operation registry.

### Phase 6-B — bounded apply

Future separate task only.

Consume an exact Phase 6-A plan, re-read current state, reject stale plans, and create/adopt/update
only explicitly supported resources using a separately scoped setup-time write token. Deletion,
token rotation and broad policy replacement are not implicitly included.

### Phase 6-C — live closure and credential retirement

Future separate task only.

Reconcile the real deployment to a deterministic no-op plan, remove the write credential from
normal runtime requirements, then re-run human/admin/machine remote acceptance and exact-final-
commit CI.

## Desired-state model

Desired state must come from explicit repo-external configuration, not heuristics. At minimum:

- exact Cloudflare account ID;
- exact zone ID;
- intended named Tunnel, preferring stable ID when known;
- human hostname;
- admin hostname;
- machine hostname;
- expected Access application/AUD mapping for each hostname;
- expected Bridge origin, validated exactly as `http://127.0.0.1:17282`.

API tokens and Tunnel/service credentials are not desired-state fields. Duplicate resource names
or multiple candidate matches are conflicts; never choose "the first" match.

## Read-only Cloudflare API boundary

Use fixed base `https://api.cloudflare.com/client/v4`. Phase 6-A implements only typed GET
operations needed for token verification, Tunnel inventory/config, DNS records, Access
applications and Access policies.

Requirements: redirects disabled, finite timeout, bounded body and pagination, defensive
Cloudflare envelope parsing, bounded normalized errors, Authorization redaction, no arbitrary
host/path/method input, and capability calls to prove the required read scope.

## Reconciliation plan

Emit canonical stable JSON and SHA-256 fingerprint. The implemented check
classifications are `in_sync`, `missing`, `unexpected`, `mismatch`, `ambiguous`,
`unsafe_conflict`, `manual_required` and `blocked`. Future actions are `none`,
`create`, `adopt`, `update` and `remove`. Unsafe and manual checks never apply.
An `in_sync` check has action `none`; `manual_required` and `unsafe_conflict`
also carry no mutation action. Safe drift may describe a future action only.

Examples of `unsafe_conflict`: direct 17281 ingress, wrong origin, wildcard/unknown route,
duplicate ambiguous resources, broad Access Bypass/widening, or app/AUD/hostname mismatch.

Phase 6-A may describe future create/adopt/update actions but cannot execute them.

## Secrets

The Cloudflare read token is runtime-only. On Windows it must be obtained with
`Read-Host -AsSecureString`, decrypted only briefly in memory, passed to the child by
environment only, cleared in `finally`, and never printed/persisted.

The existing machine Access Client ID/Secret remain under the existing Phase 5-C hidden-input
workflow.

## Permanent Windows acceptance

Use the existing checkout:

```text
D:\code\research\fqgate-remote-bridge
```

Never create a second checkout to bypass local-state problems. Use the existing repo-external
acceptance config. The Bridge must be launched with that same config; do not repeat the earlier
unconfigured `start-bridge.mjs` mistake.

Evidence path:

```text
D:\code\research\fqgate-phase6a-discovery-evidence.json
```

Evidence may contain commit/tool versions, bounded resource IDs/counts, PASS/FAIL IDs, drift
classifications and plan fingerprint, but never tokens, assertions, service-token secrets,
cookies, QR/session material or raw sensitive API bodies.

## Human-only boundaries

1. Least-privilege Cloudflare read token entered only via hidden prompt.
2. Existing machine Client ID/Secret only when the existing Phase 5-C remote regression runs.
3. Physical FQGate QR only if automation returns exact normalized `LOGIN_REQUIRED`.
4. Any other truly unavoidable manual check must state exact Dashboard navigation, field,
   expected value, why the API cannot prove it, and the exact resume command.

## Phase 6-A exit

Close only after deterministic tests, full repository gates, permanent-Windows live discovery,
stable secret-free plan/fingerprint, proof of no Cloudflare mutation path, loopback/Access
isolation checks, existing Phase 5 remote-machine regression, exact-final-commit Ubuntu/Windows
CI, and no unresolved manual or unsafe conflict.

Phase 6-A closure does not authorize Phase 6-B.
