# Phase 2 Completion Report — TanStack Local Bridge and QR UI

Date: **2026-09-16**

Status: **implementation complete; real Windows QR acceptance pending**

The Phase 2 repository package is implemented and verified locally. The target
Windows x64 host still needs one safe real QR begin/poll/scan acceptance before
the roadmap can call Phase 2 fully closed. No destructive logout was performed
to manufacture that evidence.

## 1. Final architecture

The repository remains one pnpm package. The existing framework-agnostic FQGate
release, compatibility, lifecycle, and health modules remain intact. A thin
TanStack Start production shell now provides:

- React 19 pages at `/` and `/login`;
- explicit Start server routes for five bridge operations;
- a policy registry that is the authority for method/path/body/timeout and
  sensitivity metadata;
- a normalized bridge service that separates process, health, network, session,
  and compatibility state;
- a dedicated QR adapter for the observed FQGate contract;
- a bounded in-memory QR registry that keeps upstream flow IDs server-side.

`scripts/start-bridge.mjs` launches the built Nitro output, defaults to
`127.0.0.1:17282`, and rejects or overwrites any non-loopback host setting. No
Fastify backend, Cloudflare integration, public binding, market-data proxy,
MCP/WebSocket proxy, SMS flow, notifier, supervisor, service installer, or
trading operation was added.

## 2. Resolved framework and library baseline

The lockfile pins the following Phase 2 baseline:

| Package                             |  Resolved version |
| ----------------------------------- | ----------------: |
| `react` / `react-dom`               |          `19.3.0` |
| `@tanstack/react-start`             |        `1.168.54` |
| `@tanstack/react-router`            |        `1.170.36` |
| `@tanstack/react-query`             |         `5.103.0` |
| `@tanstack/router-cli`              |        `1.167.36` |
| `vite`                              |           `8.3.0` |
| `nitro`                             | `3.0.260903-beta` |
| `tailwindcss` / `@tailwindcss/vite` |           `4.3.3` |
| `@vitejs/plugin-react`              |           `6.1.1` |
| `lucide-react`                      |         `0.468.0` |
| `tailwind-merge`                    |           `3.6.0` |
| `@testing-library/react`            |          `16.3.0` |
| `@playwright/test`                  |          `1.63.0` |

The `src/components/ui` primitives are local shadcn-style components, so the
phase does not depend on a remote component registry or introduce Radix as a
runtime requirement.

## 3. Bridge API and registry

The only bridge-owned API routes are:

```text
GET  /api/v1/version
GET  /api/v1/capabilities
GET  /api/v1/status
POST /api/v1/session/qr/begin
POST /api/v1/session/qr/poll
```

The handler rejects unknown paths, wrong methods, query strings, malformed JSON,
oversized bodies, and raw `/v1/market/*` paths. There is no catch-all proxy or
arbitrary upstream path parameter. Bridge errors use the stable envelope:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "..."
  }
}
```

Internal details and upstream bodies are redacted from responses and logs.

## 4. QR security and state model

- upstream begin is `POST /v1/market/session/qr/begin` with
  `cache_credentials: false`;
- bridge sessions use cryptographically random opaque UUIDs;
- upstream numeric `flow_id` values never reach the browser;
- QR image data exists only in the begin response and bounded process memory;
- active flows expire after 120 seconds and are limited to three;
- replacement and terminal states are removed/tombstoned briefly so stale polls
  cannot revive a flow;
- restart invalidates in-memory flows cleanly;
- upstream `1003` and `3014` normalize to expired/replaced bridge errors;
- no QR/session data is written to filesystem, localStorage, sessionStorage,
  IndexedDB, or ordinary logs.

The adapter validates response envelopes, flow IDs, image media types, decoded
image size, and pending/connected states before the service returns anything.

## 5. UI behavior and design choices

The dashboard shows separate cards for bridge, FQGate process, health/network,
market session, and compatibility. `/login` has idle, loading, scan,
confirmation, connected, expired, replaced, and safe error states. TanStack Query
polls status every five seconds and an active QR flow every two seconds, with no
cache persistence and deliberate retry rules. Successful login invalidates the
dashboard query.

The UI uses local shadcn-style primitives, Tailwind CSS v4, restrained indigo/
slate accents, a stable QR box, responsive layout, keyboard-visible focus, and a
light/dark theme toggle. It does not add shader, animation, or visual-registry
dependencies.

## 6. Tests and CI

The implementation preserves the Phase 0/1 suite and adds bridge registry,
runtime binding, adapter, QR lifecycle, HTTP integration, React behavior, and
deterministic Playwright coverage. CI remains a frozen-lockfile matrix on
Ubuntu and Windows. Ubuntu installs Chromium and runs browser E2E; Windows runs
the production build plus the PowerShell loopback smoke procedure and existing
CLI acceptance. Neither path requires real FQGate credentials, Cloudflare
credentials, or a QR scan.

The final local verification commands and results are:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

`pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm format:check` passed;
`pnpm test` passed with 10 files and 78 tests; and the deterministic Playwright
suite passed with 3 Chromium tests. The production-mode Playwright run also
passed all 3 tests. The checks should be re-run on the target Windows host using
[`windows-phase-2-acceptance.md`](../operations/windows-phase-2-acceptance.md).

## 7. Production loopback evidence

On the development host, the built production runtime was started with
`BRIDGE_PORT=18282`. The listener was observed as `127.0.0.1:18282`; the version
route returned HTTP 200 with security headers; the raw
`/v1/market/health` path returned 404; and a QR begin attempt without a managed
FQGate returned the stable `FQGATE_NOT_INSTALLED` error. The process was then
stopped cleanly.

The target Windows procedure repeats this check on the default
`127.0.0.1:17282` listener and records the exact listener ownership.

## 8. Windows and real QR acceptance

The procedure is documented in
[`docs/operations/windows-phase-2-acceptance.md`](../operations/windows-phase-2-acceptance.md)
and in `scripts/windows/acceptance.ps1 -VerifyBridge`. It verifies build/CLI
behavior, production readiness, exact loopback binding, raw-route denial, and
the normalized dashboard state against the real managed FQGate.

Real QR begin/poll/scan was **not executed in this change**. The existing target
host had a safe Phase 0/1 acceptance baseline, but this agent did not perform a
destructive logout or claim a QR success without evidence. That single external
acceptance item blocks the phrase “Phase 2 fully closed”; it does not block the
implementation handoff.

## 9. Remaining blockers and next phase

Before Phase 2 can be fully closed, run one safe real QR login on the target
Windows/FQGate combination and record only non-sensitive evidence. If the account
is already connected and logout would be unsafe, retain the pending status.

The next task is Phase 3: design and implement the cloudflared lifecycle and
manual Cloudflare Tunnel integration. It is intentionally not part of this
change.
