# Architecture

## Goals

FQGate Remote Bridge is a Windows-first edge service that turns one local FQGate instance into a remotely reachable, authenticated, observable, and maintainable market-data endpoint without changing FQGate's local-first posture.

The bridge must absorb operational concerns that do not belong in consumers such as `turtle-value-engine`:

- FQGate installation and upgrades
- cloudflared installation and upgrades
- Cloudflare Tunnel lifecycle
- browser login flows
- health monitoring
- notifications
- upstream compatibility handling

Consumers should only see a stable provider endpoint and a small compatibility contract.

## Non-goals

- trading or brokerage operations
- generic reverse-proxying of arbitrary localhost services
- replacing Cloudflare Access with home-grown Internet authentication
- implementing a complete FQGate clone
- making FQGate a mandatory dependency of any consuming project

## Component model

```text
                           Cloudflare control plane
                          /                         \
                Tunnel configuration           Access policy
                         |                           |
                         +-------------+-------------+
                                       |
Internet client                         |
(browser / agent)                       |
       |                                |
       +-------- HTTPS / WSS -----------+
                                       |
                                cloudflared service
                                       |
                              127.0.0.1:<bridge>
                                       |
            +--------------------------+--------------------------+
            |                          |                          |
        Web/status UI             API gateway                Supervisor
            |                          |                          |
            |                    allowlisted routes      process/update/state
            |                          |                          |
            +--------------------------+--------------------------+
                                       |
                               FQGate adapter layer
                                       |
                               127.0.0.1:17281
                                       |
                                    FQGate
```

## Bridge modules

### 1. Bootstrap / installer

Windows-oriented bootstrap logic should be implemented in PowerShell with minimal responsibility:

- detect supported OS/architecture
- install application payload
- arrange startup/service/task integration
- create required directories
- call the bridge CLI for configuration and verification

Business logic should stay in TypeScript, not be duplicated in PowerShell.

### 2. FQGate manager

Responsibilities:

- read the upstream stable release manifest
- select the Windows package
- verify file size and SHA-256 before activation
- maintain `current` and `previous` binaries for rollback
- start/stop/restart the FQGate process
- verify `--version` and `/v1/market/health`
- refuse upgrades whose compatibility has not passed policy

The project should never silently trust "latest" without checksum and compatibility validation.

### 3. cloudflared manager

Responsibilities:

- detect installed version
- download and verify official cloudflared releases
- provision or adopt a remotely managed tunnel
- install/reconfigure the Windows service
- verify the connector is healthy
- support controlled rollback when a new cloudflared release causes failure

The bridge should prefer a remotely-managed tunnel token for runtime. Broad Cloudflare API credentials are setup-time credentials and should not be retained when no longer needed.

### 4. Cloudflare provisioner

Setup-time functionality:

- validate account/zone configuration
- create or adopt a named tunnel
- create/update DNS records for configured hostnames
- configure ingress toward the local bridge port
- provide enough output for the operator to create or verify Cloudflare Access policies

Where supported and stable, Access resources may also be provisioned by API. However, the project should not couple basic tunnel operation to a single Access provisioning API shape.

Recommended hostname split:

```text
fqgate.example.com      -> human status + QR login
fqgate-api.example.com  -> machine API / MCP gateway
```

A single hostname with path-based policies may be supported later, but separate hostnames keep policy reasoning simpler.

### 5. HTTP/API gateway

The gateway is **not** an unrestricted reverse proxy.

It should expose an explicit allowlist of supported upstream routes. Each route belongs to a compatibility profile and may normalize requests/responses where necessary.

Initial categories:

- health and capability discovery
- QR login begin/poll
- selected read-only market-data APIs required by consumers
- MCP endpoint only after its remote behavior and streaming requirements are validated
- WebSocket market stream only after proxy/auth behavior is validated end-to-end

Unknown paths return `404`/`403` locally even if FQGate itself would accept them.

### 6. Web UI

Minimal responsibilities:

- bridge status
- FQGate process/version/health
- cloudflared/tunnel status
- market session status
- QR login initiation/polling
- update state
- notification state

The browser never receives local filesystem credentials, Cloudflare API tokens, or service secrets.

### 7. Supervisor/state machine

Normalize many low-level observations into a small state model.

Suggested dimensions:

```text
bridge:      starting | ready | degraded | failed
fqgate:      stopped | starting | ready | unhealthy | incompatible
session:     connected | guest | login_required | login_in_progress | unknown
tunnel:      stopped | connecting | connected | degraded
updates:     idle | available | applying | rollback | failed
```

State transitions should produce events. Events feed logs, the UI, and notifier plugins.

### 8. Notification subsystem

Use a small interface rather than hard-code a vendor.

Initial provider:

- generic JSON webhook

Later adapters can target ntfy, Bark, Telegram, Feishu, WeCom, etc.

Required notification semantics:

- notify on meaningful state transitions, not every failed poll
- deduplicate repeated alerts
- recovery notification after an incident
- severity and component fields
- rate limiting / cooldown

## Windows process model

FQGate is a desktop executable and may require an interactive user session for first-use acknowledgement or future UI behavior. Therefore the plan separates components:

- `cloudflared`: Windows service
- bridge backend: preferably Windows service if no desktop dependency is discovered
- FQGate: initially launched via Task Scheduler at user logon, with restart supervision

Do not claim headless Windows-service support for FQGate until it is demonstrated experimentally.

## Local networking rule

FQGate remains on:

```text
127.0.0.1:17281
```

The bridge also binds only to loopback by default:

```text
127.0.0.1:<configured-port>
```

`cloudflared` creates outbound connections to Cloudflare, so the design should not require inbound router port forwarding or public Windows Firewall rules.

## Consumer contract

A consumer must not depend on upstream FQGate quirks directly when avoidable. The bridge should expose:

- version endpoint
- provider capability endpoint
- health endpoint
- stable error envelope for bridge-generated failures
- upstream version metadata in diagnostics

The consumer remains responsible for fallback to other market-data providers.
