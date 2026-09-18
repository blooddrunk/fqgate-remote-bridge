# Phase 4.5 Implementation Handoff

Date: 2026-09-17
Last evidence update: 2026-09-18

Status: **IMPLEMENTED IN CODE / OPEN pending real Windows x64 + Cloudflare acceptance**

Phase 4 remains CLOSED and its ordinary `remote_human` behavior is preserved.
Phase 4.5 was implemented strictly in order: **4.5A → 4.5B → 4.5C**. The
repository contains the policy, authentication, responsive UI, remote-admin
maintenance, confirmation, CSRF, and deterministic test changes, but this
handoff does not claim phase closure without live evidence.

## 4.5A — policy and authentication foundation

- Replaced the growing exposure combination with orthogonal operation
  `allowedContexts` and `requiresConfirmation` metadata.
- Added optional, distinct admin hostname and admin Cloudflare Access
  team-domain/AUD configuration; duplicate or ambiguous host configuration is
  rejected.
- Added maintained-library RS256/JWK verification using `jose`, with exact
  derived issuer, exact audience, required temporal claims, `kid` selection,
  bounded fixed team-domain cert retrieval/cache, one refresh on key rotation,
  and fail-closed behavior.
- Propagated only `{ kind, subject, audience }` as the verified principal;
  assertions are not logged, persisted, echoed, or put in browser storage.
- Kept the four maintenance operations unavailable to both ordinary remote
  humans and the admin context at the 4.5A checkpoint.

## 4.5B — one responsive Dashboard

- Kept `/`, `/login`, `/updates`, and `/api-reference` in the existing React 19
  / TanStack Start route tree.
- Added responsive navigation, stacked status/summary cards, scan-friendly QR
  sizing, touch-sized controls, bounded long content, safe-area/viewport
  styles, and keyboard/focus-friendly interaction states.
- Kept ordinary remote-human `/updates` read-only and tested direct forbidden
  operations independently of UI visibility.
- Added Playwright viewport coverage for 360x800, 390x844, 430x932, 768x1024,
  and 1440x900 with no document-level horizontal overflow assertions.

## 4.5C — narrow remote-admin maintenance

Only the following existing operations are allowed for a verified
`remote_admin` context:

```text
updates.check
updates.plan
updates.apply
openapi.refresh
```

Every other operation remains governed by its explicit registry contexts;
there is no `remote_machine` context or Phase 5 market-data API in this work.

- All remote-admin control POSTs, including QR session POSTs, require the exact
  `https://<admin-host>` Origin and Bridge-owned non-simple intent header. No
  wildcard CORS was added.
- Remote `updates.apply` has a prepare/execute protocol. The execute step
  consumes a cryptographically random, short-lived, bounded, memory-only,
  atomically single-use grant bound to the verified principal, admin AUD,
  exact operation, and exact plan/candidate/source/version/size/hash identity.
- Grants are not persisted or logged and disappear when the Bridge process is
  restarted. Expiry, replay, race, principal, operation, and plan mismatches
  are rejected. Existing stale-plan, integrity, compatibility, health,
  concurrency, and rollback protections remain additive.
- The responsive admin update UI shows the current context, exact candidate
  review, first review acknowledgement, separate one-time confirmation, and
  progress/result/rollback state without displaying the grant.

## Deterministic verification

The credential-free suite covers Host/context classification, unknown-host and
forwarded-header spoofing denial, duplicate-host configuration, valid/invalid
admin JWT cases, issuer/AUD/time/signature/`kid` failures, bounded JWK
cache/failure/rotation behavior, assertion redaction, the complete context ×
operation matrix, Phase 4 regressions, confirmation expiry/replay/race and
mismatch behavior, Origin/CSRF policy, mobile viewports, and forbidden direct
calls.

The final command results should be recorded here after running:

```text
pnpm typecheck   PASS
pnpm lint        PASS
pnpm test        PASS — 15 files / 122 tests
pnpm build       PASS
pnpm format:check PASS
pnpm test:e2e    PASS — 13 tests, including 5 viewport suites
```

