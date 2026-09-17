# Windows Phase 2 Acceptance Procedure

This procedure validates the Phase 2 production bridge on the target Windows x64
PC. It is intentionally operator-driven: it does not install a Windows service,
create a permanent Task Scheduler task, log out an existing FQGate account, or
claim headless FQGate support.

## Preconditions

- Windows x64 with Node.js 22 or newer and Corepack/pnpm available.
- An interactive desktop user session, because FQGate is a desktop application.
- The repository checked out locally and no other process using port `17282`.
- A managed FQGate installation may already be connected. Do not log it out just
  to manufacture a QR test. If it is not connected, a real QR test may proceed.

## Build and deterministic checks

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pwsh -NoProfile -NonInteractive -File .\scripts\windows\acceptance.ps1 -VerifyCli
```

The CLI smoke check resolves `dist\cli\main.js` relative to the script and
does not install or download an FQGate binary.

## Production loopback check

Run the bridge smoke procedure after `pnpm build`:

```powershell
pwsh -NoProfile -NonInteractive -File .\scripts\windows\acceptance.ps1 -VerifyBridge
```

The script starts the built Nitro output, waits for
`http://127.0.0.1:17282/api/v1/version`, verifies that exactly one listener is
present and its local address is `127.0.0.1`, verifies that
`/v1/market/health` returns `404`, and stops only the process it started.

For an operator-visible check, run `pnpm start` in a separate PowerShell window
and open `http://127.0.0.1:17282/`. Confirm the dashboard separates:

- bridge readiness;
- FQGate process state and PID;
- health endpoint availability/network readiness;
- market-session state;
- compatibility state.

The QR action must remain unavailable when FQGate is absent, stopped, unhealthy,
or compatibility is not validated.

If FQGate is already running, record its managed PID before starting the bridge
and confirm it is unchanged after stopping the bridge smoke process. The bridge
runtime has no lifecycle-control route and must not stop FQGate as part of this
check.

## Real FQGate and QR acceptance

Use the existing lifecycle CLI and the interactive FQGate session to establish a
safe real-host baseline:

```powershell
node .\dist\cli\main.js fqgate status --json
node .\dist\cli\main.js fqgate health --json
```

If the real session is already connected, leave it intact unless the operator
explicitly authorizes a reversible test logout. When a QR test is safe:

1. Open `/login` on the same Windows host.
2. Begin the QR flow and confirm the bridge returns an opaque `sessionId` and a
   rendered QR image, never an upstream numeric `flow_id`.
3. Scan the QR with the intended account and observe `waiting_for_scan`,
   `waiting_for_confirmation`, then `connected` as applicable.
4. Confirm the dashboard refetches and shows a connected market session.
5. Inspect normal logs to confirm they contain operation IDs and bounded request
   IDs only, not QR base64, flow IDs, or session material.

If the real QR flow cannot be tested without destructive account/session
manipulation, stop at the safe loopback and fake-E2E checks. Do not weaken the
bridge to make the test pass.

## Evidence to record

Record the date, Windows version/architecture, Node/pnpm versions, bridge commit,
FQGate version, listener check, API status response, raw-path `404`, and whether
real QR begin/poll/scan was completed. Do not record QR images, account data,
cookies, credentials, or full session identifiers.

## Recorded acceptance

The following acceptance completed on 2026-09-17:

- Repository: `D:\code\research\fqgate-remote-bridge`, source revision
  `d794259`.
- Host: Windows 11 version `10.0.26200`, 64-bit; Node `v24.15.0`;
  pnpm `11.23.0`.
- FQGate: managed version `1.0.0`, validated, running on its expected
  loopback process path.
- Checks: frozen-lockfile install, typecheck, lint, 78 unit/integration/UI
  tests, production build, format check, `-VerifyCli`, and `-VerifyBridge`.
- Bridge: exactly one listener on `127.0.0.1:17282`; raw
  `/v1/market/health` returned HTTP 404.
- QR: initial state was `connected=false`/ `session=unknown`; the browser
  opened `/login`, rendered a short-lived QR, completed the real scan and
  confirmation, then returned to the dashboard with `Connected / formal`.
- Final API: `GET /api/v1/status` returned `connected=true` and
  `session=connected`; browser console had no errors after completion.
- Cleanup: only the bridge process started for this test was stopped; FQGate
  remained running. Temporary QR screenshots/logs were removed.

The production runtime also normalizes browser/client disconnects to HTTP `499`
and suppresses raw H3 stack traces. Unexpected framework failures use bounded
structured metadata; QR payloads, flow IDs, and session material remain absent
from logs.

Phase 2 is fully closed after this safe real QR login on the target
Windows/FQGate combination. Future re-runs must still avoid destructive logout
or recording QR/session material.

After this real-QR run, the current revision `00e4258` was reinstalled and
passed the same Windows checks with 80 tests, including the production
client-abort logging hardening. The already-connected FQGate process remained
running and was not logged out for that follow-up.
