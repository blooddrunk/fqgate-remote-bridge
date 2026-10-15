# FQGate 2.0.5 QR/session compatibility — bounded next implementation

Status: **IMPLEMENTED_NOT_LIVE_QUALIFIED** (2026-10-15 continuation).
Exact installed bundled-client evidence supplements the initial OpenAPI census;
independent v2 adapter, server binding, Preflight and guarded Live harness implemented.
Real QR remains NOT_EXECUTED pending separate approval and matching runtime build.
Evidence/implementation: `docs/status/fqgate-2-0-5-qr-session-implementation-handoff.md`.
Owner workflow: single personal research implementation goal; no new Issues or
planning-only PR. Prior read-only delivery:
`docs/status/fqgate-2-0-5-readonly-implementation-handoff.md`.

## Decision and non-goals

The exact manually installed Windows FQGate 2.0.5 can already serve the existing
`market.instruments.lookup` locally and to `remote_machine` (6/6 local,
22/22 remote). The Bridge QR adapter still calls v1 begin/poll paths and the
global `compatibility.validated` gate denies QR on unqualified v2. The next
goal is an **operation-specific exact-artifact QR/session compatibility slice**,
only if its real v2 wire contract is independently observed. It does not
authorize unattended login or changing an active account session.

Preserve v1 behavior, exact 2.0.5 artifact/process/IPv4 listener checks, the
existing Bridge-owned opaque QR flow, local + remote_human + remote_admin QR
permissions, and all machine denials. No new route, broad v2 version range,
public source/instance selector, user credentials in logs, raw upstream proxy,
Cloudflare write, release trust bypass, general installer/rollback claim,
Phase 7-B2/7-C actuator, automatic restart, or new Windows service/task.
Remote machines remain unable to start/poll QR.

## Execution sequence — automation first

1. **Sync safely.** In the agent development checkout run `git status --short`,
   `git fetch origin --prune`, and inspect `origin/main` against the current
   branch. Fast-forward a clean checkout only; otherwise use a separate worktree.
   Never reset/clean/force checkout over operator changes. Record exact base SHA.
2. **Read-only contract census.** On the existing permanent Windows checkout,
   first verify the managed 2.0.5 file tree, state, native PID/path/creation,
   exclusive 127.0.0.1:17281 listener, version, health, current Bridge listener,
   source inventory and account readiness. Read locally exposed v2 OpenAPI
   (only localhost, bounded body/time) and identify exact QR/session operation
   path, method, request headers, flow/session identity type, response/error
   envelope, termination states, and transitive schema fingerprint. Do not
   infer endpoint names from v1, manually replay guessed writes, use a default
   source, or save account/QR/session payloads. If the v2 contract is absent or
   ambiguous, report `BLOCKED_UPSTREAM_QR_CONTRACT` and stop live operations.
3. **Bounded implementation, conditional on evidence.** Build a separately
   selected v2 QR adapter for **exact 2.0.5**, with a stable reviewed
   operation-specific protocol fingerprint and pre/post process, payload,
   version, source/worker/session-epoch identity where observable. Determine
   a unique eligible QR source server-side; a source need not already be logged
   in, so do not reuse the lookup's 'exactly one connected source' predicate.
   Zero/multiple ambiguous eligible sources must fail closed. Never accept
   a caller-supplied upstream source/instance/flow ID. If v2 uses a different
   flow handle type, adapt only the private registry/interface; expose the
   Bridge-owned opaque UUID. Reject drift/restart/replacement/expiry and
   malformed/oversized/invalid UTF-8 responses. Keep image, TTL, memory,
   response-size and timeout limits at least as strict as v1.
4. **Apply operation-scoped readiness.** Do not set global
   `validatedVersions` or `supportedRange` to 2.x merely to allow QR. Separate
   exact v2 QR readiness from v1 lifecycle qualification. Ensure
   `capabilities.qrLogin` does not advertise success until the exact operation
   gate is supported by evidence. Preserve session ownership and the existing
   local/human/admin authorization, Origin, Access JWT and CSRF defenses.
5. **Readiness diagnostics, not repair.** Produce a secret-free read-only
   preflight for cases seen after restart: 17282 Bridge absent, 17281 process
   record stale, immutable payload contaminated by WebView2 profile, invalid
   native identity, unavailable Access cert path and unclear source state.
   Distinguish `PASS`, `BLOCKED` and `NOT_EXECUTED`, with the exact safe
   rerun command. Do not restart Bridge/FQGate/cloudflared, write process.json,
   relocate profiles, reload daed or alter Cloudflare without separate approval.

## Deterministic and CI acceptance

- Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm build`, `pnpm format:check` and Linux
  `pnpm test:e2e`. Exact final-head GitHub CI must pass Ubuntu and Windows.
- Use fixtures for unique/absent/ambiguous candidate selection, disconnected
  account, alternate source or epoch, restart/PID drift, missing native path,
  additional non-loopback listener, WebView2 payload contamination, interrupted
  request, timeout, malformed/oversized body, bad UTF-8/enum, stale flow,
  replacement, concurrent flows and protocol fingerprint change.
- Assert **all v1 QR/login regressions**, 2.0.5 exact instrument lookup and
  6-case local / 22-case remote_machine matrix remain unchanged. Test that
  machine and unknown host contexts never reach a QR upstream call. Include
  Linux browser QR state, expiry and cancellation fixtures.
- Windows CI must execute behavior fixtures, not just a PowerShell parser.
  No real FQGate binaries, credentials, signed-release assertion, intentional
  outage, Cloudflare changes or live QR actions in CI.
- Verification receipt: exact Git SHA, UTC, platform, commands/exit codes,
  case IDs/counts, source and fixture hashes, per-gate PASS/BLOCKED/
  NOT_EXECUTED, actual failing layer, secret-safe evidence hashes and retry
  commands. Store under a protected repo-external directory such as
  `D:\code\research\fqgate-205-qr-evidence`; no QR image, raw JWT,
  account identifiers, WebView2 profile, config, tokens or credentials in Git.

## Permanent Windows validation — precise operator boundaries

The agent should provide a dedicated
`scripts/windows/fqgate205-qr-acceptance.ps1` with a **Preflight** mode that
does not begin QR or change session state, and a separate explicitly interactive
**Live** mode (e.g. `-Mode Live -AllowLiveQr`). These flags are implemented; `-AllowLiveQr` must never be supplied without
separate explicit approval.

From a clean, safely synchronized permanent checkout:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short
node .\scripts\windows\fqgate205-readonly-probe.mjs --config D:\code\research\fqgate-acceptance-config.json
node .\scripts\windows\phase5c-matrix.mjs --local
# Read-only; no QR begins:
powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json
```

The script must report the actual bound build SHA, checks and exit codes.
If listeners/identity/payload/source/JWK are not trustworthy, stop, mark the
specific gate BLOCKED, and emit safe diagnostic/resume instructions. Never
manufacture readiness by starting/restarting or changing the environment.

**Human approval required only for real session mutation.** Before any live
QR begin, print the exact selected candidate/source classification and warn
that starting a new flow may replace the current login. Ask the operator
whether to proceed; declining leaves `LIVE_QR=NOT_EXECUTED`. If approved,
the agent runs its new `-Mode Live -AllowLiveQr` harness, displays the live
QR to the operator only in the local protected UI, and the operator scans
it with their own phone and completes app confirmation/MFA if prompted.
The automation then polls the exact bound flow for at most the configured
TTL (default historical Bridge limit: 120 seconds), proves connected state
and verifies that the selected source and managed process are unchanged.
On cancel/timeout/expired/replaced source, return a precise nonzero or
blocked result and a safe resume command; never claim PASS or auto-bypass
authentication. A live remote-human/admin check can follow using **existing**
Vault-backed credentials and existing Access policy, but must not create
Cloudflare resources. If Bridge itself is absent after reboot, operator
authorization for any Bridge-only start is a **separate gate**, not implied
by this task.

## Exit gate and next boundary

If protocol evidence and deterministic implementation pass but the operator
declines real QR/MFA, report `IMPLEMENTED_NOT_LIVE_QUALIFIED`; do not invent
an end-to-end PASS. If the publisher contract or runtime identity cannot be
proved, retain the existing v1-only QR behavior and mark v2 QR BLOCKED.
Deliver one implementation branch/PR only if useful for the code review, an
exact-head CI receipt, redacted external Windows evidence, and concise
documentation updates. Full v2 issuer signing, anti-replay, directory/power-loss
rollback, unattended startup and Phase 7-B2/7-C remain separate future work.

## Live-qualification audit continuation — 2026-10-15

Before deployment, audit and test delayed UI callbacks, begin/poll serialization,
UUID allocation failure before upstream begin, and contradictory completion fields.
The intended hardening reserves the opaque UUID before authentication mutation,
invalidates prior flows when replacement starts, and prevents old asynchronous
results from reviving cancelled UI state. A connected result must not also claim
a pending status. No new upstream operation or cancellation action is authorized.
Bridge replacement and real QR each require separate explicit operator approval.

Actual continuation: 652 tests pass on Linux and native Windows; 16 Linux browser
tests pass. Native staged candidate/previous version and status smoke passed.
Existing old-runtime local 6/6 and Vault remote 22/22 passed; they are baseline
checks. Preflight remains 20 PASS / 1 BLOCKED (running build mismatch) /
1 NOT_EXECUTED (Live approval absent). No deployment or QR approval has occurred.
Rollback requires the existing protected pre-binding config because the old
bundle rejects `qrV2`; neither protected config file is overwritten. Exact
head/CI/artifact bindings and safe resume actions are retained in the handoff
and repo-external `live-qualification` receipts.
