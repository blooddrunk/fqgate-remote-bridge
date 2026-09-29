# Phase 6-B2 implementation handoff

Status: **OPEN — permanent-Windows live acceptance and exact-final-commit CI pending**.
This record is updated only after the corresponding evidence exists. The bounded
scope is `docs/tasks/phase-6-b2-bounded-tunnel-access-provisioning.md`.

## Implementation under review

The `codex/phase-6-b2` branch adds a fixed-endpoint Tunnel/Access write transport,
a separate transient account-level write-token capability check, a repo-external
exact policy profile with a SHA-256 fingerprint, and one-action apply on the
existing Phase 6-A plan fingerprint. The Phase 6-A discovery transport remains
GET-only. B1 DNS apply and its separate token are preserved. The Windows
acceptance harness uses only the permanent checkout and writes secret-free
evidence outside the repository.

## Local verification before live acceptance

On 2026-09-29 in the isolated Linux development worktree, frozen pnpm install,
TypeScript check, lint, 21 Vitest files with 270 tests, production build,
Prettier check and 15 Playwright E2E tests passed. The changed PowerShell
scripts parsed successfully with Windows PowerShell. These local results do
not substitute for the required permanent-Windows and real Cloudflare checks.

## Pending closure evidence

- Exact final runtime commit: pending.
- Permanent-Windows Phase 6-A preflight, live plan fingerprint and in-sync
  zero-write or naturally supported single-action result: pending. The
  CloudflareRead acceptance Vault entry returned `VAULT_EXPIRED` before this
  implementation was deployed; its renewal requires the operator's hidden
  input and actual UTC expiry, without sending the token to chat.
- Post-action Phase 6-A 14/14, Phase 5-C real remote 21/21, Phase 4.5 headed
  human/admin browser, local Phase 5-A/B/C and loopback listener checks: pending.
- Exact-final-commit Ubuntu and Windows CI run/job IDs: pending.
- Production mutation count and before/after plan fingerprints: pending.

Phase 6-B2 is not closed by this draft. Phase 6-C credential retirement and
broader reconciliation remain unauthorized.
