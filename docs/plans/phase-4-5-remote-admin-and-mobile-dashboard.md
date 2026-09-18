# Phase 4.5 Design — Remote Administrator Hardening and Mobile Dashboard

Date: 2026-09-17

Status: **IN PROGRESS / 4.5A, 4.5B, and 4.5C implemented; live acceptance open**

This phase is a new post-Phase-4 phase. It does **not** reopen Phase 4 and it does not authorize Phase 5 market-data APIs. Phase 4 remains CLOSED with its existing `remote_human` surface unchanged.

The purpose of Phase 4.5 is to resolve two deferred items before the repository expands to remote machine consumers:

1. design and implement a **separate remote-administrator security boundary** for a very small set of existing maintenance operations; and
2. make the existing React/TanStack Dashboard usable on phones and narrow screens without creating a second frontend or weakening server-side authorization.

The default implementation order is:

```text
Phase 4 CLOSED
  -> Phase 4.5A policy/authentication foundation (no privilege expansion)
  -> Phase 4.5B mobile Dashboard optimization (no privilege expansion)
  -> Phase 4.5C remote-admin operations + second confirmation + live acceptance
  -> Phase 5 remote-machine read-only market-data API
```

Phase 4.5B is functionally independent of Phase 5. Phase 5 should nevertheless wait until at least the Phase 4.5A policy model is stable, so machine authentication can be added as a new context instead of forcing another authorization refactor.

---

## 1. Baseline that must not change

The following Phase 4 decisions remain non-negotiable throughout Phase 4.5:

- FQGate remains IPv4-loopback-only, normally `127.0.0.1:17281`.
- Bridge remains IPv4-loopback-only, normally `127.0.0.1:17282`.
- No router port-forward, LAN listener, WAN listener, or direct Internet exposure is added.
- `cloudflared` routes only to the Bridge loopback origin, never to FQGate.
- Cloudflare Access authenticates remote clients; Bridge authorization remains authoritative after Access succeeds.
- Unknown Host values fail closed and forwarding headers do not select privilege.
- Runtime FQGate OpenAPI remains descriptive only and cannot authorize operations.
- No catch-all reverse proxy, arbitrary upstream path, or raw upstream `Try it out` path is added.
- Trading, order placement/cancellation, fund transfer, brokerage control, or any comparable financial state-changing operation remains forbidden.
- Tunnel tokens, Access assertions, QR payloads, session material, credentials, and confirmation secrets must not enter Git, normal logs, browser persistence, or diagnostics.
- Phase 4 `remote_human` behavior remains backward-compatible unless a separately reviewed security fix requires otherwise.

Phase 4 remote-human operations remain exactly:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
openapi.catalog
```

The following are still local-only at the start of Phase 4.5:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

No Phase 4.5 subphase may expose these remotely before Phase 4.5C and its confirmation policy are complete.

---

## 2. Why the current policy model must evolve before Phase 5

The current implementation has two request contexts:

```text
local
remote_human
```

and an exposure enum shaped around those two contexts:

```text
local_only
local_and_remote_human
```

That was intentionally sufficient for Phase 4, but it will become brittle once the system has three distinct remote identities:

```text
remote_human   -> ordinary browser operator, Phase 4 read/session surface
remote_admin   -> strongly authenticated human, narrowly scoped maintenance surface
remote_machine -> Phase 5 software client, read-only market-data surface
```

Phase 4.5A should therefore move policy toward orthogonal concepts rather than adding more combination names such as `local_remote_human_and_admin`.

The exact TypeScript shape is implementation-defined, but the policy must represent at least:

- request context / caller class;
- allowed contexts for each operation;
- operation intent/risk classification;
- whether an operation requires an explicit admin confirmation grant;
- sensitivity/logging policy;
- compatibility requirements and documentation visibility.

Conceptually:

```text
request Host
   + remote authentication evidence
   -> RequestContext
      { local | remote_human | remote_admin | later remote_machine }

