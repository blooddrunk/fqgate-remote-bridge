# FQGate v2 safety engineering continuation

The user's 2026-10-13 continuation requests safe v2 engineering and a
prerequisite-gated upgrade/start. The user explicitly chose v2 engineering before
activation and does not have a publisher signing specification. Issuer research
remains the agent's work; there is no operator key-guessing/manual trust bypass.
Contract/design: `docs/tasks/fqgate-v2-safe-upgrade-engineering.md` and
`docs/plans/fqgate-v2-directory-transaction.md`.

## Delivered core and limits

`src/fqgate/v2/directory-transaction.ts` is an unconnected kernel. No CLI,
Bridge route, actual release verifier, extraction adapter or native v2 process
adapter consumes it. Default candidate and baseline authorities refuse all
activation/recovery before mutating or starting anything. Fake ports and inert
text files exercise complete application-directory renames, retained verified
baseline, exclusive writer/recovery guards, flushed atomic journal/security
writes, baseline recovery, unknown/foreign process denial, corruption and replay.

75 tests pass on Linux and native Windows using Git-external inert fixtures.
They cover every fixed runtime gate failure, five crash checkpoints, refusal to
clear live/unproven owner locks, changed baseline/candidate, failed baseline
health, strict journal/ledger fields and unreachable phases, conservative
monotonic counters, equivocation/version/policy rejection, missing bootstrap,
hardlinks, junctions and Windows reserved names. A failed recovery preserves its
recovery guard: native owner-safe forensic guard retirement is not implemented.
Windows power-loss durability, actual v2 profile/session paths and native process
qualification remain unqualified. A fixture authority is not publisher proof.

The conservative replay kernel never resets high-water marks on runtime rollback.
It cannot initialize trusted state from observation: a preexisting authenticated
bootstrap ledger/provider is required. Its tests implement Bridge invariants,
not invented publisher signature/expiry/rotation rules. Authenticated end-to-end
anti-replay therefore remains BLOCKED despite kernel tests passing.

Local full checks passed frozen install, typecheck, lint, 27 suites / 463 tests,
build, format and 15 Linux Playwright. Exact-final-head Ubuntu/Windows CI is
recorded in the external R2 receipt and PR after completion. v1 lifecycle,
compatibility range/validatedVersions, operation registry and Supervisor remain
unchanged. This core does not enable Phase 7-B2/7-C or automatic upgrades.

## Actual production startup and diagnostics

One-time startup was explicitly authorized by the user's process-start request.
The Git-external `restore-v1-baseline.ps1` first verified the current official
1.0.5 file (23707648 bytes / SHA256
2b9613dbf2d0f10b1672684f2e24ac8917d2d8d3fa9bd7fbbae04d57dd73d83c), no
transaction/lock and no expected listener, then used the existing v1 `fqgate start`
and existing `scripts/start-bridge.mjs` with the actual production config.

Startup PASS at 2026-10-13T03:59:14Z: FQGate ready / managed PID 30084,
Bridge PID 57956; exactly 127.0.0.1:17281 and 127.0.0.1:17282. Final R1 observer
rerun proved managed FQGate path MATCH, config/checkout unchanged, transaction
clear, ZIP cleanup and fixed-file invariance. The permanent checkout remains at
54d9e7a and was not switched/replaced; startup legitimately updates its external
process record. The EXE was not upgraded/modified, and previous remains absent.

The existing local Phase 5-C matrix passed 6/6: machine OpenAPI, fixed lookup,
invalid/oversized input, raw route and unknown Host. Vault-based real service-token
matrix completed 3/22: no-token challenge and human/admin isolation passed;
19 authorized machine operations/denials encountered 502/timeout. No credentials,
raw JWT, QR, session, API response, command line or secret environment was saved.

Further read-only diagnostics found:

- Existing cloudflared service Running / PID 6908, protected token-file invocation,
  no inline token; metrics endpoint 20241 available, initially two then four HA
  connections, zero reported request errors.
- Existing GET-only Cloudflare plan passed 46/46, zero drift/conflicts/writes.
  A fixed extra GET to the configured Tunnel and its connections found healthy,
  remotely configured, one windows_amd64 client/two connections at that sample.
  No Cloudflare resources or permissions were changed.
- Windows Node GET of the fixed configured admin/machine Access cert endpoint
  timed out after 10 seconds each. Certificate transport remains BLOCKED; it is
  not permission to disable origin Access verification or Bridge JWT validation.
- Publisher org contains three public repositories. Release/Agent heads are still
  the pinned R1 snapshots. Official website snapshot
  c23706cedf9a70584abfafa79f8486900af9e2c5 exposes a static OpenAPI version 0.1.2
  with the required path names, not evidence of actual 2.0.5 runtime/signatures.
  No independently authenticated executable-release trust contract was found.

Secret-free command/exit and individual receipts live under
`D:\code\research\fqgate-v2-r2-evidence`. R1's earlier availability failures
remain historical evidence, not current startup results. Real v2 upgrade/run,
real Windows directory rollback, issuer trust and real remote acceptance remain
BLOCKED / NOT_EXECUTED. PR #15 and Issue #16 remain open; code CI does not waive
those gates.

## Additional authenticated-source/transport diagnostics

The bounded official 2.0.5 ZIP was audited again, then only exact root FQGate.exe
and fqgate-updater.exe were materialized in an OS quarantine for Windows
Get-AuthenticodeSignature. Both returned **NotSigned**, no signer or timestamp
certificate. The files were never executed; the quarantine was removed. This
establishes no alternate Windows publisher trust, and cannot authenticate the
signed-envelope metadata. Envelope signatureVerified/installAllowed/runtimeQualified
remain false. `authenticode-inspection.json` and `authenticode-research-receipt.json`
bind the public archive hash and non-executing/cleanup results.

The fixed Access certificate host resolves to two IPv4 addresses. Direct TLS
handshakes to each timed out at about seven seconds; bounded fixed-cert requests
also failed. Fixed HTTPS Cloudflare DNS answers agree with system DNS. Existing
user proxy metadata has a configured loopback proxy but ProxyEnable is false;
a child-only proxy diagnostic failed without changing OS/service settings.
These facts locate an unavailable certificate transport prerequisite, not a
proven exclusive explanation of every 502. Do not disable verification, alter
Access policy or hard-code different issuer/JWK URLs. Network recovery and an
exact authenticated remote re-run are still required.

Publisher signing/update protocol request content is prepared outside Git. The
agent asked for the explicit permission required to send an external public Issue;
no permission is inferred from silence and no public request is sent without it.
The operator is not asked to provide cryptographic material or override trust.
