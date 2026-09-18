# Phase 4.5 Remote-Admin Setup and Reconfiguration

This is the operator runbook for configuring the existing Phase 4 Windows
deployment with the Phase 4.5 `remote_admin` surface. It is intentionally
procedural: follow it in order and keep the explanations beside the actions.

This document does not provision Cloudflare resources automatically, add
Phase 5 market-data APIs, or change the financial-operation prohibition.
Cloudflare provisioning automation remains deferred to Phase 6.

## 1. Understand the resulting topology

The public names are service-scoped first-level subdomains:

```text
fqgate.haoqi90.top            ordinary remote human
fqgate-admin.haoqi90.top     FQGate remote administrator
```

Use the equivalent service-scoped names for another domain. Do not use a
generic root-level name such as `admin.example.com` for this service, and do
not choose a deep name such as `admin.fqgate.example.com` unless Advanced
Certificate Manager/Total TLS or an equivalent certificate is deliberately
available. Full-setup Universal SSL normally covers the apex and one wildcard
level only.

Both public names must terminate at the same fixed loopback origin:

```text
Cloudflare Access -> cloudflared -> http://127.0.0.1:17282 -> Bridge
                                                             |
                                                             +-> http://127.0.0.1:17281 -> FQGate
```

There must never be a Tunnel ingress rule to `127.0.0.1:17281`, a LAN/WAN
listener, a router port-forward, or a generic/raw upstream proxy.

## 2. Decide whether this is a reuse or a new instance

Before changing anything, identify the Windows PC, the FQGate account/session
that belongs to it, the Cloudflare zone, and the public hostnames.

| Item                 | Same PC, adding admin access                                               | New PC / separate FQGate account                                          |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bridge/FQGate        | Keep the existing local processes and loopback ports                       | Install and validate a separate local pair                                |
| Tunnel               | Reuse the existing named Tunnel; add the admin hostname                    | Prefer a new named Tunnel and a new token file                            |
| Tunnel token         | Reuse the existing protected file only on that same PC                     | Create a new token and protect it on the new PC; never copy the old token |
| DNS                  | Add or replace the service-scoped hostname pointing to the existing Tunnel | Create a unique service-scoped hostname pointing to the new Tunnel        |
| ordinary Access app  | Keep it if the ordinary hostname and PC are unchanged                      | Create an app for the new ordinary hostname                               |
| admin Access app/AUD | Keep it if the admin hostname is unchanged                                 | Create a distinct admin app and distinct AUD for the new hostname         |
| Bridge JSON          | Add/update `adminHostname` and `adminAccess.audience`                      | Create a separate config with both hostnames and the new admin AUD        |
| WARP/MFA             | Enroll the operator's current device                                       | Enroll each new device independently                                      |
| FQGate login/session | Belongs to this PC/instance; do not share it                               | Establish the new account/session on the new PC                           |

One remotely-managed Tunnel can publish multiple hostnames safely when all of
them intentionally reach the same Bridge on the same PC. Do not attach two
independent PCs to one Tunnel and expect a hostname to select a particular
FQGate account: Tunnel connectors form a pool and can send a request to the
wrong machine. Separate PCs require separate Tunnels unless a later explicit
routing design proves otherwise.

The Cloudflare team domain, App Launcher policy, and reusable identity policy
can be reused when the instances belong to the same Zero Trust organization.
The admin application, hostname, AUD, Bridge admin configuration, and Tunnel
token remain instance-specific. A confirmation grant is always local memory
on one Bridge and is never portable.

## 3. Prepare the Windows configuration

Create a configuration file outside the repository and outside the token
directory. Start from `config/example.json`; replace only the non-secret
values for this instance:

```json
{
  "remoteAccess": {
    "remoteHostname": "fqgate.example.com",
    "adminHostname": "fqgate-admin.example.com",
    "adminAccess": {
      "teamDomain": "your-team.cloudflareaccess.com",
      "audience": "admin-application-audience"
    }
  },
  "cloudflared": {
    "tokenFile": "C:\\ProgramData\\FQGateRemoteBridge\\secrets\\tunnel-token"
  }
}
```

Why:

- `remoteHostname` and `adminHostname` are the only public Host values that
  can create a remote context; unknown Hosts fail closed.
- `teamDomain` derives the fixed Cloudflare certificate endpoint used by the
  Bridge JWT verifier. There is no arbitrary JWKS URL setting.
- `audience` must be copied from the distinct admin Access application. It is
  not the ordinary human application's AUD.
- The token file path is configuration; the raw Tunnel token is not.

Keep the JSON, Tunnel token, Access assertions, QR payloads, session material,
and MFA seed out of Git and chat. A configuration file may be backed up only
after removing or separately protecting any credential-bearing values.

## 4. Configure Cloudflare Access in the dashboard

The exact dashboard labels may change slightly, but the policy intent must
remain the same.

### 4.1 Ordinary human application

In **Zero Trust → Access controls → Applications**, create or verify one
self-hosted application for the ordinary hostname:

1. Set the hostname to the exact `remoteHostname`.
2. Turn on **Protect with Access**.
3. Add an Allow policy for the intended ordinary human identity/group.
4. Do not add Bypass or Service Auth as a shortcut.
5. Keep the app's App Launcher visibility off unless there is a deliberate
   operator reason to show it.

This is the Phase 4 surface. It must continue to expose only the safe,
read-only remote-human operations.

### 4.2 Remote-admin application

Create a second self-hosted application; do not turn the ordinary application
into an admin application:

1. Set the hostname to the exact `adminHostname`.
2. Use a new Access application, which gives the admin app a distinct AUD.
3. Turn on **Protect with Access**.
4. Add an Allow policy containing only the intended human identity/group.
5. Require the WARP posture check and the Windows OS posture check.
6. Require independent MFA using the approved methods, normally TOTP and/or a
   security key.
