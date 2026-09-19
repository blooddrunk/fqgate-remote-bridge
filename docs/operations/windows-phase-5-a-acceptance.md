# Windows Phase 5-A Acceptance and Evidence

Date: 2026-09-19

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
unknown/forwarded-host denial, and checks the fixed Bridge origin. It reports
only bounded result records.

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

Current status is **OPEN**. The next operator action is specifically:

> Create the separate machine Access application/service token and Service Auth
> policy, add its hostname to the existing Tunnel with origin
> `http://127.0.0.1:17282` and no `17281` route, then add only its hostname,
> team domain, and AUD to the repo-external acceptance config and rerun the
> hidden-credential command above.

Until that action produces P5A-R1 through P5A-R6 and P5A-W11 with PASS, Phase
5-A remains OPEN and no Phase 5-B operation may be implemented.
