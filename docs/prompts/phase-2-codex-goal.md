# Phase 2 Codex Goal Prompt

Work in the repository:

https://github.com/blooddrunk/fqgate-remote-bridge

Implement Phase 2 completely: the local-only TanStack bridge API plus QR login UI.

Before changing code, read these files in order and treat them as the project source of truth:

1. `AGENTS.md`
2. `README.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/status/phase-0-1-completion.md`
8. `docs/tasks/phase-2-tanstack-local-bridge-and-qr-ui.md`

The detailed task package in `docs/tasks/phase-2-tanstack-local-bridge-and-qr-ui.md` is the acceptance contract for this goal. Do not merely produce another plan: implement the code, tests, CI, UI, production runtime, Windows acceptance procedure, and completion documentation required by that file.

Important architecture decisions are already made:

- Use React 19.
- Use TanStack Start as the full-stack framework and HTTP server layer for Phase 2.
- Use TanStack Router through Start.
- Use TanStack Query for status polling, QR mutation/poll state, and invalidation.
- Use Vite-based TanStack Start builds.
- Use Tailwind CSS v4.
- Use shadcn/ui as the baseline UI/component source.
- Keep the repository as one pnpm package. Do not create a monorepo in this phase.
- Do not add a second Fastify backend. TanStack Start replaces the originally planned Fastify transport for Phase 2.
- Keep the Phase 0/1 lifecycle/FQGate modules framework-agnostic and reusable beneath the Start routes.
- Do not use experimental React Server Components.
- Do not introduce Aceternity UI or Magic UI as baseline dependencies. The UI should be modern through shadcn/Tailwind and careful design first.

TanStack Start is currently pre-v1/RC, so isolate it as a transport/UI shell. Keep bridge operations, FQGate adapters, compatibility rules, QR flow state, and error semantics outside route/components wherever practical. Pin resolved dependency versions in the lockfile and record them in the Phase 2 completion report.

Phase 2 is LOCAL ONLY.

The production bridge must bind only to IPv4 loopback. Use `127.0.0.1` and a documented default port such as `17282`. If the runtime relies on `HOST`/`PORT`, provide a deterministic project-owned launcher that forces or validates loopback before starting the production server. Do not rely on a runtime default and do not add LAN/public bind support.

Implement an explicit bridge operation/policy registry. It must be the authority for the intended local API operations even though TanStack Router performs path matching. There must be no wildcard/catch-all upstream proxy and no operation that accepts an arbitrary FQGate path.

The initial bridge-owned API should provide concepts equivalent to:

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

Do not directly expose upstream `/v1/market/*` paths as bridge routes.

Preserve the separation among:

```text
process running
FQGate health endpoint available
network ready
market session connected
FQGate compatibility validated
```

Implement a stable bridge HTTP error envelope and deliberate internal-error-to-HTTP mapping. Never return stack traces or raw upstream bodies. Keep upstream messages redacted and bounded.

For QR login, use the observed upstream contracts recorded in `docs/upstream-contracts.md`, but keep them behind a dedicated adapter and runtime validation.

Do not expose upstream numeric `flow_id` as the browser's primary flow identity. Create a cryptographically random bridge-owned opaque `sessionId` and keep the upstream `flow_id` in bounded server memory only.

QR requirements:

- call upstream begin with `cache_credentials: false`;
- return the QR image only to the intended begin caller;
- keep QR image and flow state ephemeral;
- never persist QR image/session data to filesystem, localStorage, sessionStorage, or IndexedDB;
- never log QR base64, upstream flow IDs, or full bridge session IDs;
- use bounded TTL and active-flow limits;
- normalize waiting-for-scan and waiting-for-confirmation states;
- normalize upstream `1003` / `3014` to bridge QR expiration/replacement semantics;
- remove successful/expired/replaced flows promptly;
- process restart may invalidate flows and must fail cleanly.

Build a modern but restrained operator UI using shadcn/ui and Tailwind:

- `/` dashboard with bridge/FQGate/session/compatibility status cards;
- `/login` QR flow;
- light/dark support;
- responsive layout;
- visible loading/error/retry states;
- stable QR layout box;
- accessible keyboard/focus behavior;
- no gratuitous animation/shader dependency.

