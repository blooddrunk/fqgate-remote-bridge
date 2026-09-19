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
pnpm typecheck    PASS
pnpm lint         PASS
pnpm test         PASS — 15 files / 125 tests
pnpm build        PASS
pnpm format:check PASS
pnpm test:e2e     PASS — 13 tests, including 5 viewport suites
```

The cold-start e2e run also passed after the Playwright startup wait was
increased; no pre-warmed server was required for that final pass.

The first post-fix GitHub Actions run is
`35417801749` for commit
`9a0623a26827517b4cc22e024e3132b8728a7401`: Ubuntu job
`105629696634` and Windows job `105829696607` both passed. The Windows
format, CLI smoke, and production loopback smoke steps all ran; no Windows
step was skipped because of the earlier formatting failure.

The live acceptance helper now has an explicit
`-RunAuthenticatedBrowserMatrix` mode. It opens a non-persistent headed
browser context, leaves Access login/MFA to the operator, bounds response
reads, prints no browser/session/confirmation material, and never calls
`updates.apply`. It covers the safe authenticated request matrix and safe
confirmation negatives; deterministic tests remain the evidence for wrong
principal/operation binding and concurrent/double redemption because a
successful live consumer would be a real update.

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

The 2026-09-18 operator-approved admin reconfiguration now uses the low-friction
profile: exact operator email, Access MFA, and a 30-minute session. The policy
has an empty `require` list, so Cloudflare One Client, WARP, client certificates,
hostname mTLS, and device posture are not prerequisites. The independent admin
application/AUD, Protect with Access, no Bypass/Service Auth, Bridge-side JWT
validation, exact Origin/intent checks, and one-time apply grant remain active.
Both public roots returned the expected unauthenticated Access challenge (`302`)
after the change; the browser still needs one post-change login before T8 can be
recorded.

The admin Access application, independent audience, MFA policy, and second
Tunnel route are provisioned. DNS has been published. The service-scoped
first-level admin hostname is now
`fqgate-admin.haoqi90.top`; the Access application and Tunnel route have been
updated to that hostname. A bounded public probe negotiates TLS successfully
and receives the expected unauthenticated Access challenge (`302`), while the
ordinary hostname continues to return its own `302`. The post-reconfiguration
the operator has confirmed successful admin login after the policy change; no
certificate selection or Cloudflare One Client is required. The public admin request matrix, remote
maintenance, confirmation negative cases, mobile browser smoke, and final apply
evidence therefore remain unavailable for full acceptance. The executable helper
`scripts/windows/phase45-acceptance.ps1` now records the machine-verifiable
part: loopback listeners, token-file service shape, unknown-host/forwarded-host
denial, unauthenticated public Access challenges, raw-route denial, and local
check/plan/OpenAPI refresh all passed on 2026-09-18. A separate Windows x64
verification of the official 1.0.1 candidate matched its size and SHA-256,
passed `--verify-installation`/`--version`, and passed isolated OpenAPI, health,
and required health/QR contract checks on `17283`. The live config now marks
1.0.1 validated. Two real local apply attempts reached candidate activation but
ended in `HEALTH_TIMEOUT` while waiting for FQGate's own first-run desktop/risk
acknowledgement; the existing rollback restored managed 1.0.0 and `ready` health.
After the temporary and managed installation fingerprints were acknowledged,
the third managed Windows apply succeeded at 2026-09-18T13:32:56Z with 1.0.1,
health HTTP 200, and outcome `updated`, without rollback. The live activation
deadline was restored to 120 seconds afterward. Remote-admin apply evidence is
therefore still open, and the
repeatable setup and
reconfiguration procedure is
documented in `docs/operations/windows-phase-4-5-remote-admin-setup.md`; the
plain-language one-command acceptance procedure is documented in
`docs/operations/windows-phase-4-5-acceptance-simple.md`; the
future multi-profile design is recorded in
`docs/plans/future-multi-profile-account-isolation.md`.
Phase 4.5 remains **OPEN** and must not be described as CLOSED until the
non-secret T1–T17 evidence in the acceptance runbook is completed.

Do not use this handoff to authorize Phase 5 or any deferred Phase 6–10 work.