7. Use a short administrative session, currently 15 minutes.
8. Keep WARP authentication disabled for this app when the policy requires
   direct IdP authentication (`allow_authenticate_via_warp: false`).
9. Verify there is no Bypass policy and no Service Auth policy.

The Cloudflare policy is the first gate. The Bridge independently validates
the injected admin JWT's RS256 signature, exact issuer, exact admin AUD,
temporal claims, and `kid`; passing Access alone does not create a Bridge
admin context.

### 4.3 App Launcher and first MFA enrollment

The App Launcher is a separate account-level Access application. Under
**Access controls → Access settings → Manage your App Launcher**:

1. Create an identity-only Allow policy for the intended operator.
2. Select the intended identity provider on the Authentication tab.
3. Do not treat this policy as permission for the admin hostname; the
   hostname's own application policy remains authoritative.

For a first WARP enrollment, create/verify the dedicated WARP enrollment
application and identity-only Allow policy for the same operator. Do not put
device posture in the enrollment policy: posture can only be evaluated after
the device has enrolled. The admin application applies posture after that.

Open the direct MFA enrollment page when needed:

```text
https://<team-domain>/AddMfaDevice
```

Then run a fresh Windows enrollment request:

```powershell
& "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" registration new <team-name>
```

Complete the browser flow with the intended identity and MFA. Never paste the
generated enrollment URL, Access JWT, or MFA secret into logs or chat.

## 5. Configure DNS and Tunnel ingress

For each public hostname, create a proxied CNAME to the existing Tunnel's
Cloudflare target (the target is normally the Tunnel UUID followed by
`.cfargotunnel.com`). Do not point DNS at the Windows PC, FQGate, or Bridge
IP directly.

In **Zero Trust → Networks → Tunnels → <named Tunnel> → Public Hostnames**:

1. Add the ordinary hostname with service `http://127.0.0.1:17282`.
2. Add the admin hostname with the same service.
3. Protect each hostname with its matching Access application/AUD.
4. Keep a final catch-all `http_status:404` rule.
5. Review the complete ingress list and confirm that `17281` never appears.

The host-to-AUD mapping is deliberate. The ordinary host must not use the
admin AUD, and the admin host must not use the ordinary AUD.

## 6. Start and verify the Windows instance

From the checked-out repository, in the logged-in interactive Windows user
session, run:

```powershell
.\scripts\windows\start-phase4.cmd `
  -ConfigPath D:\code\research\fqgate-phase4-5-acceptance-config.json `
  -NoBrowser
```

The launcher starts the existing cloudflared service if necessary, confirms
FQGate, and starts the loopback Bridge. It does not install arbitrary
software, create Cloudflare resources, or print the Tunnel token.

Perform bounded checks only:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 17281,17282 |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-Service -Name FQGateRemoteBridgeCloudflared
curl.exe -sS -o NUL -w "ordinary=%{http_code}`n" https://fqgate.example.com/
curl.exe -sS -o NUL -w "admin=%{http_code}`n" https://fqgate-admin.example.com/
```

Expected results are IPv4 loopback listeners only, a Running cloudflared
service, and Access challenge/redirect responses for unauthenticated public
requests. Do not use `-L`, dump response headers, or record redirect URLs,
because Access redirects can contain session-bearing material.

Then test in this order:

1. ordinary remote-human Dashboard/status/QR/reference access;
2. ordinary-human denial of all four maintenance operations;
3. admin login with MFA and compliant WARP/Windows posture;
4. admin `updates.check`, `updates.plan`, and `openapi.refresh`;
5. apply confirmation negative cases before any known-safe apply;
6. local loopback maintenance and mobile-browser smoke.

The complete evidence checklist is
`windows-phase-4-5-acceptance.md`. Phase 4.5 stays open when any required
evidence is missing or when there is no approved safe update candidate.

## 7. What the operator must do and what the agent can do

| Action                                                    | Operator                         | Agent                                                        |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Choose the public naming and instance topology            | Required                         | Explain trade-offs                                           |
| Cloudflare account login, billing, MFA seed, security key | Required                         | Cannot safely substitute for the human                       |
| DNS record and dashboard policy review                    | Required or explicitly delegated | Can inspect/update existing scoped resources when authorized |
| WARP enrollment and device posture                        | Required                         | Can prepare the policy and verify bounded status             |
| Repository code, config schema, tests, docs               | Optional review                  | Can implement and verify                                     |
| Existing named Tunnel/Access route update                 | Optional review                  | Can apply through a scoped API connector when authorized     |
| Known-safe real update candidate and final apply approval | Required                         | Can execute only after explicit approval and checks          |
| Phase closure decision                                    | Joint                            | Must not claim CLOSED without T1–T17 evidence                |

## 8. Common reconfiguration cases

- **Hostname changed:** update DNS, the matching Access application's
  destination, the Tunnel hostname/AUD mapping, `adminHostname` or
  `remoteHostname` in the external config, then restart Bridge. A hostname
  change does not require changing the code or FQGate account.
- **Admin Access app recreated:** copy the new AUD into the external config,
  keep the old app disabled/removed only after the new route is tested, and
  verify the Tunnel's `audTag` matches the new app.
- **Team domain changed:** update the team domain, Access policy, and config;
  the Bridge then derives a different fixed certificate endpoint. Never paste
  a replacement arbitrary JWK URL.
- **Windows PC replaced:** create a separate Tunnel/token and unique pair of
  public hostnames. Do not copy the old token or assume a shared Tunnel routes
  to the intended FQGate account.
- **Same PC, ordinary human only:** omit the admin block entirely. The admin
  host is then unknown and the four maintenance operations remain local-only.
