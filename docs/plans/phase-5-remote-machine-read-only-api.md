# Phase 5 — Remote-machine read-only API design

Date: 2026-09-19

Status: **ACTIVE DESIGN — Phase 5-A CLOSED; Phase 5-B ACTIVE**

Planning baseline: `main@fe544b3a8fa25227521c68dcb08ff110ce8c6b67`.
Its GitHub Actions run `35423337596` passed after the Phase 4.5 closure
documentation update. Phase 4.5 is CLOSED.

## 1. Goal

Phase 5 adds a stable, explicitly allowlisted read-only HTTP surface for remote
software consumers while preserving the existing local-first topology:

```text
machine client
  -> separate Cloudflare Access application
  -> separate machine/API hostname
  -> existing remotely-managed Tunnel
  -> cloudflared
  -> 127.0.0.1:17282 Bridge
  -> explicit Bridge operation registry
  -> typed FQGate adapters
  -> 127.0.0.1:17281 FQGate
```

There is never an intended direct machine-client or cloudflared route to
`127.0.0.1:17281`.

## 2. Non-negotiable boundaries

- FQGate remains loopback-only, normally `127.0.0.1:17281`.
- Bridge remains loopback-only, normally `127.0.0.1:17282`.
- No catch-all reverse proxy, raw FQGate path parameter, or runtime-generated
  authorization.
- No trading, order placement/cancel, funds transfer, brokerage/account
  control, or other financial state mutation.
- `remote_machine` must be distinct from `remote_human` and
  `remote_admin`.
- A machine identity never receives QR/session, update/admin,
  `openapi.refresh`, or browser confirmation privileges.
- Cloudflare provisioning automation is Phase 6, not Phase 5.
- MCP/WebSocket streaming remains deferred to Phase 9.
- Runtime FQGate OpenAPI is evidence/description only. An upstream operation is
  non-callable until the Bridge implements, registers, documents, and tests it.

## 3. Authentication model

### 3.1 Separate hostname/application/audience

Phase 5 adds machine-specific configuration conceptually equivalent to:

```json
{
  "remoteAccess": {
    "machineHostname": "fqgate-api.example.com",
    "machineAccess": {
      "teamDomain": "your-team.cloudflareaccess.com",
      "audience": "<machine-application-aud>"
    }
  }
}
```

The machine hostname must be distinct from ordinary-human and administrator
hostnames. Host collision is a configuration error and unknown hosts fail
closed.

The service-token Client ID/Secret are **not** Bridge runtime configuration.
They are client-side Cloudflare credentials and must never be committed,
printed, persisted in acceptance artifacts, or accepted through public Bridge
request bodies.

### 3.2 Service-token claim profile is not the human claim profile

Cloudflare's current service-token documentation uses the request headers
`CF-Access-Client-Id` and `CF-Access-Client-Secret` at the Access edge and
requires a Service Auth policy. The origin receives the signed Access
application JWT in `Cf-Access-Jwt-Assertion`.

Official references:

- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

The service-token application JWT claim profile is intentionally different from
the current administrator-human verifier. At minimum require:

- RS256;
- fixed cert/JWK endpoint derived only from the configured team domain;
- exact issuer;
- exact machine application audience;
- valid `iat` / `exp` and supported temporal claims;
- `type === "app"`;
- bounded, non-empty `common_name` as the service-token machine identity;
- service-token empty-`sub` semantics;
- bounded assertion/JWK sizes, key count, cache TTL, timeout, and one bounded
  refresh on key rotation;
- fail closed on any mismatch.

The machine principal should be reduced to the minimum needed by authorization,
for example:

```text
{ kind: "machine", subject: <bounded common_name>, audience: <machine AUD> }
```

Do not make the human/admin verifier accept empty `sub`, and do not make the
machine verifier accept a human principal. Generic signature/JWK retrieval code
may be factored out, but claim-profile validation stays separate and explicit.

## 4. Phase 5-A — identity/context foundation with zero privilege (CLOSED)

Phase 5-A exists to isolate authentication correctness from API-surface design.

