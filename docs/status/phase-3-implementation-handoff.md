# Phase 3 Completion and Handoff

Date: 2026-09-17

Status: **CLOSED / implementation and target Windows x64 acceptance complete**.

## Delivered

- A fixed GitHub release-source update center at `/updates`.
- Explicit status, check, preview, and candidate-bound confirmation operations.
- Dashboard and CLI reuse `FqgateLifecycleManager.installPlan()` and its existing
  download, size, SHA-256, candidate-version, compatibility, health, known-good,
  and rollback transaction.
- In-process update mutation protection plus the existing filesystem lock.
- A fixed-target `FqgateOpenApiService` for
  `http://127.0.0.1:17281/openapi.json` with bounded fetch, validation,
  normalized errors, short TTL cache, invalidation, canonical SHA-256
  fingerprint, operation catalog, diff, and required-contract checks.
- Candidate activation now runs health, Runtime OpenAPI validation, required
  Bridge path/method checks, and the existing semantic health probe before
  success; failure enters lifecycle rollback.
- Local `/api-reference` with separate Upstream FQGate Reference, Bridge API,
  and Compatibility / Changes views. No raw upstream execution control exists.
- Explicit registry entries for all new local operations. Discovery does not
  write to the registry, and unknown upstream paths remain denied.
- Deterministic unit, lifecycle, component, and browser E2E coverage.
- Phase 3 Windows acceptance runbook and an acceptance script mode that performs
  safe, non-mutating live checks.

## Quality evidence

The following commands were run in the implementation workspace and passed:

```text
pnpm typecheck
pnpm lint
pnpm test             # 13 files, 95 tests
pnpm build
pnpm format:check
pnpm test:e2e         # 5 passed
```

## Windows evidence and remaining scope

The target Windows x64 host completed the safe live acceptance. Evidence is
recorded in `docs/operations/windows-phase-3-acceptance.md`: exact loopback
listeners, GitHub no-op update check, live OpenAPI 3.1.0 catalog with 89
operations and 3/3 required contracts, raw/unregistered route denial, and
post-test cleanup. No mutating update was available or performed; fixture-backed
tests cover invalid candidates and rollback without corrupting the live install.

There are no remaining Phase 3 closure blockers. Cloudflare, remote exposure,
and other Phase 4+ work remain explicitly out of scope.

## Handoff files

- `src/fqgate/openapi/service.ts`
- `src/fqgate/openapi/catalog.ts`
- `src/fqgate/update/service.ts`
- `src/fqgate/install/lifecycle.ts`
- `src/bridge/policy/registry.ts`
- `src/components/dashboard/update-center.tsx`
- `src/components/dashboard/api-reference.tsx`
- `src/routes/updates.tsx`
- `src/routes/api-reference.tsx`
- `scripts/windows/acceptance.ps1`
- `docs/operations/windows-phase-3-acceptance.md`
