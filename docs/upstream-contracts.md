# Upstream Contracts and Compatibility Baseline

This document records upstream behavior that the project may rely on. It is a compatibility ledger, not a promise that upstream behavior will remain unchanged.

Baseline date: **2026-09-17**

Historical 1.0.2 maintenance observation: **2026-09-21**. Current stable release
observation: **2026-09-30**. The Phase 5-B and 1.0.2 contracts below remain
historical; the separate 1.0.4 maintenance task closed on 2026-09-29.

## FQGate release source

Official repository:

```text
https://github.com/fqgate/FQGate-releases
```

Observed stable version at the current baseline:

```text
1.0.0
```

The current official stable manifest observed on 2026-09-30 is:

```text
version: 1.0.5
publishedAt: 2026-09-29T16:31:18Z
Windows x86_64: FQGate-1.0.5-windows-x64-UNSIGNED.exe
size: 23707648
sha256: 2b9613dbf2d0f10b1672684f2e24ac8917d2d8d3fa9bd7fbbae04d57dd73d83c
```

This release was installed after an upstream in-app update. Its compatibility
passed the separate permanent-Windows Bridge qualification on 2026-09-30;
approval remains bound to the observed artifact hash and operation evidence.
The prior official stable manifest observed on 2026-09-28 was:

```text
version: 1.0.4
publishedAt: 2026-09-24T18:52:55Z
Windows x86_64: FQGate-1.0.4-windows-x64-UNSIGNED.exe
size: 23201792
sha256: 6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290
```

These are release identity facts, not automatic compatibility approval. The
1.0.4 task qualified its own artifact before activation.

The previously observed 1.0.2 package was:

```text
version: 1.0.2
publishedAt: 2026-09-20T18:26:46Z
Windows x86_64: FQGate-1.0.2-windows-x64-UNSIGNED.exe
size: 23065088
sha256: 024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2
```

These are release identity facts from the official stable manifest, not a compatibility
approval. Its qualification task closed on 2026-09-21.

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
https://github.com/fqgate/FQGate-releases/releases/download/fqgate-v<version>/<fileName>
```

The former exact `zhuyifang/fqgate-releases` manifest path is accepted only as a
fixed compatibility alias for existing external configuration files. New
defaults and generated asset URLs use `fqgate/FQGate-releases`.

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

Phase 3 consumes only the fixed target:

```text
http://127.0.0.1:17281/openapi.json
```

The bridge validates OpenAPI 3.0/3.1 shape, records only bounded metadata in
the operator view, and computes a deterministic SHA-256 fingerprint over
canonicalized JSON. The required activation baseline is the presence of:

```text
GET  /v1/market/health
POST /v1/market/session/qr/begin
POST /v1/market/session/qr/poll
```

Unrelated new paths are surfaced as reference/diff information and do not
block activation or become Bridge routes.

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

On the permanent Windows FQGate 1.0.2 target, a live pending poll on
2026-09-23 returned `flow_id` and `status: waiting_for_scan` with no
`connected` field. The Bridge treats this exact pending status shape as
`connected: false`; an unknown status or a connected result without the
expected boolean remains invalid. This observed compatibility case does not
authorize another upstream route or a change to remote exposure policy.

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

For upstream-backed operations, the version decision is only the base lifecycle signal.
Each operation may additionally require artifact-bound compatibility evidence containing
its operation ID, approved structural fingerprint, and bounded semantic probe ID. Runtime
OpenAPI remains evidence only; it never adds an operation to the Bridge registry.

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

## cloudflared Phase 4 contract

The Phase 4 adapter treats Cloudflare's official `cloudflare/cloudflared`
GitHub release metadata as a trusted-source observation, not as an arbitrary
download service. The selected calendar-version tag is requested through the
fixed official release API path, and the only accepted Windows x64 artifact is
`cloudflared-windows-amd64.exe` at the matching official release path.

The release must identify the requested tag and publish a SHA-256 either in
the GitHub asset digest or in the release checksum body; when both are
present, they must agree. Asset size and the staged candidate's reported
`--version` are checked before activation. No user-supplied binary URL,
manifest URL, GitHub repository, or arbitrary release source is accepted.

Cloudflare documents the remotely managed Tunnel runtime form as:

```text
cloudflared tunnel run --token-file <protected-token-file>
```

Phase 4 requires a cloudflared build whose `tunnel run --help` output contains
`--token-file`. The Windows service adapter uses a fixed command shape and
keeps the raw Tunnel token in a repo-external ACL-protected file. The
published application/origin is an operator-managed Cloudflare setting and
must be exactly:

```text
http://127.0.0.1:17282
```

This project does not provision the Tunnel, DNS, Access application, or human
Allow policy through Cloudflare APIs in Phase 4.

## Source ownership and licensing

FQGate's main executable is not source code owned by this project. This repository should not vendor or redistribute the binary unless upstream licensing explicitly permits it and there is a compelling reason.

Normal installation remains:

```text
registered trusted manifest
  -> registered trusted release asset
  -> verify
  -> local install
