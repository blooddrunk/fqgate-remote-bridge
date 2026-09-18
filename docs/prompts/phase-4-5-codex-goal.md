Work in `https://github.com/blooddrunk/fqgate-remote-bridge` from the latest `main` after Phase 4 closure. Read, in order, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/upstream-contracts.md`, `docs/roadmap.md`, `docs/status/phase-4-implementation-handoff.md`, `docs/plans/phase-4-5-remote-admin-and-mobile-dashboard.md`, and `docs/tasks/phase-4-5-remote-admin-and-mobile-dashboard.md`. Execute **Phase 4.5 only**, in subphases 4.5A -> 4.5B -> 4.5C, without implementing Phase 5+.

Preserve all existing non-negotiable boundaries: FQGate stays on IPv4 loopback (`127.0.0.1:17281`), Bridge stays on IPv4 loopback (`127.0.0.1:17282`), cloudflared may route only to Bridge, unknown hosts fail closed, forwarding headers do not grant privilege, the Bridge operation registry remains the authorization boundary, Runtime OpenAPI remains descriptive only, no catch-all/raw upstream proxy is added, no LAN/WAN listener or port-forward is added, and trading/order/cancel/fund-transfer/brokerage-control or any other financial state-changing capability remains forbidden. Keep Phase 4 `remote_human` behavior compatible.

### Phase 4.5A — policy/authentication foundation, no privilege expansion

Refactor the policy model so request context and per-operation allowed contexts are orthogonal; do not solve the problem by adding more combination exposure-enum names. Add an optional `remote_admin` context using a **distinct admin hostname and distinct Cloudflare Access application/AUD**. Add only non-secret admin config required for the admin host, Cloudflare team/issuer domain, and exact audience. Reject duplicate/ambiguous human/admin hosts.

For `remote_admin`, add a framework-agnostic Cloudflare Access JWT verifier using a maintained JWT/JWK library: validate RS256 signature, exact issuer/team domain, exact audience, time claims, and `kid`; use a bounded cached key source derived only from the configured Cloudflare team-domain cert endpoint; do not accept an arbitrary JWKS URL; fail closed on key/fetch/verification errors; never log or persist the assertion/JWT. Reduce verified identity to a minimal principal representation suitable for confirmation binding.

Document and enforce the independent admin Access contract: human-only policy, explicit operator identity/group, MFA, enforceable device posture, short admin session, Protect with Access, no Bypass, no Service Auth. At the end of 4.5A, `remote_admin` may use only the existing safe Phase 4 remote-human surface. **Do not yet grant remote access to** `updates.check`, `updates.plan`, `updates.apply`, or `openapi.refresh`.

### Phase 4.5B — mobile Dashboard, no authorization changes

Keep one React 19/TanStack Start/Router/Query/Tailwind/shadcn application and the existing routes `/`, `/login`, `/updates`, `/api-reference`. Do not create a second frontend, `/mobile`, native app, or duplicated client API. Optimize for approximately 360px+ viewport widths while preserving desktop behavior: responsive navigation, stacked status cards, scan-friendly QR, touch-friendly controls, no hover-only actions, bounded wrapping/scrolling of hashes/URLs/code/API-reference/table content, safe-area/mobile viewport handling, semantic labels/focus/keyboard behavior, and clear local/remote-human/admin context messaging. Ordinary remote-human `/updates` must remain read-only.

Add Playwright coverage for representative phone/tablet/desktop viewports (at least 360x800, 390x844, 430x932, 768x1024, 1440x900). Assert behavioral/layout invariants such as no document-level horizontal overflow and direct forbidden API calls still failing; avoid brittle full-page pixel snapshot dependence.

### Phase 4.5C — minimal remote-admin maintenance surface + second confirmation

Only after 4.5A and 4.5B are stable, allow `remote_admin` access to exactly these existing maintenance operations:

- `updates.check`
- `updates.plan`
- `updates.apply`
- `openapi.refresh`

Do not remotely expose cloudflared install/update/service management, Tunnel token handling, Cloudflare provisioning, arbitrary Windows service/process control, arbitrary FQGate paths, Bridge self-update, market-data operations, or any financial state-changing operation.

Treat `updates.apply` as the high-impact mutation and require an additional one-time server confirmation grant. Implement a framework-agnostic, bounded, memory-only confirmation service with cryptographically random opaque IDs, short TTL, atomic single-use consume, restart invalidation, and binding to: verified admin principal, admin AUD, exact operation ID, and exact update plan/candidate identity. Deny expiry, replay, race/double consume, principal mismatch, operation mismatch, and plan mismatch. Keep the existing stale-plan/source/version/size/SHA/compatibility/health/rollback checks intact and additive. Do not put confirmation values in logs or persistent browser storage.

Add explicit browser CSRF protection for remote-admin control POSTs: require the exact expected HTTPS admin Origin for the browser admin workflow, keep wildcard CORS forbidden, require a Bridge-owned custom intent/confirmation header or equivalent mechanism that cross-site form submissions cannot generate, and require the one-time grant for apply. Do not break local loopback CLI/browser maintenance semantics.

Update the responsive `/updates` UI for admin context to support check/plan, exact candidate/source/version/size/hash/current-context review, deliberate second confirmation for apply, progress/result/rollback visibility, and a clear admin-context indicator. Ordinary remote-human hostname must remain denied server-side even if the UI is bypassed.

### Phase 5 boundary

Do **not** implement Phase 5 in this goal. The 4.5A policy model must merely be ready to add a future distinct `remote_machine` context. Phase 5 must later use a separate machine/API hostname, separate Access application/policy/audience and machine/service identity. It must not reuse admin MFA/device policy or admin confirmation grants, and a machine credential must never inherit QR/session/update/admin privileges. Generic JWT/JWKS/context infrastructure may be reusable only if configuration, audience, caller type, allowlist, and tests remain separate.

### Threat-model and test requirements

Implement deterministic coverage for: local/remote-human/remote-admin classification; unknown-host denial; forwarding-header spoofing; invalid duplicate host config; missing assertion; valid admin JWT; bad signature; wrong issuer; wrong audience; expired/not-yet-valid token; unknown `kid`; JWKS fetch/cache/failure/key-rotation behavior; complete context x operation matrix; Phase 4 remote-human regressions; assertion/JWT redaction; confirmation issuance/expiry/replay/race/principal/operation/plan mismatch; exact-Origin/CSRF behavior; no wildcard CORS; mobile viewport behavior; and direct forbidden-operation calls.

All normal CI must remain credential-free and deterministic. Run and keep green:

`pnpm typecheck`
`pnpm lint`
`pnpm test`
`pnpm build`
`pnpm format:check`
`pnpm test:e2e`

### Live closure requirement

Add `docs/operations/windows-phase-4-5-acceptance.md` and do **not** mark Phase 4.5 CLOSED until real Windows x64 + Cloudflare evidence proves: FQGate/Bridge still loopback-only; ordinary Phase 4 human access still works; ordinary human cannot call admin ops; unauthenticated admin is challenged; device-noncompliant admin is denied; compliant intended device + MFA reaches admin; Bridge validates the real admin JWT for the exact issuer/AUD without logging it; wrong-app/human assertion cannot become admin; remote admin check/plan/OpenAPI refresh work; apply without/expired/replayed/mismatched confirmation is denied; one known-safe real apply is executed through the admin flow while existing health/compatibility/rollback guarantees remain intact (if no safe candidate exists, leave the phase open rather than fabricating evidence); cloudflared/Tunnel-token/control-plane actions remain unavailable remotely; raw upstream paths remain denied; local maintenance remains usable; and at least one real mobile-browser smoke pass succeeds. Never record raw JWTs, Access cookies, Tunnel tokens, QR payloads, credentials, or full session IDs.

Update `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/roadmap.md`, `docs/agent-guide.md`, non-secret `config/example.json`, and final `docs/status/phase-4-5-implementation-handoff.md` as implementation changes behavior. Update `docs/upstream-contracts.md` only if an observed upstream/Cloudflare contract materially changes. Preserve Phase 4 historical docs as history; do not rewrite them as if remote admin existed in Phase 4.

Do not opportunistically implement Phase 6 provisioning/drift management, Phase 7 supervisor/notifications, Phase 8 automatic updates, Phase 9 MCP/WebSocket, Phase 10 packaging, or any other deferred work.