Bridge operation registry
   -> allowed contexts
   -> confirmation requirement
   -> dispatch only after both checks pass
```

UI visibility is never an authorization mechanism.

---

## 3. Phase 4.5A — policy and authentication foundation

Implementation checkpoint: **complete without privilege expansion**.

### 3.1 Goal

Create a distinct `remote_admin` request context and stronger authentication verifier **without yet granting any existing local-admin operation to it**.

At the end of 4.5A, a correctly authenticated admin hostname may render the same safe surfaces as an ordinary remote human, but the current local-only maintenance operations must still be rejected remotely. This gives the security model a safe intermediate checkpoint.

### 3.2 Separate admin hostname and Access application

Remote administration must use a hostname distinct from the Phase 4 human hostname, for example conceptually:

```text
human:  fqgate.example.com
admin:  fqgate-admin.example.com
```

Both may terminate through the same remotely-managed Tunnel and both still target exactly:

```text
http://127.0.0.1:17282
```

However they must be separate Cloudflare Access applications/policies with distinct application audience (`AUD`) values.

The Bridge configuration should add only non-secret metadata required to validate the admin application, conceptually:

```text
remoteAccess.remoteHostname
remoteAccess.adminHostname
remoteAccess.adminAccess.teamDomain
remoteAccess.adminAccess.audience
```

Requirements:

- admin hostname must not equal the ordinary remote-human hostname;
- neither remote hostname may be a loopback form;
- `teamDomain` and `audience` are non-secret configuration;
- do not accept an arbitrary JWKS URL; derive the fixed Access cert endpoint from the configured Cloudflare team domain;
- admin configuration is optional and disabled by default;
- absence or invalidity of admin configuration fails closed and must not change the existing Phase 4 hostname behavior.

### 3.3 Stronger edge policy for the admin Access application

The admin Access application should be human-only and materially stronger than the ordinary Phase 4 policy.

Required policy intent:

- explicit intended human identity allowlist/group;
- independent MFA or an equivalent Access-enforced MFA requirement;
- an enforceable device requirement, preferably a Cloudflare-managed client
  certificate/mTLS association plus Windows OS posture for Posture-only
  deployments; full WARP or Gateway posture may be used when the operator
  intentionally accepts traffic tunneling;
- short policy/application session duration appropriate for administration;
- `Protect with Access` enabled for the Tunnel published application;
- no `Bypass` rule that reaches the admin hostname;
- no `Service Auth` policy on the admin application;
- no reuse of the future Phase 5 machine credential policy.

Cloudflare currently documents the relevant building blocks here:

- Access policies: <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>
- independent MFA: <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/>
- session management: <https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/>
- WARP posture check: <https://developers.cloudflare.com/cloudflare-one/reusable-components/posture-checks/client-checks/require-warp/>
- Posture-only mode and client certificate: <https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/modes/device-information-only/>
- Hostname mTLS association: <https://developers.cloudflare.com/ssl/client-certificates/enable-mtls/>

The exact device-posture profile is operator-configurable because this is a personal Windows-first deployment, but the admin application must have at least one enforceable device restriction before Phase 4.5C can close.

### 3.4 Bridge-side cryptographic verification for remote-admin requests

Phase 4 intentionally uses `Cf-Access-Jwt-Assertion` presence as defense-in-depth because Tunnel `Protect with Access` performs primary validation. Remote administration has a higher risk level and needs a stronger origin-side contract.

For `remote_admin` requests, Bridge should additionally validate the Access JWT cryptographically:

- read only `Cf-Access-Jwt-Assertion`;
- validate RS256 signature against Cloudflare Access account signing keys;
- validate exact issuer/team domain;
- validate exact admin application audience;
- validate temporal claims through the JWT library;
- select keys by `kid` and support Cloudflare key rotation;
- use a bounded cached remote JWKS fetched only from the fixed team-domain cert path;
- bounded fetch timeout/size and fail closed when a required key cannot be validated;
- never log or echo the token;
- do not persist the token;
- derive only the minimal authenticated principal data needed for authorization/confirmation binding.

Cloudflare documents origin validation here:

<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>

The preferred implementation should use a maintained JWT/JWK library rather than custom cryptography.

The ordinary Phase 4 `remote_human` flow does not have to be migrated to cryptographic Bridge-side validation in this phase. Avoid turning that optional hardening into a hidden compatibility regression.

### 3.5 Admin principal representation

A verified admin request should carry a minimal server-side principal representation sufficient to bind later confirmation grants.

Conceptually:

```text
kind: human
subject: stable Access subject identifier
applicationAudience: admin AUD
```

Email/display identity may be used for UI display only if needed, but normal logs should prefer a redacted/stable principal fingerprint rather than full identity data. No raw JWT claims blob should be propagated through application code.

### 3.6 4.5A authorization checkpoint

At the end of 4.5A:

- `local` retains all existing local permissions;
- `remote_human` retains exactly the Phase 4 matrix;
- `remote_admin` is recognized only after strong admin JWT verification;
- `remote_admin` may use the same safe Phase 4 human operations;
- `updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh` **still fail remotely**;
- no market-data route exists;
- no Phase 5 service token exists.

This is a required checkpoint before privilege expansion.

---

## 4. Phase 4.5B — mobile Dashboard optimization

### 4.1 Goal

Optimize the existing React 19 / TanStack Start / Tailwind / shadcn UI for phone and narrow-screen use without changing capabilities or creating a second frontend.

This work is intentionally separated from remote-admin privilege expansion. A UI regression must not be able to change server authorization.

### 4.2 Pages in scope

The same existing routes remain authoritative:

```text
/
/login
/updates
/api-reference
```

No `/mobile`, native app, PWA, or duplicated route tree is required.

### 4.3 Mobile UX requirements

At minimum:

- support narrow widths down to approximately 360 CSS px without horizontal page overflow;
- preserve desktop/tablet layouts at larger widths;
- replace wide desktop navigation with a compact mobile navigation pattern using the existing component system;
- make status cards stack cleanly and keep the highest-priority state visible without excessive scrolling;
- keep QR content fully visible inside the viewport and large enough to scan;
- make buttons and interactive controls touch-friendly, with roughly 44x44 CSS-pixel target sizing where practical;
- avoid hover-only affordances;
- make long IDs, hashes, URLs, code snippets, and API reference material wrap or scroll inside bounded containers rather than widening the page;
- convert tables that are unusable on phones into stacked/key-value presentation or bounded horizontal scroll as appropriate;
- preserve clear local/remote-human/admin context messaging;
- remote-human `/updates` must continue to show read-only status/local-maintenance guidance, not working admin buttons;
- admin controls added later by 4.5C must fit the same responsive shell and use a deliberate confirmation surface suitable for touch;
- support safe-area insets and mobile browser viewport behavior where applicable;
- keep keyboard/focus behavior usable and semantic labels intact.

### 4.4 Mobile security invariants

Responsive rendering must not:

- decide authorization from screen width, user agent, or client-only hostname logic;
- expose a hidden local-admin server function;
- cache QR/session secrets in browser storage;
- weaken CSP/CORS/security headers;
- load upstream FQGate docs in an executable iframe;
- create a second client API that bypasses the Bridge operation registry.

The UI should consume server-provided capabilities/context and handle authorization failures, not manufacture privilege locally.

---

## 5. Phase 4.5C — remote-admin minimal surface and second confirmation

Implementation status: **implemented in code; live Windows x64 + Cloudflare
acceptance remains open**.

### 5.1 Goal

Only after 4.5A and 4.5B are stable, allow strongly authenticated `remote_admin` callers to perform the existing local maintenance workflow through a deliberately narrow server-side policy.

The intended remote-admin expansion is limited to:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

No new FQGate lifecycle endpoint, arbitrary process control, cloudflared service control, Tunnel-token operation, Cloudflare provisioning action, or market-data operation is added merely because an admin context now exists.

### 5.2 Risk tiers

The existing maintenance operations should be split by effect:

```text
admin control, non-activation:
  updates.check
  updates.plan
  openapi.refresh