```

## Phase 5-B live census — 2026-09-20

The permanent Windows runtime, not example endpoint names, established FQGate
1.0.1 / OpenAPI 3.1.0, 265990 bytes / 89 operations. Full canonical fingerprint:
`8abc1d0ece7c2129152aa7d65ee48d05454fc0dcd037d797225ec0b46b757e6d`.
Selected fixed POST `/v1/market/catalog/search-symbols` takes a `pattern` string
and optional `need_market`; successful envelope data contains `item_count` and
`items` with string `code`, `market`, `name`, `ths_code`. Live exact six-digit
probe returned HTTP 200 / code 0 / one item / 322 bytes. Bridge narrows the input
to a six-digit code and filters exact matches; it never exposes arbitrary search
patterns. The upstream has no declared result limit, so Bridge enforces both
64-KiB transport and 16-item parse limits, rejecting overflow.

Selected operation and transitive local schema-reference fingerprint:
`a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5`.
At the historical Phase 5-B closure, each call rechecked this fingerprint and the exact
live-validated running version 1.0.1. No updater activation gate was added at that time;
unknown later versions failed lookup closed.

Quote POST `/v1/market/realtime/quote` was observed/probed read-only (one instrument,
fixed nine fields, HTTP 200/code 0/531 bytes). Its generic nested field records
remain unexposed; no quote or bars permission is granted. Public SDK and UI
adapter commit `b949c542bc722ebe601662ba0c06c80eed9c8da8` independently corroborate
lookup/snapshot read semantics. Full evidence and bounded commands are in the
Phase 5-B handoff/Windows acceptance documents. No raw schema or market sample
is retained.

## Post-Phase-5 operation-scoped qualification for FQGate 1.0.2 — CLOSED

The closed maintenance task was
`docs/tasks/post-phase-5-fqgate-release-compatibility-and-1-0-2-refresh.md`.
Its reviewed lookup evidence is:

```text
operationId:     market.instruments.lookup
fingerprint:     a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5
semanticProbeId: market.instruments.lookup.exact-code-v1
```

The lifecycle admits an in-range but not prelisted patch only into the qualification
transaction. It must pass the existing official package/integrity/candidate checks,
health, all Bridge-required base contracts, this exact operation fingerprint, and the
fixed exact-code semantic probe before its evidence is persisted. A changed fingerprint
or failed probe rolls back automatically to the known-good artifact. New candidates may
not inherit the historical 1.0.1 compatibility bridge.

Qualification evidence contains no raw OpenAPI, market payload, credential, Access metadata,
or secret. The permanent-Windows procedure and its bounded external evidence path are in
`docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md`; closure evidence is
in `docs/status/post-phase-5-fqgate-1-0-2-implementation-handoff.md`.

## FQGate 1.0.4 qualification — CLOSED

The official manifest identifies the 1.0.4 Windows x64 candidate above. It must
remain unvalidated until the existing lifecycle qualification transaction proves
artifact integrity, required runtime contracts, the reviewed lookup fingerprint,
and the exact-code semantic probe. The active task adds only a local Dashboard
entry that invokes this same fixed-probe transaction. It does not add a Bridge
market operation or change any remote operation matrix.

The exact 1.0.4 artifact passed the permanent-Windows qualification and real
remote regression gates on 2026-09-29. Design and closed task:
`docs/plans/post-phase-5-fqgate-1-0-4-local-qualification.md` and
`docs/tasks/post-phase-5-fqgate-1-0-4-dashboard-qualification.md`.
Final evidence: `docs/status/post-phase-5-fqgate-1-0-4-implementation-handoff.md`.

## FQGate v2 observation — 2026-10-12

Latest GitHub stable is `fqgate-v2.0.4`, published `2026-10-11T05:05:34Z`.
The v1 `releases/stable.json` still declares 1.0.5. Independent v2 metadata
at upstream commit `edb17da7fca0952534a65f4cfb98a62b6a017d43` declares
refreshSequence 8, stable sequence 7 and release 2.0.4. Earlier pointers use
`update-release-signing-v1`; current pointers/releases use
`update-release-signing-v2`, freshness uses `update-freshness-signing-v2`.

Observed envelopes contain `keyId`, `signature`, `signed`. Both latter fields
use unpadded base64url; signature decodes to 64 bytes, signed decodes to UTF-8
JSON. No published algorithm, authenticated public key distribution, rotation,
revocation or exact signing/canonicalization specification was found in the
release repository or the current agent repository. A 64-byte signature is not
proof of Ed25519. Agent MCP Apps Ed25519 tooling concerns a separate artifact;
its keys cannot establish FQGate executable release trust.

Freshness claims a sequence-specific stable path and SHA-256 of its exact
**envelope bytes**. Stable claims a version-specific release path and SHA-256
of its envelope bytes. Release declares artifact bytes/hash/URLs/ZIP layout.
Observed payload JSON is compact and sorted; inspection verifies no signature
and does not reserialize payloads for cryptographic verification. Sequence
consistency within one observation does not prevent replay; authenticated
persistent high-water marks and equivocation/freshness policy are unimplemented.

Windows ZIP: `FQGate-2.0.4-windows-x64.zip`, 28,455,842 bytes,
SHA-256 `a075ec17e6c0644c7a4f02f06979afcfcdfb8f9455f2237787260f2d93ac1179`.
GitHub asset digest agrees with the release claim. installMode is
`replaceApplication`, required root entries are `FQGate.exe` and
`fqgate-updater.exe`. Official instructions require retaining the full directory.
Updater process-switch, crash and rollback semantics are undocumented here and
not executed. This package cannot use v1 replaceExecutable.

Gitee URLs are present at `qicuo/fqgate-releases`; upstream documents Gitee-first
checks with GitHub fallback. Bridge has not authenticated mirror equivalence
and registers no Gitee adapter. ZIP audit permits only the fixed GitHub URL
and one redirect to `release-assets.githubusercontent.com`.

Release notes document per-source concurrency 4, queue 128, shared queue/query
time budget (default 30s), spacing 50ms and sustained same-content limits across
5/10/20s windows. L2 displacement can retain L1 connectivity. These are publisher
claims, not verified numeric wire codes or Bridge runtime contracts. Bridge's
existing five-second lookup budget and deny-by-default operation registry remain
unchanged. No v2 live OpenAPI/session/lookup compatibility evidence is admitted.

Machine-readable distinctions and evidence: `docs/compatibility/fqgate-v1-v2.json`.
Task/design/handoff: `docs/tasks/fqgate-v2-compatibility-and-qualification.md`,
`docs/plans/fqgate-v2-observation-and-qualification.md`,
`docs/status/fqgate-v2-implementation-handoff.md`.

### Latest-source refresh — 2026-10-13

Latest official GitHub stable is now `fqgate-v2.0.5`, published
`2026-10-12T05:22:42Z`; the prior 2.0.4 observations are historical, not rewritten.
Upstream snapshot `1b56f62816b8347b871bc5a3f927148fae212eb9` declares freshness
sequence 9 and release sequence 8. Envelope schema/key IDs, required Windows
entries and replaceApplication mode match the observed 2.0.4 layout. Windows
asset `FQGate-2.0.5-windows-x64.zip` is 29,236,811 bytes, SHA-256
`c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba`.
Its notes describe CNEquity/calendar, third-party Python installation and legacy
source fallback improvements. None is exposed or executed by the Bridge.
Publisher trust and actual v2 runtime acceptance remain blocked.

### R1 signing-contract search — 2026-10-13

Live refresh still selects 2.0.5. Examined immutable publisher sources:

- [Release repository tree at 1b56f62](https://api.github.com/repos/fqgate/FQGate-releases/git/trees/1b56f62816b8347b871bc5a3f927148fae212eb9?recursive=1).
- [README](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/README.md) and [operator guide](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/使用说明.md).
- [Freshness envelope](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/freshness.json), [stable envelope](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/8/stable.json), [release envelope](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/2.0.5/release.json).
- [Publication intent](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/publications/2.0.5/intent.json), [reservation](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/publications/2.0.5/reservation.json), [recovery approval](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/publications/2.0.5/recovery-approval.json) and [in-flight publication](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/publications/in-flight.json).
- [Agent MCP Apps verifier](https://github.com/fqgate/FQGate-agent/blob/7ae0f216e5ca5d98a0808b7dae7b20da5d97f097/mcp-apps/scripts/verify-mcp-apps-release.mjs) and [release script](https://github.com/fqgate/FQGate-agent/blob/7ae0f216e5ca5d98a0808b7dae7b20da5d97f097/mcp-apps/scripts/release-mcp-apps.mjs).

These sources do not establish a release signing algorithm/input specification,
independently authenticated key root, rotation/revocation, or authenticated
persistent sequence/expiry rules for FQGate application ZIPs. Publication intent
is not a client verification contract; MCP Apps signatures concern different
artifacts. Observed decoded payload bytes/hash links are not proof of the bytes
actually signed. No release verifier is invented. The search scope is these
public sources, not a claim that private or unpublished specifications cannot
exist. Public response byte counts/hashes are retained outside Git in
`D:\code\research\fqgate-v2-r1-evidence\upstream-receipt.json`.

The decoded 2.0.5 publication intent additionally reports schemaVersion 2,
`publicationMode: manual-recovery`, `automaticAllowed: false` and
`requires_manual_upgrade: true`. Its transition simulation describes sequence
high-water comparisons but delegates signature trust to its caller. It explicitly
does not validate HTTP time, packaged validity, installation or real platform
startup, and does not authorize manual installation or removal of client security
state. This is an observed unauthenticated publisher report, not an implementation
specification or permission to bypass Bridge gates. The same pinned
[publication intent](https://github.com/fqgate/FQGate-releases/blob/1b56f62816b8347b871bc5a3f927148fae212eb9/releases/v2/publications/2.0.5/intent.json)
is the exact source; R1 preserves the stronger blocked boundary.

### R2 expanded public search

Publisher public org inventory contains FQGate-releases, FQGate-agent and
fqgate.github.io. The first two pinned R1 heads remain unchanged. Examined
[official site index](https://github.com/fqgate/fqgate.github.io/blob/c23706cedf9a70584abfafa79f8486900af9e2c5/index.html)
and [static API document](https://github.com/fqgate/fqgate.github.io/blob/c23706cedf9a70584abfafa79f8486900af9e2c5/api/openapi.json).
The static document declares OpenAPI 3.1.0 / application version 0.1.2, and has
required health/QR/lookup paths. It is historical static reference, not a running
2.0.5 census or release signing/trust specification. Current v2 signature and
qualified runtime outputs therefore remain false. Research is the agent's task;
operator key guessing/manual attestation cannot close those gates.

The R2 remote diagnosis also uses the official, fixed GET-only
[List Cloudflare Tunnel connections API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/connections/methods/get/)
with the existing Tunnel Read credential. This diagnostic is external tooling,
not a new Bridge/Cloudflare proxy or a mutation method. Evidence projects counts/
architecture/status only; no raw API replies or origin IPs are persisted.

## Exact FQGate 2.0.5 read-only adapter — 2026-10-13

The explicitly authorized adapter maps the existing local + remote_machine
lookup to fixed canonical GET `/v2/instruments/search?query=<six-digit-code>`.
It checks GET system version/health, bounded source inventory and the selected
source's read-only account snapshot. Selection requires exactly one connected
`tonghuashun` source with ready worker, safe unique ID, instance number, PID and
restart counter; zero or multiple connected sources fail closed. No caller can
select a source/account or access these upstream paths directly through Bridge.

The exact nine-file Windows 2.0.5 payload is pinned to tree SHA-256
`9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f`.
The five selected GET contracts and transitive schemas are pinned to
`3d9ca6c84a7b0cb75c3caae5eaf39cf4bb047a4c40d013202984bcad12b0ebe6`.
Native identity proves recorded PID, current executable path, creation time and
sole IPv4 127.0.0.1:17281 listener. The query rechecks payload/process, version,
contract and source/account before returning; observed changes discard results.
This cannot detect an unobservable disconnect/reconnect between samples.

HTTP work shares 5000 ms with upstream timeout headers, no retry/fallback;
identity subprocesses each allow at most 5000 ms, with bounded filesystem scans.
Search remains 65536 bytes / 16 items, strict envelope/row count/data-state/
coverage and exact-code filtering. Public response fields are unchanged; v2
instrumentId is the canonical `market:code` identity (e.g. `XSHG:600000`), while
v1 keeps its existing identifier. No source/account/session data is returned.

The permanent Windows census reconfirmed application version 2.0.5, service
availability, one connected source out of two, and exact-code search success.
This read-only compatibility boundary is independent of the unchanged v1
lifecycle range; Dashboard lifecycle/QR/update qualification can still report
v2 incompatible. It grants no install/restart/rollback authority. Missing publisher
signature and authenticated replay remain BLOCKED; fixture recovery is not proof
of real power-loss rollback. See the active task and implementation handoff.

## Historical initial 2.0.5 QR census — 2026-10-15

Actual native Windows OpenAPI uses GET/POST
`/v2/source-instances/{instance_id}/authentication`; POST discriminates
`app_qr_begin` and `app_qr_poll` (positive integer flow_id). Read-only GET on both
sources declares `app_qr`. Generic AuthenticationResult has optional data fields
and string status without an enum; published error examples do not establish
expired/replaced QR semantics. HTTP 400/code 1003 is described as invalid request,
so v1's expiry mapping cannot be assumed. Both ready tonghuashun sources support
sessions and QR; one connected source is not proof of unique QR eligibility.
No state-changing probe was used. This is observation, not operation readiness;
v2 QR remains BLOCKED_UPSTREAM_QR_CONTRACT. See the QR implementation handoff.

## Exact 2.0.5 QR/session continuation — 2026-10-15

An independent exact-artifact v2 QR adapter now supplements the v1 adapter,
using reviewed runtime OpenAPI plus the installed executable's bundled client
contract. QR operation evidence does not change global lifecycle qualification.
Only fixed authentication begin/poll actions are supported. Native instance,
account and numeric flow handles remain private; clients retain Bridge UUIDs.
Server-side optional `qrV2.instanceNumber` resolves an existing target, with
ambiguity denied and a guard preserving the current single-connected lookup.
The current operator choice is the connected target; both native records remain.

Process record/native creation, pinned payload, loopback listener, external
WebView data, contract and sampled source/worker/account continuity are checked.
No public session epoch is proven; transient changes between samples remain a
limitation. Cancellation clears local QR and polling, with no upstream revoke,
logout or source CRUD. Saved-login options are unchanged. Host/JWT/Origin/CSRF,
local/human/admin permissions and all machine QR denials remain mandatory.

Status: **IMPLEMENTED_NOT_LIVE_QUALIFIED**. Preflight is read-only; separate
approval plus exact running build is required for guarded local Live QR. Static
assets, deterministic tests, Windows fixtures and CI do not establish real login
or MFA success. Publisher signing/replay and full rollback remain unresolved.
See `docs/status/fqgate-2-0-5-qr-session-implementation-handoff.md` for contract
hashes, limits, evidence, commands and exact authorization boundaries. Shared
QR/status/lookup multi-account isolation remains a future separate task under
`docs/plans/future-multi-profile-account-isolation.md`.

The pinned bundled UI establishes pending states `waiting_for_scan` and
`waiting_for_confirmation`, positive integer `flow_id`, image/media fields,
boolean connected completion and terminal code set {1003, 3014}. Expired or
replaced normalization requires both that set and the corresponding exact
native message from the same executable. Code 1003 alone is not expiry.
The upstream UI's temporary-source create/delete workflow is not authorized
for this Bridge adapter. Actual two-account concurrent login/L2 isolation
remains untested; multiple source declarations do not prove those properties.

## MP-2 2.0.5 native continuity evidence — 2026-10-22

GET inventory/account observations and Windows CIM provide source ID/number,
worker PID/restart count and native process creation/parent metadata. The
reviewed account snapshot has display/state/session-kind/L2/saved-login fields,
not a proven non-display account identifier or login epoch. `observed_at` is
observation time. Equal samples cannot exclude A → B → A. No native multi-account,
saved-login or L1/L2 independence is inferred from two source declarations.
[Investigation and exact evidence classifications](status/fqgate-2-0-5-mp2-implementation-handoff.md).

## MP-3 exact-2.0.5 process/storage evidence — 2026-10-23

Reviewed publisher/package instructions establish ordinary desktop launch and
tray/menu exit; they do not establish independent port/data-root launch syntax.
Static EXE token presence or absence cannot authorize a flag. Current native
read-only observation sees one parent, two direct workers and one UI WebView
root inside the application directory. No second process, Source mutation,
saved-login restoration or account experiment ran. Independent process/port/
complete storage and session isolation remain UNKNOWN; production integration
is NO-GO. See the [MP-3 evidence inventory](status/fqgate-2-0-5-mp3-feasibility-handoff.md).

## MP-4 exact Native Source clarification — 2026-10-23

The [version-pinned evidence matrix](plans/fqgate205-mp4-native-source-contract.md)
separates bundled-client Source/account action vocabulary and L2 notice rendering
from unproven server identity/epoch, persistence and isolation semantics. Fresh
GET schema/Source observations do not qualify multi-account operation. Supported
independent ports and all storage/IPC roots remain UNKNOWN. No native mutation
or upstream message was sent. **LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.
