# Upstream Contracts and Compatibility Baseline

This document records upstream behavior that the project may rely on. It is a compatibility ledger, not a promise that upstream behavior will remain unchanged.

Baseline date: **2026-09-17**

## FQGate release source

Official repository:

```text
https://github.com/zhuyifang/fqgate-releases
```

Observed stable version at the current baseline:

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

The Windows package is selected by platform/architecture from the manifest.

The manifest does not currently contain an asset URL field. The release adapter therefore represents the observed official layout as:

```text
https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v<version>/<fileName>
```

For the current Windows x64 package, the baseline previously recorded exact size and SHA-256 in repository history/tests. Treat these values as version-specific observations rather than permanent constants.

The Windows artifact is unsigned; checksum, candidate identity/version, and compatibility validation are mandatory before activation.

## Release-source policy

Current trusted source:

```text
github
```

It is a code-registered source tied to the official repository and known manifest/release layout.

A future `gitee` source is allowed only as a separate fixed adapter after an exact trusted upstream mirror repository/path/schema contract is verified and documented. Do not invent a mirror URL and do not accept arbitrary source URLs from Dashboard/CLI input.

## Local address

FQGate is documented and implemented as a local-first service using:

```text
127.0.0.1:17281
```

The bridge must not assume that FQGate itself is designed for direct remote exposure.

## Runtime API documentation / OpenAPI

The public upstream `tonghuasun-agent` project documents the local API documentation page as:

```text
http://127.0.0.1:17281/docs
```

The same upstream project and its Python SDK also use:

```text
http://127.0.0.1:17281/openapi.json
```

The Python SDK explicitly states that complete parameters and return fields should follow the **running** `/openapi.json` document. It also demonstrates using that path for unknown/new interfaces.

Therefore the bridge adopts this rule:

> The running FQGate `/openapi.json` is the preferred source of truth for the upstream API catalog and structural compatibility observations.

Important limitations:

- this is an observed upstream contract, not a guarantee that the path/schema will never change;
- the document is untrusted structured input and must be bounded/validated;
- schema discovery is descriptive only and must never authorize routes;
- endpoint-specific runtime parsing and semantic probes remain necessary;
- a new path appearing in OpenAPI remains denied by the bridge until explicitly implemented/registered.

The Phase 3 implementation should record live Windows evidence such as OpenAPI version, byte count, operation count, and deterministic fingerprint without committing sensitive/unnecessarily complete runtime dumps.

## FQGate HTTP response envelope

The observed normal FQGate HTTP response wire format for market API adapters is:

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

The public `tonghuasun-agent` HTTP client uses envelope mode by default and accepts numeric `code === 0` as success. A non-zero code is an upstream API error; its `data` must not be interpreted as normal endpoint data.

The `message` is a string and may be retained only after redaction/length bounding. Additional fields may appear and should generally be ignored unless explicitly needed.

For endpoint adapters, keep this boundary explicit:

```text
wire response envelope
        ↓
envelope decoder
        ↓
endpoint data object
        ↓
typed normalizer
```

HTTP 2xx, envelope success, and endpoint schema validity are separate checks.

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
active_subscriptions
```

These fields are inside the successful envelope's `data` object.

A prior Windows x64 live acceptance observed both connected and not-yet-authenticated states while the FQGate process itself was healthy. Optional null session-related values must therefore be treated as unknown/session-not-ready rather than malformed.

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

Observed pending statuses include:

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

Observed upstream error codes `1003` and `3014` have been treated by the public plugin as QR flow expiration/replacement conditions.

The bridge must keep the upstream numeric `flow_id` server-side and expose only a bridge-owned opaque session ID.

## SMS login

The public plugin also exposes an SMS flow:

```text
POST /v1/market/session/sms/begin
POST /v1/market/session/sms/send-code
POST /v1/market/session/sms/complete
```

SMS login is not required for the current roadmap milestones. QR remains the preferred initial remote login flow.

## MCP

Observed local endpoint:

```text
http://127.0.0.1:17281/mcp
```

The public installation logic deliberately validates that the configured MCP URL is loopback-local. Remote MCP support must therefore be treated as an adaptation layer, not as a documented upstream deployment mode.

Before any remote MCP exposure, implementation must validate transport lifetime, timeout/stream behavior, Cloudflare compatibility, machine authentication, origin/host assumptions, and policy preservation.

MCP is deferred to the later protocol-compatibility phase.

## WebSocket stream

Observed stream path:

```text
/v1/market/stream
```

The public plugin builds `ws://`/`wss://` URLs from the configured FQGate base URL for real-time market data.

Remote WebSocket support is deferred until end-to-end Tunnel + Access behavior and bridge policy can be preserved reliably.

## Existing upstream installer logic worth reusing conceptually

The public `tonghuasun-agent` installer demonstrates useful safety properties:

1. read compatibility/release metadata;
2. fetch stable manifest;
3. choose package for native architecture;
4. compare installed checksum;
5. download when replacement is needed;
6. verify expected size;
7. verify SHA-256;
8. validate `fqgate --version`;
9. stop active FQGate;
10. preserve previous binary;
11. replace executable;
12. start FQGate;
13. poll `/v1/market/health`.

The bridge implementation remains independent code but should preserve these safety properties.

Phase 3 extends activation with:

14. fetch/validate runtime `/openapi.json`;
15. verify bridge-required path/method structural contracts;
16. retain endpoint-specific semantic probes;
17. roll back if required compatibility cannot be established.

Unrelated newly-added upstream operations should be surfaced for review, not automatically treated as activation failure or authorization.

## Version policy

The bridge should maintain an explicit compatibility policy, conceptually:

```text
supported:      >=1.0.0 <2.0.0
validated:      [specific versions tested]
pinned:         optional operator-selected version
autoUpdate:     off | patch | compatible | latest
```

For Phase 3 the effective policy remains:

```text
autoUpdate = off
```

Dashboard and CLI may perform explicit checks/plans/applies, but no page load, startup, or background timer may silently activate an update.

## Fail-closed rule

If the running FQGate version is unknown, runtime OpenAPI cannot be validated, or a required contract probe fails:

- local diagnostics remain available;
- updater/recovery functions remain available;
- affected bridge operations fail closed;
- status reports an incompatible/degraded condition;
- the bridge must not fall back to transparent proxying.

## Source ownership and licensing

FQGate's main executable is not source code owned by this project. This repository should not vendor or redistribute the binary unless upstream licensing explicitly permits it and there is a compelling reason.

Normal installation remains:

```text
registered trusted manifest
  -> registered trusted release asset
  -> verify
  -> local install
```