Required implementation:

1. extend config validation with machine hostname + machine Access metadata;
2. reject duplicate human/admin/machine hostnames and incomplete machine
   configuration;
3. add `remote_machine` request-context classification;
4. add machine-specific Access JWT verification and machine principal;
5. preserve unknown-Host and forwarded-host spoofing fail-closed rules;
6. extend registry invariants to know the new context **without adding it to
   any existing operation's `allowedContexts`**;
7. ensure machine hostname cannot render/use the human Dashboard as an
   authorization side channel;
8. add deterministic tests for the entire context × existing-operation matrix;
9. add a Windows/live Phase 5-A acceptance harness that is secret-safe.

At the Phase 5-A checkpoint, a valid service token proves identity but every
current Bridge operation is still denied. There are no Phase 5 market-data
operations yet.

## 5. Phase 5-B — real contract census and first read-only slice

Status: **ACTIVE**. Executable contract: docs/tasks/phase-5-b-live-contract-census-and-first-read-only-slice.md. Codex handoff: docs/prompts/phase-5-b-codex-goal.md.

Phase 5-A is closed, so Phase 5-B may start.

The target Windows machine under the permanent `D:\code\research`
environment is the contract authority for the running FQGate version. Before
choosing operations:

1. capture bounded metadata for the live `/openapi.json` document;
2. confirm the running FQGate version is in the validated compatibility set;
3. identify candidate read-only operations;
4. run non-mutating semantic probes with bounded inputs/results;
5. document actual request/response shapes and failure modes;
6. compare them with the public SDK/examples as secondary evidence.

Current public upstream code suggests useful candidates such as:

- symbol search;
- realtime quote;
- intraday/history bars.

These are **candidates only**. Phase 5-B must not hard-code them merely because
they appear in public examples.

Each chosen Bridge operation must define:

- Bridge-owned operation ID;
- stable public method/path;
- exact upstream method/path;
- typed request schema and validation;
- normalized response contract independent from incidental upstream envelope
  details;
- timeout, request-body and response-size bounds;
- compatibility requirement;
- sensitivity/logging/redaction rules;
- explicit `allowedContexts`;
- tests proving the route cannot select arbitrary upstream paths;
- documented proof that it does not mutate financial/brokerage state.

Start with the smallest useful slice rather than broad coverage.

## 6. Phase 5-C — filtered machine OpenAPI and remote closure

Machine-facing OpenAPI is generated from approved Bridge registry entries only.
It must never be generated as a passthrough of all runtime FQGate operations.

Required end-state evidence:

- a real service-token client can call only approved read-only Bridge
  operations through Access + Tunnel;
- wrong hostname/app/AUD/token is denied;
- human/admin identities cannot impersonate `remote_machine`;
- machine identities cannot use QR/session/update/admin/OpenAPI-refresh;
- raw/unregistered FQGate paths remain unreachable;
- FQGate and Bridge still listen only on loopback;
- new upstream paths remain denied until explicit Bridge review;
- compatibility drift fails closed.

## 7. Verification philosophy

The permanent Windows verification environment is under
`D:\code\research`. Prefer automation over operator checklists.

Every acceptance item must be classified as one of:

- `AUTO_DETERMINISTIC`;
- `AUTO_WINDOWS`;
- `AUTO_REMOTE`;
- `MANUAL_CLOUDFLARE_SETUP`;
- `MANUAL_SECRET_ENTRY`.

Anything classified manual must state the exact reason automation is outside
the current phase, the exact operator steps, the expected observable result,
and what the automation resumes validating afterwards.

Never write only “manual evidence missing”, “verify Access configuration”, or
another internal shorthand.

## 8. Phase boundaries

- Completed: Phase 5-A identity/context foundation and zero-privilege closure.
- Active: Phase 5-B contract census + first read-only slice.
- Next after 5-B closure: Phase 5-C generated machine docs + remote closure.
- Phase 6 remains Cloudflare provisioning/drift automation.
- Phase 7+ remain deferred according to the roadmap.