admin mutation / activation:
  updates.apply
```

`updates.apply` must require a separate one-time server confirmation grant in addition to remote-admin authentication.

The implementation may also place confirmation on another future high-impact action, but must not weaken the minimum above.

### 5.3 Confirmation service

Create a framework-agnostic, memory-only confirmation service. The exact route names are implementation-defined, but the protocol must have two distinct steps:

1. prepare/issue an admin confirmation challenge for one exact intended action;
2. redeem a one-time grant when executing that exact action.

A confirmation grant must be bound to at least:

- verified remote-admin principal;
- admin application audience;
- operation ID;
- exact target identity, especially the existing update plan/candidate identity;
- a short expiry;
- one-time use.

For update apply, the existing stale-plan identity checks remain mandatory. The confirmation grant is additional protection, not a replacement.

Required confirmation properties:

- cryptographically random opaque identifier;
- short TTL, on the order of minutes or less;
- bounded in-memory registry with cleanup;
- atomic single consumption;
- replay denied;
- principal mismatch denied;
- operation mismatch denied;
- plan/target mismatch denied;
- expiry denied;
- Bridge restart invalidates all outstanding confirmations;
- no confirmation token in persistent browser storage;
- no confirmation token in logs.

The UI should show a clear summary of the target action and require a deliberate second user interaction. For `updates.apply`, require the user to acknowledge the exact candidate/version/plan being applied rather than showing a generic “OK” dialog.

This application-level confirmation is an anti-accident/replay/CSRF control. Identity strength comes from the separate Access admin application and MFA/device policy; do not invent a password database inside Bridge.

### 5.4 CSRF / browser-origin protection for remote admin POSTs

Because admin actions are browser-driven and Access uses browser sessions, remote-admin mutating/control POSTs need explicit cross-site request protection.

Minimum requirements:

- exact expected HTTPS admin Origin for browser-originated remote-admin POSTs;
- continue to avoid wildcard CORS;
- reject unexpected/missing browser Origin for the remote-admin browser workflow unless an explicitly designed same-origin exception exists;
- require a Bridge-owned custom intent/confirmation header or equivalent mechanism that cross-site form submissions cannot generate;
- high-impact `updates.apply` additionally requires the one-time confirmation grant;
- local loopback CLI/local browser behavior must not accidentally depend on remote Origin semantics.

### 5.5 Remote-admin UI behavior

On the admin hostname, after server-confirmed admin context:

- show the existing update check/plan workflow;
- display exact candidate version/source/size/hash and current installed context;
- show the existing stale-plan/compatibility/health information;
- gate apply behind the explicit confirmation flow;
- show progress and recovery/rollback result without exposing secrets;
- permit OpenAPI refresh as an admin control;
- clearly distinguish “admin hostname / stronger policy” from the ordinary remote-human hostname.

On the ordinary human hostname these controls remain unavailable server-side and should remain hidden/disabled with clear messaging.

### 5.6 What remains local-only even for remote admin

Phase 4.5 does **not** remotely expose:

- cloudflared install/update/service install/reconfigure/restart commands;
- Tunnel token creation/read/ACL modification;
- Cloudflare Access/Tunnel/DNS provisioning;
- arbitrary Windows process/service control;
- arbitrary FQGate paths;
- Bridge self-update/installer behavior;
- trading or financial state mutation.

Keeping cloudflared/control-plane operations local prevents a remote administrator action from silently replacing or disabling the security transport itself. Cloudflare provisioning stays Phase 6.

---

## 6. Relationship to Phase 5 remote-machine read-only API

Phase 5 remains a separate machine-consumer milestone.

### 6.1 Identity separation

Phase 5 should introduce a distinct `remote_machine` context using a separate machine/API hostname and separate Access application/policy, normally with Service Auth/service credentials or another machine identity supported by Access.

It must not reuse:

- the ordinary Phase 4 human hostname/policy;
- the Phase 4.5 admin hostname/AUD;
- browser admin confirmation grants;
- human MFA/device posture as a substitute for machine identity.

Conversely, a Phase 5 service token must not grant `remote_admin`, QR/session, update, OpenAPI refresh, or other human control operations.

### 6.2 Authorization separation

Conceptually the final matrix should look like this:

| Operation class            | local     | remote_human  | remote_admin                | remote_machine                 |
| -------------------------- | --------- | ------------- | --------------------------- | ------------------------------ |
| safe diagnostics/reference | yes       | selected      | selected                    | Phase 5 decides minimal subset |
| QR session maintenance     | yes       | yes           | yes                         | no                             |
| update status              | yes       | yes           | yes                         | no                             |
| update check/plan          | yes       | no            | yes                         | no                             |
| update apply               | yes       | no            | yes + one-time confirmation | no                             |
| OpenAPI refresh            | yes       | no            | yes                         | no                             |
| approved market-read       | later yes | no by default | no by default               | Phase 5 only                   |
| financial state mutation   | no        | no            | no                          | no                             |

Phase 5 must continue to register each market-read operation explicitly with a Bridge-owned stable contract. Runtime upstream OpenAPI may help compatibility checks but never auto-exposes new paths.

### 6.3 Shared implementation allowed between 4.5 and 5

Phase 5 may reuse generic, policy-neutral infrastructure created by 4.5A, such as:

- request-context abstraction;
- allowed-context policy evaluation;
- Access JWT/JWKS verification primitive;
- secret-safe logging/redaction helpers;
- common Host fail-closed rules.

It must use separate configuration, audience, policy, identity type, operation allowlist, and tests.

### 6.4 Scheduling rule

Recommended execution remains serial:

```text
4.5A -> 4.5B -> 4.5C -> Phase 5
```

If Phase 5 becomes urgent, it may begin after 4.5A is merged, because 4.5B is UI-only. In that case, 4.5C and Phase 5 must be separate PRs/commits with separate host/AUD/context tests and no shared privilege expansion. Do not combine remote admin and machine API enablement into one change.

---

## 7. Threat model

### 7.1 Ordinary remote human attempts admin operation

Threat: a valid Phase 4 user directly calls an admin endpoint.

Controls:

- distinct hostname/context;
- distinct admin Access application/AUD;
- operation allowed-context policy;
- remote-human context never inherits admin rights;
- server-side denial tested even when UI is bypassed.

### 7.2 Phase 5 machine token attempts admin operation

Threat: a stolen or valid service credential is sent to the admin hostname or admin route.

Controls:

- admin Access app has no Service Auth rule;
- separate admin audience and Bridge JWT validation;
- machine context is not allowed for admin operations;
- live negative acceptance once Phase 5 exists.

### 7.3 Forged/wrong Access JWT

Threat: direct request contains a fabricated assertion, wrong-app token, expired token, or token from another Access team/application.

Controls:

- admin JWT signature verification;
- exact issuer and audience;
- temporal-claim validation;
- fixed JWKS source derived from team domain;
- fail closed on unknown key/verification failure;
- token redaction.

### 7.4 Stolen authenticated browser session

Threat: attacker obtains an admin browser session.

Controls:

- independent MFA at Access;
- required device posture;
- short admin session;
- one-time confirmation for activation;
- confirmation bound to principal/action/plan and short TTL.

No design can make a fully compromised compliant device harmless; acceptance documentation must state that limitation rather than claiming absolute protection.

### 7.5 CSRF / drive-by admin action

Threat: an authenticated admin visits a malicious page that attempts cross-site requests.

Controls:

- same-origin UI;
- exact Origin checks for remote-admin POSTs;
- no wildcard CORS;
- custom Bridge intent/confirmation header;
- one-time action grant for apply;
- no GET mutation.

### 7.6 Confirmation replay or stale action

Threat: a prior confirmation is reused or applied to a different candidate.

Controls:

- one-time atomic consume;
- short TTL;
- bind to principal, operation, and exact update plan identity;
- retain existing stale-plan validation;
- invalidate on Bridge restart.

### 7.7 Device-policy drift or Access misconfiguration

Threat: admin Access app loses MFA/device requirements or Protect with Access.

Controls:

- documented manual Cloudflare contract;
- Phase 4.5 live acceptance tests for unauthenticated, wrong-device, and authenticated flows;
- Bridge-side admin JWT verification means assertion presence alone is insufficient;
- Phase 6 later adds automated provisioning/drift management.

### 7.8 Unknown Host / proxy header spoofing

Threat: attacker chooses a forwarding header to obtain admin context.

Controls:

- privilege classification only from explicit Host/server request data already trusted by the current model;
- `X-Forwarded-Host`, `Forwarded`, and similar headers do not grant context;
- unknown Host fails closed.

### 7.9 Mobile UI accidentally exposes privilege

Threat: responsive component refactor makes a hidden admin handler reachable.

Controls:

- UI has no authority;
- server operation policy and request context are always enforced;
- mobile tests include direct forbidden requests, not just button visibility.

---

## 8. Testing strategy

Normal CI must remain deterministic and must not require real Cloudflare credentials, a live Access account, or real FQGate login.

### 8.1 Unit / policy tests

Cover:

- local / remote-human / remote-admin Host classification;
- unknown Host denial;
- forwarded-header spoofing cannot change context;
- duplicate/equal human/admin hostname config rejected;
- remote-admin missing assertion denied;
- valid admin JWT accepted with fake deterministic JWKS;
- malformed, wrong issuer, wrong audience, expired, not-yet-valid, unknown `kid`, and bad-signature JWTs denied;
- JWKS fetch timeout/failure behavior is fail-closed;
- current/previous-key rotation fixture behavior;
- assertion/JWT never appears in logs/errors/snapshots;
- complete allowed-context operation matrix;
- all Phase 4 remote-human regression cases unchanged.

### 8.2 Confirmation-service tests

Cover:

- challenge issuance only for eligible admin operation;
- bounded registry/TTL cleanup;
- successful one-time redemption;
- expiry;
- replay;
- concurrent/double redemption race;
- principal mismatch;
- operation mismatch;
- plan/candidate identity mismatch;
- Bridge restart/registry loss semantics;
- no confirmation value in logs or persistent storage.

### 8.3 Transport / CSRF tests

Cover:

- remote-admin POST exact Origin accepted;
- foreign Origin rejected;
- missing Origin for browser-admin flow rejected according to the final contract;
- custom intent header required where specified;
- ordinary remote-human POST behavior remains compatible for QR;
- local loopback maintenance remains usable;
- no wildcard CORS introduced.

### 8.4 Mobile E2E tests

Use Playwright against representative viewports, at minimum:

```text
360x800
390x844
430x932
768x1024
1440x900 regression desktop
```

Check all four current pages in local and remote-human modes, then admin mode after 4.5C.

Assertions should focus on behavior and layout invariants rather than fragile full-page pixel snapshots:

- no document-level horizontal overflow;
- navigation reachable;
- primary status visible;
- QR fits viewport;
- touch controls are reachable and not overlapped;
- update/read-only/admin messaging correct by context;
- API reference long content remains bounded;
- keyboard focus works for confirmation dialog/drawer;
- direct forbidden API calls still fail.

### 8.5 Existing quality gates

Every subphase must keep passing:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

No test may require a real Tunnel token or commit real Access assertions.

---

## 9. Live Windows + Cloudflare acceptance for Phase 4.5C

Phase 4.5 cannot be marked CLOSED on deterministic tests alone because it expands remote administrative authority.

On the target Windows x64 host, record bounded/non-secret evidence proving:

1. FQGate still listens only on `127.0.0.1:17281` and Bridge only on `127.0.0.1:17282`.
2. Human and admin published hostnames both route only to the Bridge origin, never FQGate.
3. Ordinary remote-human behavior from Phase 4 still works.
4. Ordinary human hostname cannot call `updates.check`, `updates.plan`, `updates.apply`, or `openapi.refresh`.
5. Unauthenticated admin hostname is challenged/denied by Access.
6. A non-compliant/non-enrolled device is denied by the admin device policy.
7. A compliant intended device plus MFA can reach the admin Dashboard.
8. Bridge accepts the real admin Access JWT only for the configured issuer/AUD and does not log it.
9. A wrong-app token / ordinary-human application token cannot obtain admin context.
10. Remote admin can perform update check/plan and OpenAPI refresh.
11. Remote `updates.apply` without confirmation, with expired confirmation, with replayed confirmation, or with mismatched plan identity is denied.
12. With explicit operator approval, one known-safe real update apply path is executed through the admin flow and existing health/compatibility/rollback guarantees remain intact. If no safe candidate exists, Phase 4.5C stays open rather than faking this evidence.
13. cloudflared/Tunnel-token lifecycle operations remain unavailable remotely.
14. Raw/unregistered FQGate paths remain unreachable.
15. Local maintenance through loopback continues to work.
16. At least one real mobile-browser smoke pass confirms Dashboard, QR, updates, and API reference usability without introducing an authorization difference.

No evidence record may contain raw JWTs, Access cookies, Tunnel tokens, QR payloads, session IDs, or credentials.

The implementation should add a dedicated Phase 4.5 acceptance runbook and update the existing acceptance tooling only where doing so does not expose secrets or provision Cloudflare resources automatically.

---

## 10. Phase 4.5 exit criteria

Phase 4.5 is CLOSED only when all are true:

- 4.5A policy/authentication foundation is implemented and regression-tested;
- remote admin is a separate Host + Access application + audience + verified request context;
- ordinary remote-human permissions are unchanged;
- mobile UI requirements are met without a second frontend;
- only the four explicitly listed maintenance operations are added to remote-admin policy;
- `updates.apply` requires a one-time principal/action/plan-bound confirmation grant;
- CSRF/origin protections are enforced for remote-admin control requests;
- cloudflared/control-plane operations remain local;
- no market-data API or machine service-token policy is introduced;
- deterministic test/quality gates pass;
- live Windows + Cloudflare admin/device/MFA/confirmation acceptance is recorded;
- loopback-only listeners and direct-FQGate isolation are re-proven;
- documentation/AGENTS/roadmap/security/architecture/status/operations material reflects the final behavior.

---

## 11. Non-goals

Do not include in Phase 4.5:

- Phase 5 read-only market-data operations;
- machine/service-token API access;
- Cloudflare API provisioning or drift remediation (Phase 6);
- supervisor/notifications (Phase 7);
- automatic background updates (Phase 8);
- MCP or WebSocket proxying (Phase 9);
- Windows installer/final packaging (Phase 10);
- Bridge self-update;
- generic remote PowerShell/service/process control;
- remote cloudflared install/update/reconfigure/restart;
- arbitrary upstream FQGate execution;
- trading or financial state-changing operations.

---

## 12. Documentation deliverables during implementation

Each implementation subphase must update source-of-truth docs in the same change.

Expected final artifacts include:

```text
docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md
docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md
docs/operations/windows-phase-4-5-acceptance.md
docs/status/phase-4-5-implementation-handoff.md
```

And updates to:

```text
AGENTS.md
README.md
docs/architecture.md
docs/security.md
docs/upstream-contracts.md   # only if an observed upstream/Cloudflare contract changes
docs/roadmap.md
docs/agent-guide.md
config/example.json          # when configuration is implemented, never secrets
```

Phase 4 historical docs remain historical and should not be rewritten to pretend remote administration existed in Phase 4.
