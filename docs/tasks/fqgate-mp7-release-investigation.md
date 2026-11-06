# MP-7 — release tracking and strict compatibility investigation

Authorized by [Issue #30](https://github.com/blooddrunk/fqgate-remote-bridge/issues/30)
and the 2026-11-06 operator goal after MP-6 PR #29 merged as
`3e06422260a81255de1e5ff8b623a00f52cf5454`.

Deliver a standalone, repeatable GET-only release observer, immutable-source
receipts, offline/negative fixtures, versioned 2.0.5/2.0.6/2.0.7 contract review,
read-only review of preserved Windows work, and an MP-8 admission proposal.
Stop at a reviewable PR. No merge, release, deployment, runtime process/service
start/stop, private-file change, login/QR/phone/MFA, Saved Login/L2 action,
Cloudflare mutation, production adapter integration or permission/range change.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED; multi-account production NO-GO.**

## Acceptance contract

- Synchronize status/fetch/main/PRs first. Preserve all operator branches and
  existing outputs/config/evidence. Use a separate clean codex worktree.
- Independently query both official latest stable GitHub Releases and the legacy
  root manifest. Pin the v2 chain to a single immutable repository SHA; validate
  envelope/hash links, channel/sequence/version/package consistency and both
  official Windows asset identities. Recheck latest pointers, fail on drift.
- Only fixed official URLs, GET, no credentials, redirects denied, 64 KiB/request,
  15s/request, 120s overall and at most 12 requests (normally 10). Inject transport
  and clock for deterministic tests. Do not add scheduling/polling or CI network.
- Optional caller-supplied strict baseline detects observed regression and
  same-sequence equivocation. It is not an authenticated or persistent replay
  ledger. Missing baseline requires review; never infer trust from signature fields.
- Separate release observation success (exit 0) from compatibility UNKNOWN,
  installAllowed/runtimeQualified/signatureVerified false and qualification BLOCKED.
  Failure is redacted FAIL_CLOSED/exit 1, never a raw upstream body/exception.
- Compare exact current main gates and preserved 2.0.6 work without replaying its
  historical permissions. Record absence of evidence honestly. No guessed 2.0.7 pins.
- Prefer verified package structure/hash and static client review without executing
  the executable, updater, DLL, JS or embedded commands. Package evidence does not
  substitute for runtime OpenAPI or native identity.
- Frozen install, typecheck, lint, full unit tests, isolated CLI/SSR build,
  format, import/permission audit, Linux E2E, native Windows fixture suites and
  exact final-head Ubuntu/Windows CI where available. Test servers are isolated
  Linux/hosted-CI verification, not permanent-host deployment or acceptance.
- Keep exact UTC/argv/cwd/source SHA/exits/durations/log/tool hashes and protected
  inventories outside Git; publish only sanitized facts. Bind final PR head
  separately because a committed file cannot contain its own SHA.

Artifacts: [matrix/design](../plans/fqgate-mp7-contract-matrix.md),
[repeat/limits](../operations/fqgate-mp7-observation.md),
[handoff](../status/fqgate-mp7-handoff.md),
[MP-8 goal](../prompts/fqgate-mp8-codex-goal.md).
