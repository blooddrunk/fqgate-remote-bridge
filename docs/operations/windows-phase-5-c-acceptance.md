# Windows Phase 5-C acceptance

Date: 2026-09-21

Status: **ACTIVE — local and real remote acceptance pending on the final implementation commit**

Use only the permanent checkout
`D:\code\research\fqgate-remote-bridge`, the existing repo-external
`D:\code\research\fqgate-acceptance-config.json`, and the existing machine
Access application, hostname, AUD, service token, Tunnel and ingress evidence.
Do not create or modify Cloudflare resources.

## Full automatic local sequence

From PowerShell in the permanent checkout, first confirm the working tree is
clean and safely fast-forward it to the implementation branch. Then run:

```powershell
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
.\scripts\windows\phase5c-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -VerifyLocal
```

The Phase 5-C helper requires exactly one IPv4-loopback listener on each of
17281 and 17282. Its local matrix fetches the machine document, validates the
exact two paths/operation IDs and five public schemas, proves the 64-KiB bound
and forbidden-field/path exclusions, performs the approved lookup, rejects
malformed and oversized bodies, denies the raw FQGate path, and verifies an
explicit unknown Host plus forwarded-host spoof receives HTTP 421. It emits
bounded JSON records and derives its summary totals from those records.

If `/api/v1/openapi/machine` returns 404, the running Bridge is an older build.
Stop only the Bridge process identified as launched from this permanent
checkout, rebuild, and restart the existing `start-phase4.cmd` launcher with
the same external config. Keep FQGate and cloudflared running.

## MANUAL_SECRET_ENTRY — existing machine service token

After every local command passes, run exactly:

```powershell
.\scripts\windows\phase5c-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

Enter the existing Client ID and Client Secret only into the two
`Read-Host -AsSecureString` prompts. Do not place either value in chat,
arguments, config, files, screenshots, shell history or logs. The wrapper
briefly decrypts them in memory, supplies them to one child through environment
variables, clears references in `finally`, and persists only bounded non-secret
records to `D:\code\research\fqgate-phase5c-remote-evidence.json`.

After the hidden entries, automation verifies the no-credential Access
challenge, filtered document, approved lookup, malformed/oversized rejection,
every old operation except the deliberately uncalled `updates.apply`,
QR/session/update/admin/openapi-refresh denial, raw/page/static denial,
human/admin hostname isolation, Bridge-only Tunnel ingress, and both loopback
listeners. The complete `updates.apply` denial remains deterministic evidence;
the live harness never calls it. Both request and wrapper summaries calculate
their totals from emitted records.

## MANUAL_FQGATE_LOGIN — only when observed

If a bounded record first reports an exact check ID with `LOGIN_REQUIRED`:

1. Open <http://127.0.0.1:17282/login> on the permanent Windows host.
2. Start the existing QR flow and complete the physical scan/approval.
3. Rerun the exact same Phase 5-C command.

No manual JSON inspection or saved login credential is required. If no
`LOGIN_REQUIRED` record appears, no QR action is needed.

## Evidence status

The synchronized main baseline was `4f32acc0f99b5ff668668451814941b9980f4bb9`.
Windows Node v24.15.0 and pnpm 11.23.0 were recorded. Frozen install,
typecheck, lint, 17 files/189 tests and build passed. Main had one pre-existing
README table-spacing format failure; the Phase 5-C change includes the
format-only correction. Windows E2E passed 13/13, the existing CLI/loopback
smoke and Phase 5-A local checks passed, and the Phase 5-B census/local matrix
passed against FQGate 1.0.1 with the same bounded contract evidence.

Final Phase 5-C local/remote totals, implementation commit, final commit and
Ubuntu/Windows workflow IDs remain pending. Phase 5-C and Phase 5 stay OPEN
until those machine-derived records and exact-final-commit CI are green.
