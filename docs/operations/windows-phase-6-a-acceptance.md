# Permanent Windows Phase 6-A acceptance

This procedure uses the existing working tree only:

`D:\code\research\fqgate-remote-bridge`

It never creates a checkout and never mutates Cloudflare. Evidence is written
outside Git to:

`D:\code\research\fqgate-phase6a-discovery-evidence.json`

## Prepare

Build the exact commit in the permanent tree and keep the Bridge/FQGate processes
running for the loopback checks. If the Bridge is started by
`scripts/start-bridge.mjs`, use:

```powershell
$env:FQGATE_REMOTE_BRIDGE_CONFIG = "D:\code\research\fqgate-acceptance-config.json"
```

Create a short-lived Cloudflare Custom API token with only these permissions and
resource scopes. Use the exact account and zone; do not select all accounts or
all zones:

| Resource scope                                    | Permission                       |
| ------------------------------------------------- | -------------------------------- |
| target Account `51eaede3a49980ea51dfe61d01cab7f7` | `Account Settings Read`          |
| target Account `51eaede3a49980ea51dfe61d01cab7f7` | `Cloudflare Tunnel Read`         |
| target Account `51eaede3a49980ea51dfe61d01cab7f7` | `Access: Apps and Policies Read` |
| target Zone `haoqi90.top`                         | `Zone Read`                      |
| target Zone `haoqi90.top`                         | `DNS Read`                       |

The account ID and zone are the currently observed FQGate deployment values; if
the intended deployment changes, replace them with the exact desired resources.
Never use a Global API Key. Do not add Tunnel/DNS/Access write or revoke
permissions, API-token permissions, membership permissions, or a Cloudflare
Global API Key. The discovery client uses `GET /accounts/{account_id}` when the
repo-external desired state contains an exact account ID, and only falls back to
the account list when no ID is supplied. Store the desired JSON outside the
repository, for example:

`D:\code\research\fqgate-phase6a-desired.json`

The desired file must contain IDs/AUD/hostnames but no token, assertion, cookie,
client secret, Tunnel token or QR/session material. Start from
`config/cloudflare-phase6a-desired.example.json`.

## Automated acceptance

From PowerShell:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm build
.\scripts\windows\phase6a-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -RunQualityGates
```

The script checks the exact main/clean working tree, both IPv4 loopback listeners,
then prompts exactly once with `Read-Host -AsSecureString` for the Cloudflare
read-only token. It runs `cloudflare discover` and `cloudflare plan` in bounded
child processes without putting the token in arguments, output or evidence. A
child process's stdout and stderr are drained concurrently so a verbose Windows
quality gate cannot deadlock on a full pipe. The child environment also restores
the standard Windows `PATHEXT` entries when an operator environment is missing
`.CMD`, so local `node_modules\.bin` shims such as Playwright resolve correctly.
A non-zero plan result is retained as bounded conflict evidence and keeps closure
OPEN.
non-zero plan result is retained as bounded conflict evidence and keeps closure
OPEN.

For the existing Phase 5-C real remote-machine regression, after the read-only
Cloudflare plan succeeds, use the separate hidden service-token boundary:

```powershell
.\scripts\windows\phase6a-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json `
  -RunQualityGates `
  -RunPhase5CRemoteRegression
```

That delegates existing Client ID/Secret prompts to the Phase 5-C script; they are
not accepted as arguments here. A run that omits either `-RunQualityGates` or
`-RunPhase5CRemoteRegression` is recorded as `INCOMPLETE` and exits non-zero; it
cannot be mistaken for Phase 6-A closure evidence.

## Manual boundaries

If the plan emits normalized `LOGIN_REQUIRED`, follow the exact local QR flow
printed by the script: open `http://127.0.0.1:17282/login`, start the existing QR
flow, physically scan/approve, then rerun the exact Phase 5-C command named in the
message. Do not scan for an ordinary plan conflict.

If `MANUAL_REQUIRED` reports unproven admin MFA, inspect:

`Cloudflare Zero Trust > Access controls > Applications > <admin hostname> > Policies`

Field: administrator MFA/identity-provider requirement. Expected: MFA enabled for
every administrator policy, with no Bypass. If the value is not enabled, the
result is unsafe and must not be waived. Rerun the exact Phase 6-A command after
updating only the repo-external desired evidence/configuration as directed by the
plan. The script also prints a structured check ID, reason and rerun command.

## Evidence and closure

The JSON evidence contains only check IDs/results, bounded counts, drift summary,
plan fingerprint, commit/tool metadata and the fixed external path. It must not
contain raw Cloudflare response bodies, authorization headers, token values,
Access JWTs, cookies, client secrets, Tunnel tokens or QR/session data.

Phase 6-A is CLOSED only when the task handoff records all deterministic gates,
permanent-Windows real discovery/plan, loopback topology, Phase 5-C regression,
exact-commit Ubuntu and Windows CI IDs, a stable secret-free fingerprint, and no
unresolved `MANUAL_REQUIRED` or `unsafe_conflict`.
