# Post-Phase-5 FQGate release compatibility and 1.0.2 permanent-environment refresh

Date: 2026-09-21

Status: **CLOSED — implementation, permanent Windows, remote and CI acceptance passed**

Implementation note (2026-09-21): the quarantined `fqgate qualify` lifecycle boundary,
artifact-bound operation evidence, operation-scoped lookup gate, deterministic rollback
coverage, and bounded permanent-Windows harness are implemented. The required external
Windows evidence, real service-token matrix, and final-commit Ubuntu/Windows CI run IDs are
now recorded in the implementation handoff and Windows qualification procedure.

## Why this task exists

Phase 5 is closed. The upstream FQGate stable channel has already moved from 1.0.1 to 1.0.2. The current Bridge update/lifecycle model correctly protects installation with a fixed official source, bounded downloads, exact size/SHA-256 validation, stale-plan rejection, health/OpenAPI checks and rollback. Those controls remain mandatory.

At task start, the current market lookup compatibility gate was intentionally stricter: it
required both an explicitly validated runtime and the exact 1.0.1 version, plus an approved
operation-scoped OpenAPI fingerprint. That was appropriate for the first live Phase 5 slice,
but created avoidable maintenance churn if upstream published frequent patch releases whose
relevant contract was unchanged. The closed implementation now uses the operation-scoped
fingerprint and bounded semantic-probe evidence described in the handoff.

This task must refresh the permanent Windows environment to FQGate 1.0.2 and replace version-number coupling with evidence-based per-operation compatibility without weakening fail-closed behavior.

## Upstream 1.0.2 evidence

Official stable manifest:

- version: `1.0.2`
- published: `2026-09-20T18:26:46Z`
- Windows x86_64 package: `FQGate-1.0.2-windows-x64-UNSIGNED.exe`
- exact size: `23065088` bytes
- exact SHA-256: `024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`

The release notes mention fixes/additions outside the currently exposed lookup surface: historical call-auction date handling, large-order-flow attribution, and structured order-queue fields. These notes do **not** prove lookup compatibility; live runtime evidence is still required.

## Non-negotiable boundaries

Do not relax any of these:

- FQGate stays on IPv4 loopback `127.0.0.1:17281`.
- Bridge stays on IPv4 loopback `127.0.0.1:17282`.
- cloudflared may target the Bridge only, never FQGate directly.
- Only the fixed official stable manifest and fixed official release asset location are trusted.
- Exact package size and SHA-256 verification remain mandatory.
- No arbitrary URL or mirror fallback is introduced.
- Update check/plan/apply remains explicit; no page-load or background auto-install in this task.
- Stale-plan, concurrency, health, activation and rollback protections remain mandatory.
- Runtime OpenAPI is evidence, never authorization.
- No raw FQGate route, wildcard proxy, new market operation, trading/account mutation, Cloudflare provisioning, supervisor, notification, MCP/WebSocket or packaging work is added.
- Phase 5 request-context and operation permissions remain exactly unchanged.

## Required work

### A. Synchronize the permanent environment

Use the existing permanent Windows environment only:

- repo: `D:\code\research\fqgate-remote-bridge`
- external config: `D:\code\research\fqgate-acceptance-config.json`
- existing external Tunnel/Access evidence files

Do not create a temporary acceptance checkout as a substitute.

Before changing FQGate:

1. prove the repository working tree is clean;
2. fast-forward it to the current main;
3. record Bridge commit, Node/pnpm versions, active FQGate version, listener ownership, runtime OpenAPI operation count/fingerprint and current lookup semantic result;
4. preserve the current known-good 1.0.1 executable/rollback artifact until all 1.0.2 acceptance is complete.

Then retrieve 1.0.2 only through the existing trusted release mechanism and verify the exact stable-manifest version, package name, size and SHA-256 above.

### B. Automate the 1.0.2 candidate qualification and upgrade

Prefer a fully automated transaction.

The implementation must not require the operator to manually inspect JSON/OpenAPI or manually copy fingerprints. Add or extend a bounded acceptance/qualification command that:

1. stages the official 1.0.2 artifact;
2. records the candidate identity without secrets;
3. activates it through the existing transaction/rollback machinery or an equally bounded temporary-candidate path;
4. verifies the process owns only the intended loopback listener;
5. waits for bounded health readiness;
6. fetches and validates runtime `/openapi.json`;
7. checks all Bridge-required base contracts;
8. calculates the lookup operation + transitive-schema fingerprint;
9. executes the existing safe exact-code semantic probe and validates the normalized response;
10. re-runs local Phase 5-B/5-C regression;
11. if any required check fails, restores 1.0.1 automatically and reports the exact failing check ID;
12. if all required checks pass, leaves 1.0.2 active and records bounded evidence.

If the existing lifecycle architecture cannot run a candidate before its global version is marked validated, refactor the qualification boundary rather than inserting `1.0.2` into a permanent allowlist before evidence exists. A candidate may be allowed to enter a **quarantined qualification state** where no remote-machine market call is considered compatible until its operation contract and semantic probes pass.

### C. Remove exact-version coupling from the lookup operation

The current `FqgateInstrumentLookup` rejects every version other than exactly `1.0.1`. Replace this with an operation-scoped compatibility decision.

Required model:

- global lifecycle policy answers whether the runtime version is in a supported base range and can be managed;
- each exposed upstream-backed Bridge operation independently answers whether its own contract is certified;
- for lookup, certification requires:
  - supported base runtime;
  - exact approved operation-scoped OpenAPI fingerprint, or another deterministic structural-equivalence representation with equal or stronger guarantees;
  - successful bounded semantic probe for the running candidate;
  - normal response decoder constraints.

