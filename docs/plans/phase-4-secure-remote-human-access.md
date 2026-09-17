# Phase 4 Design — Secure Remote Human Access

Status: **CLOSED / implementation and live acceptance complete**

## Goal

Phase 4 turns the proven loopback-only operator experience into a remotely reachable **human** experience through Cloudflare Tunnel + Cloudflare Access, without exposing FQGate itself and without prematurely opening the machine/read-only market-data API planned for Phase 5.

Target topology:

```text
remote browser
    |
    v
Cloudflare Access (human policy)
    |
    v
Cloudflare Tunnel / remotely-managed tunnel
    |
    v
cloudflared Windows service
    |
    v
http://127.0.0.1:17282   bridge / Dashboard
    |
    +-> request-context + operation exposure gate
    |
    +-> explicitly registered bridge services
    |
    v
http://127.0.0.1:17281   FQGate
```

There is never an intended `cloudflared -> 127.0.0.1:17281` route.

## Core design decision: the Tunnel does not expose the whole local control plane

Phase 3 correctly modeled all operations as `local_only`. Phase 4 must evolve that model instead of turning the whole bridge into a public application.

Every bridge operation must have an explicit exposure policy. Phase 4 introduces a remote-human context and allows only the operations needed by the authenticated operator experience.

Intended Phase 4 exposure matrix:

| Operation             | Local | Remote human | Reason                            |
| --------------------- | ----: | -----------: | --------------------------------- |
| `bridge.version`      |   yes |          yes | diagnostics/UI                    |
| `bridge.capabilities` |   yes |          yes | diagnostics/UI                    |
| `bridge.status`       |   yes |          yes | Dashboard status                  |
| `session.qr.begin`    |   yes |          yes | human login workflow              |
| `session.qr.poll`     |   yes |          yes | human login workflow              |
| `updates.status`      |   yes |          yes | read-only operational visibility  |
| `updates.check`       |   yes |       **no** | local maintenance only in Phase 4 |
| `updates.plan`        |   yes |       **no** | local maintenance only in Phase 4 |
| `updates.apply`       |   yes |       **no** | mutating local maintenance        |
| `openapi.catalog`     |   yes |          yes | reference-only docs               |
| `openapi.refresh`     |   yes |       **no** | explicit local maintenance        |

Phase 4 adds no `market-read` operations. They remain Phase 5.

## Request-context model

### Local requests

A local request is one whose effective request Host is one of the explicitly accepted loopback forms for the configured bridge port.

Do not derive local/remote status from source IP alone, because in a Tunnel deployment every origin request comes from local `cloudflared`.

### Remote-human requests

A remote-human request must satisfy all of the following:

1. effective Host equals the one configured remote human hostname;
2. Cloudflare Access protection is enabled for that hostname;
3. the origin request contains the expected Cloudflare Access assertion header;
4. the requested operation is explicitly exposed to `remote_human`.

Any unknown Host is rejected. `X-Forwarded-Host` and related forwarding headers are not trusted to select request context.

The bridge-side Access assertion check is deliberately limited to defense-in-depth/drift detection in Phase 4. Cryptographic Access JWT validation is delegated to `cloudflared` using Cloudflare's **Protect with Access** origin setting for the published application. Do not implement a competing full authentication stack unless Cloudflare's supported mechanism proves insufficient.

## Cloudflare Tunnel model

Use a **remotely-managed Tunnel** in Phase 4.

The operator creates/selects the Tunnel, public hostname, and human Access application in Cloudflare before running the local setup. Automated Cloudflare API provisioning is explicitly deferred to Phase 6.

Required published application origin:

```text
http://127.0.0.1:17282
```

Never configure the Tunnel origin to the FQGate port.

## cloudflared lifecycle and supply chain

Introduce a framework-agnostic cloudflared manager with responsibilities analogous to the FQGate lifecycle layer but narrower for Phase 4:

- detect installed `cloudflared` and version;
- obtain a selected official Cloudflare release from a fixed registered source;
- reject arbitrary executable/download URLs;
- validate artifact identity and published SHA-256/integrity information before activation;
- stage binary replacement safely;
- create/update/remove the Windows service through a narrow Windows integration layer;
- expose bounded status/diagnostic information to the local operator UI/CLI;
- never auto-update in the background.

Do not reuse the FQGate release manifest model if it makes Cloudflare-specific integrity verification less clear; a shared download primitive is acceptable, but release-source semantics should remain provider-specific.

## Tunnel token handling

Adopt a pre-created Tunnel token. Do not ask for a Cloudflare Global API Key or broad API token in Phase 4.

Preferred Windows service invocation:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Use a `cloudflared` version supporting `--token-file` for remotely-managed Tunnels.

Security requirements:

- token file lives outside the repository and normal project config;
- token file ACL permits only the intended Windows service identity/administrators needed for operation;
- raw token never appears in Windows service command line, logs, diagnostics bundles, Dashboard state, history, or tests;
- setup input may accept the token only as an ephemeral secret value or a path to a protected operator-created secret file;
- if setup writes the protected file, write it atomically and immediately restrict ACLs;
- failure to establish restrictive storage is a blocking error, not a warning.

