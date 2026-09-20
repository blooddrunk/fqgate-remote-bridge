# Windows Phase 5-A Acceptance and Evidence

Date: 2026-09-20

Status: **CLOSED — real service-token acceptance completed**

This procedure uses the permanent Windows working tree under
D:\code\research\fqgate-remote-bridge. It never creates a second checkout,
never asks for a credential in chat, never stores service credentials in
ordinary configuration, and never calls updates.apply.

## Non-secret acceptance configuration

The repo-external file
D:\code\research\fqgate-acceptance-config.json contains lifecycle metadata and
only these machine Access values:

```json
{
  "machineHostname": "fqgate-api.haoqi90.top",
  "machineAccess": {
    "teamDomain": "haoqi90.cloudflareaccess.com",
    "audience": "2fc09614ef01c3416189195e5c4cea67739a5edc6b4bae39121a823f653eff3c"
  }
}
```

It must not contain Client ID, Client Secret, JWT, cookie, Tunnel token, or
service credential fields. The separate non-secret W11 evidence file is:

```text
D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

## Automatic/local verification

From the permanent checkout:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

The final deterministic result was 16 test files / 149 tests. Ubuntu Browser
E2E passed 13/13. The final Windows CI job passed its Windows gates; Browser
E2E is intentionally skipped by the workflow condition.

Run the permanent Windows local acceptance:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyLocal
```

This verifies the CLI, both IPv4 loopback listeners, raw/unregistered denial,
unknown Host and forwarded-host spoofing denial, hostname collision, and
token-file service shape. It prints bounded PASS/FAIL/SKIP records only.

The existing smoke path is:

```powershell
.\scripts\windows\acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyCli -VerifyBridge
```

## Cloudflare topology

Cloudflare read-back confirmed:

- machine hostname: fqgate-api.haoqi90.top;
- separate self-hosted Access application and AUD;
- Service Auth policy matching only the machine service token;
- existing remotely-managed Tunnel origin exactly
  http://127.0.0.1:17282;
- no Tunnel ingress containing 17281;
- proxied DNS CNAME to the existing Tunnel.

Cloudflare provisioning automation remains Phase 6. The resources above were
created/updated once through the operator-authorized external API-token
operation; no provisioning code was added to this phase.

## Hidden credential matrix

Start the existing token-file cloudflared service and the loopback Bridge.
Keep the Bridge terminal running. In a second PowerShell run:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

The wrapper prompts with Read-Host -AsSecureString for Client ID and Client
Secret. It decrypts them briefly in memory, passes them to the child process
environment, and clears secure strings and plaintext references in finally.
Neither credential is a command-line argument. The companion prints no body,
JWT, cookie, assertion, Tunnel token, or credential.

The companion allows at most three attempts for connection errors and HTTP
502/503/504, with a 750ms delay. It never retries or relaxes HTTP 401/403
authentication or authorization results.

## Required live results

The completed 2026-09-20 matrix was:

| ID      | Required result                                        | Observed result                      |
| ------- | ------------------------------------------------------ | ------------------------------------ |
| P5A-R1  | no credential is challenged/denied                     | PASS — HTTP 401                      |
| P5A-R2  | valid credential reaches Bridge but has zero privilege | PASS — HTTP 403, OPERATION_FORBIDDEN |
| P5A-R3  | raw FQGate path is unavailable                         | PASS — HTTP 403, OPERATION_FORBIDDEN |
| P5A-R4  | machine credential cannot use ordinary-human hostname  | PASS — HTTP 302                      |
| P5A-R5  | machine credential cannot use admin hostname           | PASS — HTTP 302                      |
| P5A-R6  | machine hostname reaches Bridge rather than FQGate     | PASS — HTTP 403, OPERATION_FORBIDDEN |
| P5A-W10 | authenticated companion exits successfully             | PASS                                 |
| P5A-W11 | ingress is Bridge-only and has no 17281 route          | PASS                                 |

The dangerous-operation deny matrix is deterministic and is never live-called.
The matrix does not call updates.apply or any other mutating operation.

## Permanent Windows result

The final VerifyLocal result exited 0:

```text
P5A-W1 PASS
P5A-W2 PASS
P5A-W3 SKIP — reserved for authenticated Tunnel evidence
P5A-W4 PASS
P5A-W5 PASS
P5A-W6 PASS
P5A-W7 PASS
P5A-W8 PASS
P5A-W9 PASS
```

The existing Windows CLI/loopback smoke exited 0. A stop-then-start probe
returned FQGate lifecycle ready after the manual-start health-readiness race
was fixed.

## Security boundary and operator record

Client ID, Client Secret, Access JWT, cookies, and Tunnel token never entered
Git, ordinary config, logs, command-line arguments, documentation, or test
evidence. The actual operator actions were:

1. Select fqgate-api.haoqi90.top and authorize the scoped Cloudflare
   application/policy/Tunnel/DNS configuration operation.
2. Use the permanent Windows checkout and validated FQGate binary.
3. Keep the existing token-file cloudflared service and Bridge running.
4. Enter the service-token credentials only at the hidden PowerShell prompts.
5. Rerun the bounded matrix after transient retry support and W11 evidence
   correction.

No Phase 5-B market-data route or any financial state-changing capability was
implemented or called. Phase 5-A is closed; Phase 5-B remains a separate
task.
