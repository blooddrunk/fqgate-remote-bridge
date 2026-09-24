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

| Check                                                             | Current result                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P6B1-T1..T6 deterministic transport/apply/canary tests            | Pending final full gate                                                       |
| P6B1-W1 frozen Windows install and all seven repository gates     | Pending permanent-Windows run                                                 |
| P6B1-W2 live safe Phase 6-A plan                                  | Pending permanent-Windows run                                                 |
| P6B1-W3 reserved TXT canary create/read/delete/absence            | Pending scoped DNS-write token and permanent-Windows run                      |
| P6B1-W4 in-sync production apply refusal with no write credential | Pending permanent-Windows run; expected state `NO_SUPPORTED_PRODUCTION_DRIFT` |
| P6B1-W5 post-canary Phase 6-A 14/14 and Phase 5-C 21/21           | Pending permanent-Windows run                                                 |
| P6B1-CI exact final commit, Ubuntu + Windows                      | Pending final commit and Actions                                              |

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
