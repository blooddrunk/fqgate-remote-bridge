# Phase 6-A task — Cloudflare read-only discovery and deterministic plan

Date: 2026-09-22
Status: **CLOSED — exact implementation commit `9c6babb` passed permanent-Windows
live acceptance and Ubuntu/Windows CI; see the implementation handoff**

## Goal

Implement the minimum read-only Cloudflare control-plane layer needed to machine-discover the
already deployed Phase 4/4.5/5 topology, reconcile it against explicit Bridge-owned desired
state, and emit a deterministic fingerprinted drift plan.

This task must not mutate Cloudflare.

## Source of truth

Read, in order: README.md, AGENTS.md, docs/architecture.md, docs/security.md,
docs/upstream-contracts.md, docs/roadmap.md,
docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md,
docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md,
docs/status/phase-5-c-implementation-handoff.md,
docs/operations/windows-phase-5-c-acceptance.md, this task, docs/agent-guide.md.

## In scope

- fixed-base GET-only Cloudflare API transport;
- API-token active/read-capability verification;
- exact account/zone config validation;
- Tunnel list + selected remote Tunnel config read;
- DNS discovery for exact human/admin/machine hostnames;
- Access application + policy discovery;
- explicit desired-state model;
- deterministic drift reconciliation + canonical SHA-256 plan fingerprint;
- CLI `cloudflare discover` and `cloudflare plan` commands;
- deterministic fixtures/tests;
- permanent-Windows read-only harness/evidence;
- existing Phase 5-C remote-machine regression;
- source-of-truth doc updates.

## Out of scope

No Cloudflare POST/PUT/PATCH/DELETE, resource create/update/delete, token creation/rotation,
Tunnel-token retrieval, Global API Key, generic Cloudflare REST proxy, Phase 7 work, automatic
updates, extra market APIs, MCP/WebSocket, or packaging.

## A — API transport

Create a framework-independent Cloudflare control-plane module separate from local
`src/cloudflared` lifecycle code.

Requirements:

- fixed `https://api.cloudflare.com/client/v4`;
- typed GET-only operations;
- redirects disabled;
- bounded timeout/body/pagination;
- defensive success/error envelope parsing;
- no raw response-body logging;
- Authorization redaction;
- token only from runtime secret provider/environment boundary;
- mutation methods unrepresentable in the Phase 6-A public interface.

Tests must prove no 6-A path can send POST/PUT/PATCH/DELETE.

## B — desired state

Add only non-secret metadata to repo-external config: exact account ID, zone ID, Tunnel identity
or name, three distinct remote hostnames, and Access application/AUD mapping. Never add API or
Tunnel tokens to JSON.

Expected origin must be exactly `http://127.0.0.1:17282`; 17281 is invalid.

## C — discovery

Read:

1. token status/capability;
2. Tunnel inventory;
3. selected remotely-managed Tunnel config/ingress;
4. DNS for exact hostnames;
5. Access apps for exact hostnames;
6. policies for each selected app.

Duplicate/ambiguous matches are conflicts. Do not choose the first result.

## D — reconciliation

The implemented classifications are `in_sync`, `missing`, `unexpected`,
`mismatch`, `ambiguous`, `unsafe_conflict`, `manual_required` and `blocked`.
Actions are `none`, `adopt`, `create`, `update` and `remove`; unsafe or manual
checks always use action `none`.

Unsafe conflict includes direct 17281, wrong origin, wildcard/broad ingress, ambiguous duplicate,
unexpected AUD mapping or broad Access Bypass/widening.

No action is applied in Phase 6-A.

## E — CLI/evidence

The implemented read-only CLI surface is exactly:

```text
cloudflare discover --json --desired-state <path>
cloudflare plan --json --desired-state <path>
```

Add Windows harness under the permanent environment. It must check git status, record exact
commit/tool versions, prompt for the Cloudflare token via `Read-Host -AsSecureString`, run
inspect + plan, write bounded redacted external evidence, clear secrets in `finally`, and never
print Authorization.

Evidence target:
`D:\code\research\fqgate-phase6a-discovery-evidence.json`.

## Automated verification — mandatory

Run automatically:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Also: Cloudflare fixture tests; GET-only invariant; pagination/timeout/body/redirect; redaction;
duplicate/ambiguous resources; Tunnel exact-origin/direct-17281/wildcard; DNS exact-host/proxy/
duplicate; Access app/AUD/policy isolation; stable plan/fingerprint; Bridge policy regression;
Windows CLI + loopback smoke; permanent-Windows live inspect/plan; existing Phase 5-C local +
real remote-machine regression; exact-final-commit Ubuntu + Windows CI.

CI uses fixtures only and no real Cloudflare credentials.

## Permanent Windows

Work only in `D:\code\research\fqgate-remote-bridge`. Preserve operator changes. Use existing
repo-external acceptance config. Before FQGate regression, ensure the running Bridge uses that
exact config, including
`FQGATE_REMOTE_BRIDGE_CONFIG=D:\code\research\fqgate-acceptance-config.json` when using
`scripts/start-bridge.mjs`.

### H1 — Cloudflare read token

If none exists, operator creates a least-privilege token scoped to the exact account/zone with
only read capabilities needed for Tunnel/config, DNS, Access apps/policies. Never Global API Key
or write permission. Enter only via hidden prompt.

### H2 — existing machine service token

Use existing hidden Client ID/Secret prompts only for the Phase 5-C remote matrix.

### H3 — QR only on exact LOGIN_REQUIRED

If and only if automation returns `LOGIN_REQUIRED`:

1. open `http://127.0.0.1:17282/login` locally;
2. start existing QR flow;
3. physically scan/approve;
4. rerun the exact stopped acceptance command.

### Any other manual check

Emit `MANUAL_REQUIRED` with exact Dashboard navigation, exact field, expected value, why the API
cannot prove it, and exact resume command. Do not write "manual evidence incomplete".

## Acceptance IDs

The design checks below map to executable checks in the implementation. The
executable ledger uses `P6A-T-01` through `P6A-T-11` for desired-state bounds,
GET-only transport, timeout/redirect/body/pagination, redaction, deterministic
selection, Tunnel/DNS/Access isolation, canonical plan and Phase 5 regressions;
`P6A-W-01/02` for permanent-Windows live acceptance and external evidence; and
`P6A-CI-01/02` for exact-commit gates and Ubuntu/Windows Actions. The historical
design IDs remain below for traceability.

- P6A-C1 token active + required read endpoint capabilities succeed.
- P6A-C2 exact account/zone selectors valid.
- P6A-T1 selected Tunnel unique and remotely managed.
- P6A-T2 ingress targets only `http://127.0.0.1:17282`; no 17281.
- P6A-D1 human/admin/machine DNS records unambiguous.
- P6A-A1 Access applications unambiguous.
- P6A-A2 Access AUDs match Bridge config.
- P6A-A3 policy roles isolated; no unexpected Bypass/widening.
- P6A-P1 canonical plan stable across unchanged reads.
- P6A-P2 fingerprint stable and secret-free.
- P6A-S1 no authorization/token values in output/evidence.
- P6A-S2 GET-only invariant; mutation impossible.
- P6A-W1 exact loopback listeners 17281/17282.
- P6A-R1 existing Phase 5-C remote-machine matrix passes unchanged.
- P6A-CI exact final commit passes Ubuntu and Windows CI.

## Closure

Do not close from local tests alone. Closure requires permanent-Windows live evidence,
exact-final-commit CI, and no unresolved `manual_required` or `unsafe_conflict`. Safe unambiguous
future create/update drift may remain for Phase 6-B but must not be applied now.
