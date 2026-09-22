# Phase 6-A task — Cloudflare read-only discovery, reconciliation and plan

Status: **OPEN**.

This task package is the executable contract for the Phase 6-A implementation.
It does not authorize Phase 6-B or any Cloudflare mutation.

## Required behavior

1. Use a fixed Cloudflare API base and a GET-only, bounded transport.
2. Discover exact account/zone, remotely-managed Tunnel/configuration, human/admin/
   machine DNS, three independent Access applications/AUDs and their policies.
3. Read an explicit repo-external desired document without credentials.
4. Build a stable, canonical, secret-free plan and SHA-256 fingerprint.
5. Preserve loopback topology and all existing Bridge operation permissions. In
   particular, `remote_machine` remains limited to `market.instruments.lookup` and
   `openapi.machine`.
6. Fail closed on duplicate/ambiguous resources, direct 17281 ingress, wildcard or
   broad ingress, wrong origin, unexpected AUD, Bypass, Everyone and policy widening.

## Acceptance IDs

| ID        | Check                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- |
| P6A-T-01  | desired-state bounds, exact Bridge origin, unique hostname/AUD and context policy validation |
| P6A-T-02  | fixed API base, allowlisted GET paths, no mutation/token methods                             |
| P6A-T-03  | timeout, redirect rejection, bounded body and pagination                                     |
| P6A-T-04  | Authorization/token redaction and secret-free plan/evidence                                  |
| P6A-T-05  | deterministic discovery selection and duplicate/ambiguous reporting                          |
| P6A-T-06  | Tunnel origin, direct 17281 and wildcard/broad-ingress conflicts                             |
| P6A-T-07  | exact DNS target/type/proxy and duplicate detection                                          |
| P6A-T-08  | independent Access app ID/hostname/type/AUD checks                                           |
| P6A-T-09  | human/admin/machine policy isolation, Bypass/Everyone/widening and MFA proof                 |
| P6A-T-10  | canonical plan and stable SHA-256 fingerprint                                                |
| P6A-T-11  | existing Bridge/Phase 5-C deterministic regressions                                          |
| P6A-W-01  | permanent Windows CLI/loopback smoke and real Cloudflare discovery/plan                      |
| P6A-W-02  | external evidence at `D:\code\research\fqgate-phase6a-discovery-evidence.json`               |
| P6A-CI-01 | frozen install, typecheck, lint, test, build, format and E2E on the exact commit             |
| P6A-CI-02 | exact-commit Ubuntu and Windows GitHub Actions pass                                          |

## Human boundary

Only a hidden, least-privilege Cloudflare read token may be entered through
`Read-Host -AsSecureString`; it is passed briefly through a child-process
environment and cleared in `finally`. Existing Phase 5-C service-token prompts
remain responsible for the optional real remote-machine regression. QR approval is
permitted only after normalized `LOGIN_REQUIRED` output.

## Closure

The task stays OPEN if any acceptance ID is pending or failed, or if any
`manual_required`/`unsafe_conflict` remains. The handoff must record exact check
IDs, observed bounded values, evidence path, fingerprint, exact final commit and
both CI run IDs. A summary such as “manual evidence incomplete” is not closure
evidence.
