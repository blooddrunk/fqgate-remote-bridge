# Phase 6-B1 implementation handoff

Status: **OPEN — implementation is in progress; live and exact-final-commit
acceptance have not yet closed the task.**

Task contract: `docs/tasks/phase-6-b1-stale-plan-guarded-dns-apply.md`.

## Implemented surface

- `cloudflare apply` accepts one expected Phase 6-A fingerprint and one
  `dns.{human|admin|machine}.record` check ID. It rejects unsafe plans,
  stale state, in-sync/non-create actions and unsupported checks before
  constructing a writer.
- Immediately before POST, apply performs a second complete discovery and
  requires the same expected fingerprint. The payload is derived from the
  selected desired zone/hostname and selected Tunnel ID: one proxied CNAME.
- The independent Phase 6-A transport remains GET-only. A separate typed write
  transport can create that exact record and can delete only a record handle
  returned by the same transport instance. Failed postcondition or Phase 5-C
  regression triggers deletion and proof that the prior fingerprint is restored.
- Acceptance-only TXT creation is isolated behind a different writer and the
  fixed reserved `_fqgate-remote-bridge-phase6b-canary.<desired-zone>` name.
  Production apply does not accept TXT or arbitrary deletion.
- `scripts/windows/phase6b1-acceptance.ps1` uses the existing permanent Windows
  checkout, Vault-backed read token and Phase 5-C credentials, a hidden
  time-bounded DNS-write token prompt, external evidence, pre/post full gates,
  listener checks and remote regression.
- The production CLI refuses apply on non-Windows before Cloudflare discovery
  or any write, since the mandatory Phase 5-C regression must run in the
  accepted Windows environment.

## Evidence ledger

| Check                                                             | Current result                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P6B1-T1..T6 deterministic transport/apply/canary tests            | PASS — 39 focused tests on `48723883c6cc7586a590fb4623502d5893b6f789`; parser correction coverage: 33/33 focused tests  |
| P6B1-W1 frozen Windows install and all seven repository gates     | PASS on the permanent host during the direct Phase 6-A harness run; Q1..Q7 all pass                                     |
| P6B1-W2 live safe Phase 6-A plan                                  | PASS — Phase 6-A 14/14, read-only discover/plan/drift with 0 conflicts, 0 blocked, 0 drift; loopback listeners verified |
| Phase 5-C remote matrix                                           | PASS — 21/21; `P5C-R3` returned HTTP 200 with one bounded item                                                          |
| P6B1-W3 reserved TXT canary create/read/delete/absence            | NOT RUN — B1 stopped at an evidence-counting defect before the hidden DNS-write token prompt                            |
| P6B1-W4 in-sync production apply refusal with no write credential | NOT RUN — B1 stopped before the apply check                                                                             |
| P6B1-W5 post-canary Phase 6-A 14/14 and Phase 5-C 21/21           | NOT RUN — the canary was not attempted                                                                                  |
| P6B1-CI exact current code commit, Ubuntu + Windows               | The preceding implementation commit passed both jobs; the evidence-counting correction still needs exact-commit CI      |

### Incomplete permanent-Windows preflight — 2026-09-24

The direct Vault-backed Phase 6-A harness passed 14/14, including all seven
repository gates, read-only Cloudflare discover/plan, loopback listeners, and
the Phase 5-C remote matrix at 21/21. FQGate market connectivity recovered;
the approved lookup returned HTTP 200 with one bounded item.

The subsequent B1 wrapper stopped with `P5C_NOT_21_OF_21`. Its evidence parser
counted the matrix's `P5C-SUMMARY` line as an extra check: the evidence contains
21 remote checks plus one summary record, with all 21 checks passing. The
acceptance parser now separates and validates that summary explicitly. Static
Windows-script and B1 tests pass, and the PowerShell parser accepts the updated
script. The full B1 acceptance must be rerun from the next clean commit.

The B1 wrapper stopped before requesting a DNS-write token. No Cloudflare DNS
mutation or canary was attempted. The external acceptance files contain the
bounded records:

- `D:\code\research\fqgate-phase6b1-acceptance-evidence.json`
- `D:\code\research\fqgate-phase6a-discovery-evidence.json`
- `D:\code\research\fqgate-phase5c-remote-evidence.json`

Phase 6-B1 remains OPEN until the corrected wrapper completes the in-sync
zero-write check, hidden-token canary, and post-canary regressions.

Permanent-Windows evidence path:
`D:\code\research\fqgate-phase6b1-acceptance-evidence.json`.
The script and operator procedure are documented in
`docs/operations/windows-phase-6-b1-acceptance.md`.

No production drift is to be manufactured. If the safe live plan has no
supported missing CNAME, record `NO_SUPPORTED_PRODUCTION_DRIFT`; the script
proves an in-sync apply fails closed without providing a write token, then uses
the reserved canary for real write evidence. No B2 or C work is authorized.

The exact implementation commit, Windows evidence counts, Actions run ID,
Ubuntu job ID and Windows job ID will be added here only after those checks
actually pass. Phase 6-B1 remains OPEN until all listed rows pass.
