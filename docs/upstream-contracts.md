# Upstream Contracts and Compatibility Baseline

This document records the upstream behavior that the project may rely on. It is a compatibility ledger, not a promise that upstream behavior will remain unchanged.

Baseline date: **2026-09-16**

## FQGate release source

Official repository:

```text
https://github.com/zhuyifang/fqgate-releases
```

Observed stable version at the baseline date:

```text
1.0.0
```

The official stable manifest is:

```text
releases/stable.json
```

Observed useful fields:

- `version`
- `publishedAt`
- `status`
- `packages[].platform`
- `packages[].architecture`
- `packages[].fileName`
- `packages[].size`
- `packages[].sha256`

The Windows package is distributed as an executable and can be selected by platform/architecture from the manifest.

## Local address

FQGate is documented and implemented as a local-first service using:

```text
127.0.0.1:17281
```

The bridge must not assume that FQGate itself is designed for direct remote exposure.

## Known health contract

Observed endpoint:

```http
GET /v1/market/health
```

Observed useful response fields include:

```text
status
network_ready
connected
level2_permission
login_method
reason
active_subscriptions (observed in tests/diagnostics)
```

The exact response schema must be probed and contract-tested rather than copied blindly.

## Known QR login contract

Observed begin endpoint:

```http
POST /v1/market/session/qr/begin
Content-Type: application/json

{
  "cache_credentials": false
}
```

Observed response fields:

```text
flow_id
qr_image_base64
qr_media_type
status
```

Observed statuses include:

```text
waiting_for_scan
waiting_for_confirmation
```

Observed poll endpoint:

```http
POST /v1/market/session/qr/poll
Content-Type: application/json

{
  "flow_id": <number>
}
```

Observed successful result includes:

```text
connected
login_method
```

Observed upstream error codes `1003` and `3014` have been treated by the public plugin as QR flow expiration/replacement conditions. The bridge should translate these through a compatibility adapter rather than expose undocumented assumptions directly to clients.

## SMS login

The public plugin also exposes an SMS flow:

```text
POST /v1/market/session/sms/begin
POST /v1/market/session/sms/send-code
POST /v1/market/session/sms/complete
```

SMS login is **not required for the first milestone**. QR login is simpler, safer, and sufficient for the initial remote-login goal.

## MCP

Observed local endpoint:

```text
http://127.0.0.1:17281/mcp
```

The public installation logic deliberately validates that the configured MCP URL is loopback-local. Therefore remote MCP support in this project must be treated as an adaptation layer, not as a documented upstream deployment mode.

Before remotely exposing MCP, implementation must validate:

- transport mode and connection lifetime
- request/response timeouts
- streaming behavior
- Cloudflare Tunnel compatibility
- Cloudflare Access machine authentication
- whether Host/Origin or other local assumptions matter
- whether route-level allowlisting can be retained without turning the bridge into an unrestricted proxy

## WebSocket stream

Observed stream path:

```text
/v1/market/stream
```

The public plugin builds `ws://`/`wss://` URLs from the configured FQGate base URL and uses the stream for real-time order-flow/quote-related data.

Remote WebSocket support is not part of the minimum first remote API milestone. It should be enabled only after end-to-end tests through Cloudflare Tunnel and Access succeed.

## Existing upstream installer logic worth reusing conceptually

The public `tonghuasun-agent` installer already demonstrates a useful FQGate update sequence:

1. read compatibility/release metadata;
2. fetch stable manifest;
3. choose package for native architecture;
4. compare installed checksum;
5. download when replacement is needed;
6. verify expected size;
7. verify SHA-256;
8. validate `fqgate --version`;
9. stop the active FQGate process;
10. preserve a previous binary;
11. replace the executable;
12. start FQGate;
13. poll `/v1/market/health`.

Our implementation should follow the same safety properties while remaining independent code.

## Version policy

The bridge should maintain an explicit compatibility policy, for example:

```text
supported:      >=1.0.0 <2.0.0
validated:      [specific versions tested in CI/manual acceptance]
pinned:         optional operator-selected version
autoUpdate:     off | patch | compatible | latest
```

Default recommendation for the first production-capable release:

```text
autoUpdate = compatible
```

where an update is downloaded automatically but only activated when it satisfies the project's compatibility policy and activation probes.

## Fail-closed rule

If the running FQGate version is unknown or an expected contract probe fails:

- local diagnostics remain available;
- updater/recovery functions remain available;
- unsupported remote data routes fail closed;
- status reports `incompatible` or `degraded`;
- the bridge must not fall back to transparent proxying.

## Source ownership and licensing

FQGate's main executable is not source code owned by this project. This repository should not vendor or redistribute that binary unless upstream licensing explicitly permits it and there is a compelling reason to do so.

The normal installation model is always:

```text
official upstream manifest -> official upstream release asset -> verify -> local install
```