The cold-start e2e run also passed after the Playwright startup wait was
increased; no pre-warmed server was required for that final pass.

## Outstanding live evidence

See [Windows Phase 4.5 acceptance](../operations/windows-phase-4-5-acceptance.md).
The current WSL workspace can observe a Windows 11 x64 host. A bounded probe
on 2026-09-18 started the current built production Bridge and recorded exactly
one IPv4 loopback listener on each required port: FQGate `127.0.0.1:17281` and
Bridge `127.0.0.1:17282`. The local production probe returned
version/update-status `200`, raw and unregistered paths `404`, and unknown Host
plus forwarding-header spoofing `421`.

The real Tunnel configuration review confirmed that both redacted public host
entries target only `http://127.0.0.1:17282`, with a final HTTP 404 catch-all
and no `17281` route. The existing cloudflared service uses `tunnel run` with
`--token-file` and no inline token. An elevated restart on 2026-09-18 returned
the service to `Running`, and the ordinary public route returned its expected
unauthenticated Access challenge (`302`) after reconnect.

The 2026-09-18 network-compatible admin reconfiguration now uses Cloudflare One
Client `PostureOnly`, zone client-certificate provisioning, and a
Cloudflare-managed CA hostname association for the admin hostname. The admin
Access policy requires the intended email, a valid client certificate, Windows
OS posture, independent MFA, and a 15-minute session; it does not require the
`WARP` or `Gateway` traffic-tunnel selector. A TLS probe confirmed that the
admin hostname requests a client certificate. A bounded Windows request using
the installed WARP client certificate reached the unauthenticated Access
challenge with `MTLS Status: SUCCESS`; a request without that certificate was
denied with `403`. The browser must still complete the visible certificate
selection/login/MFA flow before T8 can be recorded.

The admin Access application, independent audience, MFA/device-posture policy,
and second Tunnel route are provisioned. A separate WARP enrollment application
and identity-only enrollment policy has also been provisioned with independent
MFA; the posture rules remain downstream checks after device registration. The
team App Launcher is now enabled with its own identity-only Allow policy so the
intended operator can reach the MFA enrollment flow. DNS has now been
published, and the intended operator has completed the browser WARP/MFA
enrollment flow. The service-scoped first-level admin hostname is now
`fqgate-admin.haoqi90.top`; the Access application and Tunnel route have been
updated to that hostname. A bounded public probe negotiates TLS successfully
and receives the expected unauthenticated Access challenge (`302`), while the
ordinary hostname continues to return its own `302`. The real admin Access
session had been reported successful before the PostureOnly reconfiguration;
the post-reconfiguration browser session is not yet recorded. The public admin
request matrix, remote maintenance, confirmation negative cases, mobile
browser smoke, and a safe real update candidate therefore remain unavailable
for full acceptance. The executable helper
`scripts/windows/phase45-acceptance.ps1` now records the machine-verifiable
part: loopback listeners, token-file service shape, unknown-host/forwarded-host
denial, unauthenticated public Access challenges, raw-route denial, and local
check/plan/OpenAPI refresh all passed on 2026-09-18. The real update plan also
found only an unsigned, unvalidated `1.0.1`; it is correctly blocked and is
recorded as `T13 NOT AVAILABLE`, not applied. The repeatable setup and
reconfiguration procedure is
documented in `docs/operations/windows-phase-4-5-remote-admin-setup.md`; the
plain-language one-command acceptance procedure is documented in
`docs/operations/windows-phase-4-5-acceptance-simple.md`; the
future multi-profile design is recorded in
`docs/plans/future-multi-profile-account-isolation.md`.
Phase 4.5 remains **OPEN** and must not be described as CLOSED until the
non-secret T1–T17 evidence in the acceptance runbook is completed.

Do not use this handoff to authorize Phase 5 or any deferred Phase 6–10 work.