Use TanStack Query where it adds value:

- dashboard/status polling;
- QR begin mutation;
- conditional QR polling;
- invalidation/refetch after successful login;
- sensible retry policy.

Do not persist the Query cache.

Add appropriate local browser security headers, including a deliberate CSP suitable for the built UI and QR image strategy, `nosniff`, referrer policy, frame-embedding protection, and no wildcard CORS.

Testing requirements:

- preserve all Phase 0/1 tests;
- operation registry invariants;
- loopback binding invariant;
- status/error normalization;
- QR adapter and ephemeral registry unit tests;
- HTTP integration tests for exact allowed routes/methods, unknown route denial, body limits, security headers, and error envelopes;
- React behavior tests for dashboard and QR state transitions;
- a small deterministic Playwright Chromium flow on CI using fakes: disconnected -> begin -> render QR -> pending -> connected -> dashboard connected;
- expired/replaced QR browser flow;
- normal CI must not require real FQGate login or Cloudflare credentials.

Keep Ubuntu and Windows CI. Run browser E2E where practical on Ubuntu only; Windows must still build/test the production/runtime and retain the existing lifecycle smoke coverage.

Do not implement any of these Phase 3+ or out-of-scope features:

- Cloudflare Tunnel
- cloudflared installation/lifecycle
- Cloudflare Access
- DNS/public hostnames
- LAN/public bind support
- remote machine authentication
- general/read-only market-data forwarding routes not needed for Phase 2 status/login
- MCP
- WebSocket proxying
- SMS login
- notifications
- supervisor daemon
- Windows service installation
- permanent Task Scheduler setup
- turtle-value-engine integration
- trading, brokerage, order, cancel, fund transfer, or other state-changing financial features

Do not regress Phase 0/1 invariants:

- official-only FQGate release source;
- size/SHA-256 verification;
- candidate identity/version validation;
- compatibility fail-closed behavior;
- transactional activation/rollback;
- managed-process identity checks;
- real FQGate HTTP envelope handling;
- Windows lifecycle CLI behavior.

Build integration must preserve the existing CLI while adding the Start production build. `pnpm build` should leave the repository in a state where both the CLI and local bridge runtime are usable. Add explicit `build:cli` / `build:bridge` / `start` scripts or equivalents as appropriate.

Real Windows Phase 2 acceptance must prove the production bridge binds only to loopback and reads the real managed FQGate. If a real QR login test is safe, complete begin/poll/scan against the real FQGate. If the host is already connected and proving QR would require destructive logout/session manipulation, do not automate the destructive action; record real QR acceptance as pending rather than weakening safety. Phase 2 is fully closed only after real QR login has been proven at least once on the target Windows/FQGate combination.

At completion:

- run and fix typecheck, lint, unit/integration tests, full build, format checks, and E2E;
- add `docs/status/phase-2-completion.md`;
- record exact resolved React/TanStack Start/Router/Query/Tailwind/shadcn baseline;
- document final API, operation registry, QR TTL/model, UI, CI, production bind behavior, Windows acceptance, and known limitations;
- update `README.md`, `docs/architecture.md`, `docs/security.md`, `docs/upstream-contracts.md`, `docs/roadmap.md`, and `AGENTS.md` where implementation reality changed;
- mark Phase 2 fully closed only if its exit criteria and real-host acceptance are truly satisfied;
- keep the working tree clean and leave a coherent handoff state.

Use engineering judgment inside this task package instead of stopping for minor implementation choices. If TanStack Start's current RC behavior conflicts with a security/runtime invariant, preserve the invariant, isolate the workaround, document it, and do not silently weaken the boundary.

At the end report:

1. final architecture and why;
2. exact resolved framework/library versions;
3. bridge API/operation registry implemented;
4. QR security/state model;
5. UI behavior and design-system choices;
6. tests/CI and their results;
7. production loopback binding evidence;
8. whether real Windows QR acceptance was executed;
9. remaining blockers before Phase 2 can be considered closed;
10. recommended next Phase 3 task, but do not implement Phase 3.