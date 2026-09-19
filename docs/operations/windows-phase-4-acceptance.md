# Windows Phase 4 Acceptance — Secure Remote Human Access

Status: **CLOSED / live acceptance completed 2026-09-17**

This procedure is for the supported Windows x64 host with real Cloudflare
resources. It does not create Cloudflare resources, request API keys, write a
Tunnel token into repository configuration, or log QR/session material. Phase
4 may be marked **CLOSED** only after the operator records the real evidence
listed in the final table. The current repository includes the recorded closure
evidence at the end of this document.

## Preconditions

- Windows x64, Node.js 22+, Corepack/pnpm 11.23.0, and an interactive user
  session;
- FQGate managed by this repository and listening only on
  `127.0.0.1:17281`;
- Bridge built and listening only on `127.0.0.1:17282`;
- a manually created remotely-managed Cloudflare Tunnel;
- one public hostname/published application whose origin is exactly
  `http://127.0.0.1:17282`;
- a self-hosted Cloudflare Access application for that hostname with a human
  Allow policy and **Protect with Access** enabled on the published
  application/origin;
- a repo-external token file readable by the selected Windows service identity
  and protected by restrictive ACLs;
- a configuration file containing only the remote hostname and token-file path,
  for example:

```json
{
  "remoteAccess": {
    "remoteHostname": "dashboard.example.com"
  },
  "cloudflared": {
    "releaseVersion": "2026.9.0",
    "installDirectory": "C:\\Program Files\\FQGateRemoteBridge\\cloudflared",
    "tokenFile": "C:\\ProgramData\\FQGateRemoteBridge\\secrets\\tunnel-token",
    "serviceName": "FQGateRemoteBridgeCloudflared"
  }
}
```

The example contains no token. Do not paste a token into the JSON file, a
PowerShell command line, a screenshot, a bug report, browser storage, or the
acceptance record.

FQGate remains an interactive desktop process. This procedure does not claim
headless FQGate Windows-service support.

## Windows reboot recovery

The cloudflared service and the interactive local application have separate
lifecycle boundaries. After a Windows reboot, cloudflared may be `Running`
while FQGate and the loopback Bridge are not listening yet; the public hostname
then returns an origin failure such as HTTP 502. This is not evidence that the
Tunnel should be recreated.

From the logged-in Windows user session, start the existing local runtime before
retesting the public hostname:

```powershell
.\scripts\windows\start-dashboard.cmd
```

For the external Phase 4 deployment copy, supply its external configuration and
keep the launcher process running in the interactive session:

```powershell
.\scripts\windows\start-dashboard.cmd `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -SkipInstall -SkipBuild
```

Confirm that FQGate and Bridge listen only on `127.0.0.1:17281` and
`127.0.0.1:17282` before interpreting a remaining public error as a Tunnel
problem. Do not start a second Bridge instance or point cloudflared at port
`17281`.

## Deterministic and local checks

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

Review the fixed release before any explicit cloudflared install:

```powershell
node .\dist\cli\main.js cloudflared release --json --config .\config\phase-4.json
node .\dist\cli\main.js cloudflared install --dry-run --json --config .\config\phase-4.json
```

The release output must identify the fixed Cloudflare source, selected
calendar-version, Windows x64 asset, size, and SHA-256. There is no binary URL
argument. An explicit non-dry-run install is operator-controlled and does not
start or reconfigure the service automatically.

## Token-file and service setup

Create/adopt the token file through the operator's approved secret-handling
process. If repository tooling writes it, it must be supplied ephemerally and
the tooling must immediately apply the Windows ACL; the raw value must never
be returned in output.

Install and inspect the service:

```powershell
node .\dist\cli\main.js cloudflared service install --json --config .\config\phase-4.json
node .\dist\cli\main.js cloudflared service start --json --config .\config\phase-4.json
node .\dist\cli\main.js cloudflared status --json --config .\config\phase-4.json
```

The service invocation must have this shape, with a protected path only:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Inspect service/process metadata without printing it to a shared record. Verify
that it contains `--token-file` and the protected path, and does not contain
the raw Tunnel token. The `tokenFile.state` result must be `secure`; any other
state is a blocking failure. Verify the ACL grants only the intended service
identity and required administrators/system principals, with inheritance and
broad user/everyone access removed.

## Acceptance script

The explicit Phase 4 mode performs local listener/raw-route checks, queries
the cloudflared service through the built CLI, checks that the Windows service
is running and uses `--token-file`, and optionally sends one unauthenticated
request to the public hostname:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
  -File .\scripts\windows\acceptance.ps1 `
  -ConfigPath .\config\phase-4.json `
  -VerifyPhase4 `
  -RemoteUrl https://dashboard.example.com