The exact service account can follow the official/default cloudflared Windows service model as long as the token-file ACL matches it and acceptance verifies the result.

## Access policy model

Phase 4 uses one human-facing self-hosted Access application for the Dashboard hostname.

The operator must configure an Allow policy appropriate for their identity provider/account. This repository must not hard-code a particular email, IdP, or organization policy.

The setup/runbook must require **Protect with Access** on the Tunnel's published application/origin settings so `cloudflared` validates the Access JWT before forwarding the request to the bridge.

Phase 4 must verify both edges of the boundary:

- unauthenticated browser request is blocked/challenged by Access;
- authenticated human request reaches only operations allowed by bridge `remote_human` policy.

## UI behavior

The same React/TanStack UI may be used locally and remotely, but components must be context-aware.

Remote-human UI:

- Dashboard/status: enabled;
- QR login: enabled;
- update status: visible/read-only;
- update check/plan/apply controls: disabled or omitted with clear "local maintenance only" explanation;
- API Reference catalog: visible/reference-only;
- OpenAPI refresh control: disabled or omitted;
- no market-data client UI is introduced in Phase 4.

Do not rely only on hiding buttons. Server operation exposure remains authoritative.

## Implementation note

The current code implements this design without adding a second transport or
frontend. `src/server.ts` applies the Host/assertion gate to page/static
requests and `src/bridge/transport/http.ts` applies it again before operation
dispatch. The operation registry uses `local_and_remote_human` for exactly the
seven approved operations and `local_only` for update check/plan/apply and
OpenAPI refresh.

The cloudflared manager has a fixed Cloudflare GitHub release API/asset
contract, release identity and SHA-256 checks, explicit/manual activation,
repo-external protected token-file handling, and a narrow Windows `sc.exe`
adapter. It has no Cloudflare API provisioning path and no background updater.
The implementation and the real Windows/Cloudflare edge and reconnect
acceptance are complete. The bounded evidence is recorded in the Phase 4
acceptance runbook and implementation handoff. A stronger remote-administrator
policy and mobile Dashboard UI optimization remain separate future planning
items and are not part of this design.

## Diagnostics

Add bounded cloudflared/tunnel diagnostics suitable for Phase 4:

- cloudflared installed version;
- Windows service installed/running state;
- configured remote hostname (not secret);
- Tunnel connectivity status where safely observable;
- bridge/FQGate listener checks;
- Access-protection self-test result category without storing cookies/assertions;
- remote/local operation policy summary.

Never emit the Tunnel token, Access assertion, cookies, QR payload, FQGate session material, or authorization headers.

## Failure behavior

- Unknown remote Host: reject.
- Remote Host without Access assertion: reject.
- Access-protected remote operation marked local-only: reject (prefer 403-style normalized error).
- Tunnel disconnected: local Dashboard/FQGate remain usable.
- cloudflared missing/incompatible: fail setup/diagnostics without changing bridge listeners.
- bad release checksum: do not activate the candidate.
- token file missing/unreadable/insecure: do not start/reconfigure service.

## Testing strategy

CI uses fakes and fixtures and must not require Cloudflare credentials.

Minimum deterministic coverage:

- Host-based local/remote classification;
- unknown Host rejection;
- `X-Forwarded-Host` spoofing has no effect;
- remote Host missing Access assertion rejected;
- remote-human operation matrix;
- update check/plan/apply and OpenAPI refresh denied remotely;
- same maintenance operations continue to work locally;
- raw/unregistered FQGate routes still 404/deny;
- Access assertion/Tunnel token redaction;
- cloudflared trusted source and checksum success/failure;
- arbitrary cloudflared URL rejected;
- service command uses token-file path and contains no raw token;
- existing Phase 2/3 regression suite remains green.

## Windows acceptance

Phase 4 cannot close from fixture tests alone. On the supported Windows x64 host with real Cloudflare resources:

1. verify bridge exactly on `127.0.0.1:17282` and FQGate exactly on `127.0.0.1:17281`;
2. install/start the supported cloudflared Windows service with protected token-file handling;
3. verify service/process command metadata contains no raw Tunnel token;
4. verify the published hostname routes only to the bridge;
5. verify unauthenticated browser access is challenged/denied by Access;
6. authenticate as the intended human user and use Dashboard/status;
7. run a QR begin/poll flow when safe without forcing destructive logout;
8. verify remote update check/plan/apply and OpenAPI refresh are denied;
9. verify remote raw/unregistered upstream paths remain unreachable;
10. verify local-only maintenance still works through loopback;
11. restart the cloudflared service and verify reconnect without changing bridge/FQGate listeners.

Do not record tokens, Access assertions, cookies, QR data, full session IDs, or private identity details in the acceptance evidence.

## Non-goals

- remote machine market-data API and service-token auth (Phase 5);
- Cloudflare API provisioning/drift management (Phase 6);
- supervisor/notifications (Phase 7);
- automatic updates (Phase 8);
- MCP/WebSocket (Phase 9);
- final packaging (Phase 10);
- any trading/state-changing financial capability.
