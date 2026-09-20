# Windows Phase 5-B acceptance

Date: 2026-09-20

Status: **OPEN — final automated and remote acceptance pending**

Use only `D:\code\research\fqgate-remote-bridge`. Reuse the existing external
`D:\code\research\fqgate-acceptance-config.json` and existing machine
Access/Tunnel. Do not create Cloudflare resources or change the loopback origins.

## Automated checks

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
.\scripts\windows\acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyCli -VerifyBridge
.\scripts\windows\phase5a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyLocal
.\scripts\windows\phase5b-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -Census -VerifyLocal
```

The existing production Bridge must run the final build. Stop only its known
Bridge process and start the existing `start-phase4.cmd` launcher with the same
external configuration; keep the FQGate process and cloudflared service running.
A failed new route with HTTP 404 indicates an old Bridge process; rebuild alone
does not replace its loaded code.

Census uses the existing bounded HTTP/OpenAPI implementation, no redirects,
3-second/4-MiB OpenAPI bounds, and fixed 5-second/64-KiB market probes. Discovery
prints at most 24 candidate path identifiers/fingerprints, never raw documents.
It validates the actual running managed version and operation-reference hash
before querying. C3 uses a known six-digit instrument, C6 checks an empty/missing
code response, and C4 reports only the unselected quote candidate's shape.

P5B-L2 verifies normalized lookup output; L3/L4 verify malformed/oversized input;
L5/L6 verify raw-path and unknown/forwarded-Host denial. Deterministic tests
prove the entire context/operation matrix, including dangerous-operation denial
without live execution.

## MANUAL_SECRET_ENTRY

Only after final local acceptance passes, run:

```powershell
.\scripts\windows\phase5b-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

Enter the **existing** Client ID and Client Secret only in the two hidden
`Read-Host -AsSecureString` prompts. Never paste them into chat, arguments,
configuration, files, screenshots, or environment setup scripts. This wrapper
reuses the Phase 5-A secure-string/child-environment/finally-cleanup boundary;
its explicit `-Phase5BReadOnly` mode selects the Phase 5-B companion without
changing ordinary Phase 5-A behavior.

After input, the entire matrix runs automatically and prints bounded
PASS/FAIL/status/error/count/shape metadata. It checks challenge without
credentials, successful lookup, bad input, every old operation except
`updates.apply`, raw/page/static denial, and human/admin hostname isolation.
Old POST denial probes carry invalid bodies as a second side-effect barrier.
`updates.apply` is never live-called. Existing ingress evidence must identify
Bridge origin and contain no FQGate origin. No full market values are printed.

Expected remote IDs: P5B-R1–R5, P5B-R-deny-* (ten old operations),
P5B-R-page-* (three routes), P5B-R-human/admin, plus the reused P5A-W10/W11
companion/ingress records.

## MANUAL_FQGATE_LOGIN — only upon observed LOGIN_REQUIRED

1. Let the script first report `LOGIN_REQUIRED` with its check ID.
2. Open <http://127.0.0.1:17282/login> on the permanent Windows machine.
3. Start the existing QR flow and complete the physical scan/approval.
4. Rerun the exact census/acceptance command above.

The harness rechecks runtime/session state and resumes all probes. Do not
inspect JSON manually or supply saved login credentials. Initial census on
2026-09-20 succeeded without this action despite health session `unknown`.

## Recorded evidence

Baseline main: `4cfd725`. Windows Node v24.15.0, pnpm 11.23.0.
Baseline install/typecheck/lint/149 tests/build and 13 Windows E2E passed.
Main's three pre-existing formatting failures are corrected in this change.
CLI/loopback and P5A-W1/W2/W4–W9 passed; W3 is deliberately reserved for
remote ingress evidence. Live contract details and the selection gate are in
`docs/status/phase-5-b-implementation-handoff.md`.

Final Windows gates, local normalized matrix, real remote matrix, final commit
and Ubuntu/Windows CI results remain to be recorded. Phase 5-B stays OPEN until
every task-package closure criterion passes.