```

The `-RemoteUrl` check must return an Access challenge/denial (normally
302/303/307/308/401/403). A successful public response without human
authentication is a failure. The script does not automate login and does not
accept or record an Access assertion/cookie.

Without `-RemoteUrl`, the script reports public Cloudflare evidence as
pending; that output is not a passing remote acceptance.

## Authenticated human checks

Use a normal browser and the intended human Allow-policy identity. Do not
export cookies, JWTs, `Cf-Access-Jwt-Assertion`, private identity details, or
QR payloads.

1. Open the public hostname after completing Access authentication. Dashboard
   and status must load.
2. Open `/login`, start QR begin, and poll the flow only when it is safe to do
   so. Confirm the QR image and pending/connected states work. Record only
   bounded success/failure and never the image, base64, upstream `flow_id`, or
   full session ID.
3. Open `/updates`. Read-only status may load. The update check/plan/apply
   controls must be absent/disabled and explain in Chinese that they require
   local maintenance access. Direct API attempts to
   `/api/v1/updates/check`, `/api/v1/updates/plan`, and
   `/api/v1/updates/apply` must return the normalized 403
   `OPERATION_FORBIDDEN` response.
4. Open `/api-reference`. The reference catalog may load, but the Runtime
   OpenAPI refresh control must be absent/disabled with the local-maintenance
   explanation. Direct `/api/v1/openapi/refresh` must return 403.
5. Request `/v1/market/health` and a made-up upstream path through the public
   hostname. Both must remain unreachable through the Bridge (404); there is
   no raw upstream fallback.
6. Request an unknown Host or send only `X-Forwarded-Host` from a controlled
   test client. It must not grant remote-human context. Do not use a public
   test that could expose an assertion value.

## Local maintenance and reconnect checks

While the public checks are complete, use the loopback URL in the local
operator session:

```text
http://127.0.0.1:17282/updates
http://127.0.0.1:17282/api-reference
```

Confirm local update check/plan/apply and OpenAPI refresh remain usable only
through loopback, subject to the existing explicit confirmation/rollback
workflow. Confirm FQGate is still on `127.0.0.1:17281`.

Restart only cloudflared:

```powershell
Restart-Service -Name FQGateRemoteBridgeCloudflared
```

Verify the service returns to Running, the public hostname reconnects, and
the Bridge/FQGate loopback listeners did not change. Do not restart FQGate or
force a logout solely to manufacture a QR result.

## Evidence record

Record bounded metadata only:

```text
date:
repository revision:
Windows version/architecture:
Node/pnpm versions:
FQGate version:
FQGate listener: exactly 127.0.0.1:17281
Bridge listener: exactly 127.0.0.1:17282
cloudflared source/version/asset/SHA-256:
cloudflared service: installed/running
service invocation: token-file form; raw token absent (yes/no)
token-file ACL state: secure (yes/no)
published origin: http://127.0.0.1:17282
unauthenticated Access result:
authenticated Dashboard/status result:
QR begin/poll result:
remote local-admin denial result:
remote raw/unregistered path denial result:
local maintenance result:
cloudflared restart/reconnect result:
```

Never record the token, assertion, cookies, QR image/base64, numeric upstream
flow ID, full session ID, private identity, or a full live OpenAPI document.

## Closure gate

## Recorded closure evidence — 2026-09-17

The supported Windows x64 operator environment completed the live acceptance.
Only bounded pass/fail results are recorded here; no token, Access assertion,
cookie, QR payload, private identity detail, or full session identifier is
included.

```text
Windows/Node: Windows x64 / Node.js v24.15.0
FQGate listener: PASS — exactly 127.0.0.1:17281
Bridge listener: PASS — exactly 127.0.0.1:17282
cloudflared: PASS — official Windows x64 release 2026.9.0
Windows service: PASS — installed, automatic, and running
service invocation: PASS — tunnel run --token-file <protected-path>; raw token absent
token-file ACL: PASS — secure
published origin: PASS — http://127.0.0.1:17282
unauthenticated Access: PASS — challenge/denial observed
authenticated Dashboard/status: PASS — operator confirmed
QR begin/poll: PASS — operator confirmed
read-only update status/API catalog: PASS — operator confirmed
remote local-admin denial: PASS — operator confirmed
remote raw/unregistered path denial: PASS — operator confirmed
local maintenance: PASS — operator confirmed through loopback
cloudflared restart/reconnect: PASS — operator confirmed after the outbound-route fix
```

Phase 4 is **CLOSED** as of 2026-09-17. Future remote-administrator
authentication/device/second-confirmation policy and mobile Dashboard UI
optimization are deferred planning items and do not change this acceptance.
