# Windows Phase 5-A Acceptance and Evidence

Date: 2026-09-20

Status: **OPEN** until the real Cloudflare service-token matrix completes.

This procedure uses the permanent Windows working tree under
`D:\code\research`. It never creates a second checkout, never asks for a
credential in chat, and never calls `updates.apply`.

## Automatic/local checks

First ensure the repo-external config contains only non-secret metadata:

```json
{
  "remoteAccess": {
    "remoteHostname": "ordinary-human.example.com",
    "adminHostname": "admin.example.com",
    "machineHostname": "machine-api.example.com",
    "adminAccess": {
      "teamDomain": "team.cloudflareaccess.com",
      "audience": "<admin-audience>"
    },
    "machineAccess": {
      "teamDomain": "team.cloudflareaccess.com",
      "audience": "<machine-audience>"
    }
  }
}
```

The actual config may include the already-established non-secret lifecycle
metadata, but must not contain Client ID, Client Secret, JWT, cookie, Tunnel
token, or service credential fields. Run:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -VerifyLocal
```

The script automatically resolves `D:\code\research\fqgate-remote-bridge`
(or the actual Git root when the repository is mounted directly at the base),
checks the CLI, starts the built Bridge with the external config, verifies
`127.0.0.1:17282` and `127.0.0.1:17281`, checks raw/unregistered and
unknown/forwarded-host denial, and reports only bounded result records. The
external Tunnel-origin check is deliberately not claimed by `-VerifyLocal`; it
is P5A-W11 in the authenticated run so the repo config never stores an origin
or token.

## Exact manual Cloudflare boundary

If the machine resources do not already exist, the operator performs these
steps in Cloudflare Zero Trust; Cloudflare provisioning remains Phase 6:

1. Create a separate self-hosted Access application for the machine/API
   hostname.
2. Create a separate service token under Access controls → Service credentials.
3. Add a policy to the machine application with action **Service Auth** that
   matches only this service token. Do not use Bypass.
4. Put only the machine hostname, team domain, and machine application AUD in
   the repo-external acceptance config.
5. Add the machine hostname to the existing remotely-managed Tunnel with
   origin exactly `http://127.0.0.1:17282`; do not add any `17281` ingress.
6. Keep Client ID and Client Secret outside Git, ordinary config, logs,
   command-line arguments, documents, screenshots, and chat.

Expected observable edge result before the next command: the machine hostname
without service headers is challenged/denied, and the machine application AUD
is distinct from the human/admin audiences.

## Hidden credential matrix

After the six setup actions above, run:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedServiceTokenMatrix
```

The only credential action is typing Client ID and Client Secret into the two
hidden `Read-Host -AsSecureString` prompts. The PowerShell wrapper decrypts
them briefly in memory and gives them to the child process environment; it
does not put them in the command line. The child clears bounded response data
after each request and prints no body, JWT, cookie, or credential.

The matrix records:

| ID      | Required observable result                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------ |
| P5A-R1  | machine hostname without service credential: Access challenge/deny, not Bridge success                 |
| P5A-R2  | valid service credential reaches Bridge; `/api/v1/version` returns HTTP 403 with `OPERATION_FORBIDDEN` |
| P5A-R3  | machine hostname raw `/v1/market/health` is denied, never an FQGate response                           |
| P5A-R4  | the same credential cannot obtain ordinary-human privilege                                             |
| P5A-R5  | the same credential cannot obtain admin privilege                                                      |
| P5A-R6  | machine hostname proves Bridge-origin policy rather than direct FQGate exposure                        |
| P5A-W11 | bounded ingress evidence contains `http://127.0.0.1:17282` and no `17281` route                        |

The dangerous-operation deny matrix is deterministic and is never live-called;
the harness does not call `updates.apply` or any other mutating operation.

## Evidence state for this implementation

At implementation start, the existing repo-external
`D:\code\research\fqgate-acceptance-config.json` contained ordinary/admin
metadata but no `remoteAccess.machineHostname` or `machineAccess` fields. The
real service-token matrix therefore cannot be started safely until the exact
Cloudflare setup steps above are completed and the non-secret machine metadata
is added. No Client ID/Secret was requested, copied, logged, or stored by this
task.

The actual 2026-09-20 runs on the existing permanent checkout were:

| Check                                              | Result              | Exact evidence                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `acceptance.ps1 -VerifyCli -VerifyBridge` | PASS, exit 0        | CLI version printed; production Bridge loopback and deny-by-default smoke passed.                                                                                                                                                                                     |
| Phase 5-A `-VerifyLocal`                           | OPEN, exit 1        | `P5A-W1` PASS; `P5A-W2` MANUAL because machine metadata is absent; `P5A-W3` SKIP; `P5A-W4`, `P5A-W5`, and `P5A-W9` PASS. The installed FQGate was not listening, so `P5A-W6` failed with observed `none`, `P5A-W7` returned HTTP `0`, and `P5A-W8` returned HTTP `0`. |
| FQGate start probe                                 | FAIL, exit 1        | `fqgate start --json` reported `lifecycle: unhealthy`, process running, health unavailable, and no `127.0.0.1:17281` listener. The follow-up `fqgate stop --json` exited 0 and left it stopped.                                                                       |
| Authenticated Phase 5-A wrapper                    | NOT STARTED, exit 1 | Exact error: `Phase 5-A authenticated acceptance requires machineHostname, machineAccess.teamDomain, and machineAccess.audience in repo-external config; no credential prompt was opened.`                                                                            |

The initial wrapper stopped at its non-secret config precondition, but that
precondition has since been completed through an operator-authorized API
operation. The current Cloudflare state is:

- self-hosted application `fqgate-api.haoqi90.top` exists with its own AUD;
- its only policy is `non_identity` / Service Auth bound to the existing
  `fqgate-machine-acceptance` service token;
- the existing remotely-managed Tunnel routes the hostname only to
  `http://127.0.0.1:17282`, with Access validation required and no `17281`
  route;
- proxied DNS CNAME `fqgate-api.haoqi90.top` points to the existing Tunnel;
- the external config contains only the non-secret machine hostname, team
  domain, and AUD. No Client ID/Secret was stored there.

The subsequent permanent-Windows `-VerifyLocal` run passed with exit code 0:
W1, W2, W4, W5, W6, W7, W8, and W9 all PASS; W3 is the designed SKIP. A
credential-free HTTPS probe to the machine hostname returned HTTP 401, proving
the new Access edge challenge. The authenticated P5A-R1 through R6 matrix has
not yet made a request: the existing Windows service
`FQGateRemoteBridgeCloudflared` is stopped, and the non-elevated attempt to
start it failed with the exact Windows error
`Cannot open FQGateRemoteBridgeCloudflared service on computer '.'`. No
service-token credential prompt was opened, so the live authenticated matrix is
currently **HTTP N/A — Windows service start permission failed**.

The next exact operator action is to open an elevated PowerShell and run:

```powershell
Start-Service -Name FQGateRemoteBridgeCloudflared
Get-Service -Name FQGateRemoteBridgeCloudflared
```

After it reports `Running`, keep the existing token-file service active, start
the Bridge with `start-phase4.ps1`, and run the hidden-credential command above.
Do not paste the service-token Client ID/Secret into chat; only bounded PASS/
FAIL result lines may be shared. Phase 5-A remains **OPEN** until R1-R6, W10,
and W11 have concrete passing evidence.

Until that action produces P5A-R1 through P5A-R6 and P5A-W11 with PASS, Phase
5-A remains OPEN and no Phase 5-B operation may be implemented.
