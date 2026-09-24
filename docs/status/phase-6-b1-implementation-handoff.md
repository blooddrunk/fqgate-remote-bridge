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

| Check                                                             | Current result                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P6B1-T1..T6 deterministic transport/apply/canary tests            | PASS — 39 focused tests on `48723883c6cc7586a590fb4623502d5893b6f789`                                                                          |
| P6B1-W1 frozen Windows install and all seven repository gates     | Gates Q1..Q7 PASS on the permanent Windows host; the combined P6A/P5C preflight remains incomplete because the live lookup below failed        |
| P6B1-W2 live safe Phase 6-A plan                                  | Phase 6-A read-only discover/plan/drift PASS; 0 conflicts, 0 blocked, 0 drift. Listener checks PASS on `127.0.0.1:17281` and `127.0.0.1:17282` |
| P6B1-W3 reserved TXT canary create/read/delete/absence            | NOT RUN — the required preflight stopped before the hidden DNS-write token prompt                                                              |
| P6B1-W4 in-sync production apply refusal with no write credential | NOT RUN — the required preflight stopped before the apply check                                                                                |
| P6B1-W5 post-canary Phase 6-A 14/14 and Phase 5-C 21/21           | NOT RUN — the canary was not attempted                                                                                                         |
| P6B1-CI exact implementation commit, Ubuntu + Windows             | PASS on `48723883c6cc7586a590fb4623502d5893b6f789`; workflow `35972729749`, Ubuntu job `107545967718`, Windows job `107545968012`              |

### Incomplete permanent-Windows preflight — 2026-09-24

The final-commit run completed the seven Phase 6-A quality gates, loopback
listener checks, and read-only Cloudflare discovery/plan. The plan reported
zero drift, conflicts, and blocked checks. The Vault-backed Phase 5-C remote
matrix passed every check except `P5C-R3`: the approved instrument lookup
returned HTTP 503 `UPSTREAM_UNAVAILABLE`. The local FQGate 1.0.2 lifecycle
probe reported network ready but not connected. The response was not the exact
normalized `LOGIN_REQUIRED` code, so the physical QR boundary was not entered.

The Phase 6-B1 acceptance stopped before requesting a DNS-write token. No
Cloudflare DNS mutation or canary was attempted. The external acceptance files
remain the source for the bounded records:

- `D:\code\research\fqgate-phase6b1-acceptance-evidence.json`
- `D:\code\research\fqgate-phase6a-discovery-evidence.json`
- `D:\code\research\fqgate-phase5c-remote-evidence.json`

Phase 6-B1 remains OPEN. Resume the documented acceptance only after the
approved FQGate lookup is available and returns its required successful
response; do not substitute another FQGate endpoint or treat
`UPSTREAM_UNAVAILABLE` as authorization for physical QR login.

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
