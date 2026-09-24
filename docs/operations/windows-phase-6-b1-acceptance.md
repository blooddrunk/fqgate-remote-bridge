# Permanent Windows Phase 6-B1 acceptance

Status: **CLOSED for implementation commit `3cc99033ad9dbac899584ce3b8e3e81053647a98`.**
The permanent-Windows canary, post-canary regressions, quality gates and
exact-commit Ubuntu/Windows CI passed on 2026-09-24. Results are in
`docs/status/phase-6-b1-implementation-handoff.md`.

Use only the existing checkout:

```text
D:\code\research\fqgate-remote-bridge
```

Do not create another checkout. Keep FQGate and Bridge running; both listeners
must remain bound exactly to `127.0.0.1:17281` and `127.0.0.1:17282`.

## Repo-external configuration

Use the same repo-external files as the closed Phase 6-A and Phase 5-C
acceptance:

- desired state: `D:\code\research\fqgate-phase6a-desired.json`;
- Bridge config: `D:\code\research\fqgate-acceptance-config.json`;
- machine Tunnel ingress evidence:
  `D:\code\research\fqgate-machine-tunnel-ingress-evidence.json`.

The script rejects any of these inputs if they are inside the repository. The
desired state may contain deployment IDs, hostnames and Access AUDs only. It
must not contain credentials, cookies, JWTs, QR/session material or Tunnel
tokens.

## DNS-write token boundary

The existing three-entry Windows Credential Manager Vault remains unchanged.
The script reads the existing Cloudflare discovery token through the Vault's
`CloudflareRead` binding and delegates the Phase 5-C machine matrix to the
existing Vault-backed procedure. The DNS-write token is separate and is never
stored in Credential Manager or in a file.

Before the run, create a short-lived Custom API Token in the Cloudflare
Dashboard at **Manage Account > Account API Tokens > Create Token > Create
Custom Token**. In **Permissions**, choose only **Zone / DNS / Edit**; in
**Zone Resources**, include only the exact zone named by the repo-external
desired state; set the shortest usable expiry. Do not grant account, Tunnel,
Access, token-management or other zone permissions. Never use a Global API Key.
The token needs no DNS-read permission: live reads use the existing read-only
Vault token.

The Bridge intentionally does not call Cloudflare token-management endpoints,
and a successful DNS canary proves write access but cannot prove the token has
no broader scope. The exact human-only boundary is the token's **Permissions**
and **Zone Resources** fields in the Dashboard path above; expected values are
only `Zone / DNS / Edit`, scoped to the one desired zone. The automated canary
then proves that this credential can create and clean up DNS there. No further
manual deployment-property check is requested.

The script first runs the full Windows quality gates and safe Phase 6-A plan.
Only when the reserved canary is about to run (or a real supported production
DNS record is missing) does it display `Read-Host -AsSecureString`. The token
is passed only through a bounded child-process environment and cleared from the
acceptance process after use. It is never placed in arguments, output,
exceptions, repository files, the Vault or evidence.

## Automated run

From Windows PowerShell:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
.\scripts\windows\phase6b1-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

The script verifies a clean `main` checkout and runs focused Phase 6-B1 tests,
then the full frozen install, typecheck, lint, tests, build, format check and
Playwright E2E through the existing Phase 6-A harness. It reads and verifies
the current Phase 6-A plan against that run's fingerprint before any write.

If no desired production DNS CNAME is classified `missing/create`, the script
records `NO_SUPPORTED_PRODUCTION_DRIFT` and calls production `apply` on the
in-sync human DNS check without supplying a DNS-write token. The CLI must return
`CLOUDFLARE_APPLY_REJECTED`; because the selected check is not `missing/create`,
the write transport is never constructed and no write request can occur.

If real supported DNS drift exists, the script prints the exact check ID,
hostname, Tunnel-derived target and `proxied=true` before asking for the
separate hidden token. It may apply only those real missing CNAME checks, one
per invocation with a freshly read fingerprint. The CLI refuses production
apply on non-Windows platforms before any Cloudflare discovery or write. It
never creates artificial drift. A successful production apply re-runs the
existing Phase 5-C remote matrix as part of its transaction; failure triggers
same-invocation rollback and fingerprint restoration proof.

The live canary uses exactly
`_fqgate-remote-bridge-phase6b-canary.<desired-zone>`. It checks for collision,
creates one TXT value containing only the commit SHA and fixed `P6B1-W3`
evidence label, verifies exactly the returned record ID and value, deletes only
that returned ID, and proves the name absent. Cleanup is attempted even if the
record verification fails. TXT is not an action accepted by production apply.

After canary cleanup, the script automatically reruns the full Phase 6-A
acceptance, including all repository quality gates, both listener checks,
Cloudflare discovery/plan, and the Vault-backed Phase 5-C remote machine
matrix. It requires 14/14 Phase 6-A checks and 21/21 Phase 5-C records. Evidence
is written outside the checkout to:

```text
D:\code\research\fqgate-phase6b1-acceptance-evidence.json
```

## Physical QR boundary

Only when an automated Phase 5-C/Phase 6-A call returns exact normalized
`LOGIN_REQUIRED`, the script prints this local action:

1. Open `http://127.0.0.1:17282/login` on the Windows PC.
2. Start the existing QR flow and physically scan/approve it.
3. Resume automation with the same command shown by the script:

```powershell
.\scripts\windows\phase6b1-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

No other manual Cloudflare checks were required for the completed acceptance.
For any future authorized acceptance, if the plan reports an API-unobservable
condition, operator output must name the exact Dashboard path, field, expected
value, reason the API cannot prove it, and this resume command; the run is not
complete until automation resumes and records passing evidence.

## Closure requirements

The initial B1 closure requirements were met on 2026-09-24. The handoff records
the implementation commit, workflow run and job IDs; machine evidence remains
outside the repository. Any later change to this security boundary requires a
separate reviewed task and must repeat the applicable acceptance criteria.