Do not let global `validatedVersions` become the sole proof for a market operation.

The preferred result is that a future patch release (for example 1.0.3) can be automatically qualified without a code edit **when** the lookup contract fingerprint is unchanged and the semantic probe passes. A changed lookup contract must still fail closed until deliberately reviewed.

### D. Define compatibility evidence as data, not scattered hard-coded version checks

Introduce a small, deterministic compatibility-evidence representation for exposed upstream operations. It may be code-owned or a checked-in data file, but it must:

- identify the Bridge operation ID;
- identify approved contract fingerprint(s);
- state which semantic probe is required;
- not contain credentials, raw market payloads, raw OpenAPI, filesystem secrets or Access metadata;
- be deterministic and testable;
- support adding an approved changed fingerprint through a reviewed change when upstream legitimately evolves.

Do not build a generic automatic schema-drift acceptance engine in this task. Structural equality + semantic probe is enough for unchanged contracts.

### E. Preserve strict installation security

Do **not** weaken the following merely because FQGate may release frequently:

- official-source host/path pinning;
- stable manifest schema validation;
- exact package size;
- exact SHA-256;
- HTTPS-only remote fetch;
- bounded timeout/size/retries;
- explicit update plan;
- one-time remote-admin apply confirmation;
- health checks;
- rollback;
- loopback-only topology.

Frequency is a reason to automate compatibility re-certification, not a reason to trust unsigned/unverified bytes or arbitrary sources.

### F. Regression and acceptance matrix

At minimum automate:

1. deterministic unit tests for unchanged fingerprint across 1.0.1/1.0.2 runtime identities;
2. changed fingerprint -> lookup fails closed;
3. semantic probe failure -> lookup fails closed even when fingerprint matches;
4. unsupported major version -> fail closed;
5. package size/hash mismatch -> update fails before activation;
6. failed candidate health/OpenAPI/base contract -> automatic rollback;
7. Phase 5 remote_machine allowlist remains exactly `market.instruments.lookup` + `openapi.machine`;
8. human/admin isolation remains unchanged;
9. raw/page/static/unregistered routes remain denied;
10. machine OpenAPI stays deterministic and bounded;
11. local and remote lookup works after 1.0.2 qualification;
12. listeners remain exactly one IPv4 loopback owner on 17281 and 17282;
13. Tunnel ingress still points only to 17282.

Run all normal gates:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Also re-run the existing Windows smoke/Phase 5 acceptance commands against 1.0.2.

### G. Human intervention boundaries

Automation is the default. Human action is permitted only when it is truly impossible/sensitive to automate.

Expected possible boundaries:

1. **Service-token secret entry** for real remote-machine acceptance.
   - Prompt with `Read-Host -AsSecureString`.
   - Do not put Client ID/Secret in command arguments, files, chat, screenshots or logs.
   - After entry, the remaining matrix must continue automatically.
2. **FQGate QR login**, only if the machine-readable probe returns the exact `LOGIN_REQUIRED` condition.
   - Open local Bridge login page on the permanent Windows host.
   - Complete the physical scan/approval.
   - Re-run the exact failed automated command.
   - No manual OpenAPI inspection or judgment is allowed.

If neither condition occurs, the entire qualification, update and verification must complete without human intervention.

## Acceptance for 1.0.2

Do not mark this task complete unless all of the following are machine-evidenced:

- active FQGate reports 1.0.2;
- installed artifact identity matches official stable manifest;
- listener topology is unchanged;
- health is ready;
- runtime OpenAPI is valid and bounded;
- all existing Bridge-required contracts remain present;
- lookup compatibility is certified by operation fingerprint + semantic probe rather than literal `version === "1.0.1"`;
- local lookup succeeds;
- machine OpenAPI still contains only the two Phase 5 machine operations;
- real service-token remote document + lookup succeed;
- forbidden remote-machine operations remain denied;
- Ubuntu and Windows CI are green on the final commit;
- rollback to the previously known-good executable was either automatically exercised by a deterministic failure-path test or otherwise proven by the existing transaction tests;
- bounded evidence is written outside Git under `D:\code\research`, with no secrets/raw market payloads.

## Scope after this task

This is a maintenance/compatibility track between closed Phase 5 and Phase 6. It does not itself authorize Phase 6.

After closure, the project can choose separately between:

- Phase 6 Cloudflare provisioning/drift management;
- additional reviewed read-only market operations;
- supervisor/recovery work.

No such follow-on work should be mixed into this task.

## Closure record

The task closed on 2026-09-21 after the official 1.0.2 artifact was qualified and left active
on the permanent Windows host. The artifact is `23065088` bytes with SHA-256
`024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`. The local Phase 5-B and
Phase 5-C regressions passed with the Bridge started using the repo-external acceptance config;
the real remote-machine matrix recorded `matrixExitCode=0`, `failed=0`, `pending=0`, and 21/21
remote checks passed. The external evidence file is
`D:\code\research\fqgate-phase5c-remote-evidence.json`.

The initial wrapper attempt reported `P5Q-R1` because an already-running Bridge had been
started without `FQGATE_REMOTE_BRIDGE_CONFIG`; this was corrected by restarting only that
Bridge with the acceptance config, then rerunning the bounded local matrices. No candidate,
contract, or remote acceptance check failed after the environment correction. The final
implementation CI for `2797bea6775876c8f2707bb68ebb8eaa724e8b9b` passed on Ubuntu and Windows
in run `35565062952`. No Phase 6 or additional market operation was added.
