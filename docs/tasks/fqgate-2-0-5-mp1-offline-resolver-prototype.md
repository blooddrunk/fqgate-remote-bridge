# FQGate 2.0.5 MP-1 — Offline Shared-Profile Resolver Prototype

Status: PROPOSED / READY FOR IMPLEMENTATION; NOT AUTHORIZED FOR LIVE INTEGRATION.

Source contract: [MP-0 review](../plans/fqgate205-shared-profile-contract-review.md).
Historic QR acceptance: [handoff](../status/fqgate-2-0-5-qr-session-implementation-handoff.md).

## Goal

Prove that one Bridge-owned private profile Resolver can bind simulated QR begin/poll, session status, and read-only market lookup to the same explicitly registered profile, with no cross-profile effects or disclosures. Implement the **28 executable negative/isolation cases MP1-01..MP1-28** in the MP-0 review. MP-1 is wholly offline: fake identity, clock, inventory, adapter, network, and QR only.

## Required implementation

1. Build an isolated module under `src/bridge/profiles/` (or justified equivalent), with zero imports from production runtime composition, API routes, application configuration, browser, credential storage, or live adapters.
2. Explicitly register opaque `p_` + 32 lowercase hexadecimal aliases; at most 16 profiles. Reject duplicates, mismatched old QR pin/default, arbitrary host/port/native-ID selectors, and unknown input fields before any native read. Do not infer a default from source liveness.
3. Inject verified-authority test doubles, immutable registration snapshot, process/source/worker/account observations, fake monotonic clock, deterministic UUIDs, and fake QR/status/lookup ports. Authorized/unauthorized unknown aliases return indistinguishable failures without catalog disclosure or I/O.
4. Resolver issues runtime-owned opaque leases tied to alias, registration/policy revision, boot nonce, generation, operation and caller scope, exact process/source/worker identity and synthetic account evidence. No public serialization or caller-made lease.
5. Validate before side effects and again before result publication under an atomic generation/policy fence. After a QR POST, a stale lease can suppress publication but **cannot undo upstream authentication**. Never retry, silently rebind, fall back, auto-login, or claim rollback.
6. Bound the QR registry by owner/alias/generation/audience/UUID/TTL and tombstones. Deny cross-owner polling, including terminal UUIDs. Preserve global mutex: simultaneous A/B QR starts cannot generate a second POST. Cancellation discards visible results, not native account state.
7. Separate A/B simulated concurrent lookup futures and results; no result caching or cross-profile deduplication. Keep deployment-level lifecycle and OpenAPI schema outside profile permissions.
8. Preserve legacy v1 and exact-2.0.5 unconfigured single-profile behavior and machine/human/admin operation allowlists. No new network route, profile picker, configuration migration, real profile registration, service/process actuation, Cloudflare mutation, financial write or credential management.

## Mandatory tests and receipts

Create `tests/profile-resolver.test.ts` with named, independently observable MP1-01 through MP1-28 cases. For **each** assert normalized outcome, fake I/O counters, denied unintended effects, no foreign data/error disclosure, bounded allocations, and late-result fencing. Use controlled promises and fake time instead of sleeps. Include account switches with unchanged PID, PID reuse with changed creation, source reuse/removal, owner/audience mismatches, A/B same-code reversed completion, cancellation, conflict and duplicate mapping. Explicitly demonstrate that A -> B -> A between samples **cannot** be ruled out without native session epoch; simulated identity tokens do not establish live guarantees.

Run from repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec vitest run tests/profile-resolver.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Also run applicable native Windows *synthetic* fixture checks. Require exact-head Ubuntu/Windows GitHub Actions success. Note Windows browser E2E is skipped in existing workflow; Linux E2E does not constitute live native A/B validation. Record commit SHA, OS, commands, exits, named case results, fake call counts, CI URLs, and redacted diagnostics. Run automated source/import scans to prove no production wiring and no external I/O.

## Human / environment boundary

**MP-1 requires no manual operation.** The MP-0 Windows read-only preflight yielded 9 PASS / 12 BLOCKED / 1 NOT_EXECUTED because both listeners were absent. Do not start/restart/redeploy Bridge, FQGate or cloudflared to clear that observation; do not overwrite a divergent permanent Windows runtime checkout. No second-account login, native QR POST, saved-login mutation, source CRUD, L2 displacement, or profile/WebView modifications.

A later independently authorized integration must first provide a real alias-aware GET-only preflight and one-attempt harness, prove exact running build/source mappings/loopback identity, obtain approval for each account-affecting step, require operator readiness and one explicit QR begin, allow phone confirmation only by operator, and automate bounded polling and A/B negative tests. On drift or failure stop without logout, restart, restoration, retry or changing source. Publisher signature/replay, complete rollback, native account identity/epoch, dual-account/L1/L2 isolation remain NOT_EXECUTED or BLOCKED as individually appropriate.

## Definition of done

Only label **MP-1_OFFLINE_PROTOTYPE_COMPLETE** after all 28 named cases, baseline tests, no-live-wiring audit, and exact-head Ubuntu/Windows CI pass. Always separately state **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**. Otherwise give exact failing case, reproduction command, exit, missing prerequisite and safe stop. One focused implementation PR; no new Issues or planning-only PRs.
