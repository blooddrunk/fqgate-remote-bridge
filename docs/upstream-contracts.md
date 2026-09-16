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

The live official manifest was rechecked on **2026-09-16**. It remains published on the stable channel and reports `schemaVersion: 1`, `component: "fqgate"`, `minimumSupportedVersion: "0.1.0"`, and a Windows x64 package with `installMode: "replaceExecutable"`.

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

The current manifest does not contain an asset URL field. The official release layout observed on the upstream release page is therefore represented by the release adapter as:

```text
https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v<version>/<fileName>
```

For the current package this resolves to `FQGate-1.0.0-windows-x64-UNSIGNED.exe`, with exact size `22921728` bytes and SHA-256 `d2227dcf0c48f0bc428e3bfece444ba52a6938981d1ba143489be46a6add33c8`. The upstream release page labels this Windows artifact **UNSIGNED**; checksum, candidate identity, and compatibility validation are mandatory before activation.

## Local address

FQGate is documented and implemented as a local-first service using:

```text
127.0.0.1:17281
```

The bridge must not assume that FQGate itself is designed for direct remote exposure.

## FQGate HTTP response envelope

The observed normal FQGate HTTP response wire format is an envelope shared by
the local API adapters:

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

The current upstream `tonghuasun-agent` HTTP client uses envelope mode by
default and accepts only numeric `code === 0` as a successful response. A
non-zero code is an upstream API error; its `data` is not endpoint data. The
`message` is a string and may be retained only after redaction and length
bounding. Additional envelope fields may be added upstream and are ignored by
this Phase 0/1 boundary. This observation is based on the upstream client
implementation as checked on **2026-09-16**:
[`FqgateHttpClient.ts`](https://github.com/zhuyifang/tonghuasun-agent/blob/main/AI-plugins/ui-apps/src/adapters/local-api/FqgateHttpClient.ts).

For the health adapter, the boundary is explicitly:

```text
wire response envelope
        ↓
envelope decoder
        ↓
health data object
        ↓
normalized HealthObservation
```

The decoder rejects a non-object envelope, missing or invalid `code`/`message`
fields, missing or null `data` on the successful path, and non-zero upstream
codes. The health normalizer then validates that `data` is a health object.
Therefore HTTP 2xx, envelope success, and valid health data remain separate
checks; a bare health object is not accepted as a successful wire response.

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

These fields are inside the successful envelope's `data` object. The exact
data schema must be probed and contract-tested rather than copied blindly.

A live loopback probe observed on **2026-09-16** returned a successful envelope
with `data.status: "ok"`, `network_ready: true`, `connected: true`,
`login_method: "formal"`, `level2_permission: false`, and
`active_subscriptions: 0`. Account identifiers, user identifiers, remote
endpoints, and other session material are intentionally not recorded here.

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
