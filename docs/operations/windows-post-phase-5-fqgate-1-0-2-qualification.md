# Post-Phase-5 FQGate 1.0.2 qualification

This is the repeatable maintenance procedure between closed Phase 5 and Phase 6.
It uses only the permanent Windows working tree:

```text
D:\code\research\fqgate-remote-bridge
```

The external acceptance configuration remains:

```text
D:\code\research\fqgate-acceptance-config.json
```

The existing machine Tunnel ingress evidence is:

```text
D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

No temporary checkout, new Cloudflare resource, raw FQGate route, or credential-bearing
file is created by this procedure.

## Trusted 1.0.2 identity

The qualification command independently checks the official stable manifest and requires:

```text
version: 1.0.2
file:    FQGate-1.0.2-windows-x64-UNSIGNED.exe
size:    23065088
sha256:  024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2
```

The unsigned executable is never trusted by name alone. The existing fixed official source,
exact size/checksum, candidate identity, health, OpenAPI required-contract, and transaction
rollback checks remain mandatory.

## Prepare the permanent checkout

Run from an interactive PowerShell session on the permanent Windows host. Stop if the first
command reports operator-owned changes; do not reset or overwrite them.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short --branch
git fetch origin
git pull --ff-only origin main
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

The qualification harness itself requires the checkout to be on `main` and clean. It records
the exact commit, Node/pnpm/PowerShell versions, and the bounded pre-upgrade identity.

Before running the Phase 5-B/5-C regression, ensure the already-running Bridge was launched
with the same external config used by the qualification command. For example, start the
dashboard with `-ConfigPath D:\code\research\fqgate-acceptance-config.json`, or set
`FQGATE_REMOTE_BRIDGE_CONFIG` to that exact path for `scripts/start-bridge.mjs`. Do not launch
`start-bridge.mjs` without this variable: the default compatibility list can reject a qualified
1.0.2 even while the FQGate CLI reports it as qualified.

## Run the bounded qualification

The full closure command includes local Phase 5-B/5-C regression and the real remote-machine
service-token matrix:

```powershell
.\scripts\windows\post-phase5-fqgate-1-0-2-qualification.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json `
  -RunAuthenticatedServiceTokenMatrix
```

The script stages and activates the official candidate through the existing lifecycle
transaction, then automatically checks:

| Check IDs                   | Automated evidence                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `P5Q-W1`, `P5Q-W4`–`P5Q-W6` | Permanent path, clean `main` checkout, exact commit, toolchain                         |
| `P5Q-M1`                    | Official 1.0.2 manifest/package identity                                               |
| `P5Q-B1`–`P5Q-B4`           | Known-good 1.0.1, loopback listeners, OpenAPI count/fingerprint, current lookup result |
| `P5Q-Q1`–`P5Q-Q5`           | Candidate qualification, artifact identity, health, and loopback topology              |
| `P5Q-R1`–`P5Q-R3`           | Phase 5-B local, Phase 5-C local, and real remote-machine regression                   |
| `P5Q-SUMMARY`               | Machine-counted final result                                                           |

The candidate qualification gate verifies all base contracts, the lookup operation plus its
transitive-schema fingerprint, and the fixed exact-code semantic probe. A changed fingerprint,
invalid response, missing contract, failed health check, or other activation error rolls back
to the known-good 1.0.1 executable and reports its bounded check ID.

Evidence is written outside Git next to the acceptance config:

```text
D:\code\research\fqgate-post-phase5-1-0-2-evidence.json
```

The evidence is capped at 64 KiB and contains only check IDs, status, bounded versions/counts,
public artifact identity, and non-secret fingerprints. It must not contain credentials, JWTs,
cookies, QR/session material, raw OpenAPI, or raw market payloads.

## The only possible human boundaries

If the machine-readable probe returns `LOGIN_REQUIRED`, the script prints:

```text
MANUAL_FQGATE_LOGIN_REQUIRED
```

Open `http://127.0.0.1:17282/login` on the permanent Windows host, complete the existing
physical QR scan/approval, and rerun the exact command above. No OpenAPI or response judgment
is manual.

For the remote matrix, the existing Phase 5-A wrapper prompts for Client ID and Client Secret
with `Read-Host -AsSecureString`. The values are held only in memory and a child-process
environment, then cleared. They must not be placed in arguments, config, logs, chat, screenshots,
or evidence.

If neither condition occurs, the command must complete without human intervention.

## Closure rule

Do not mark the maintenance task closed from a local test run or this document. Closure requires
the evidence file, active 1.0.2 artifact, local and remote machine totals, unchanged two-operation
machine OpenAPI, exact loopback/Tunnel checks, deterministic rollback coverage, and green Ubuntu
and Windows CI for the same final commit. Until then the active task remains:

```text
docs/tasks/post-phase-5-fqgate-release-compatibility-and-1-0-2-refresh.md
```
