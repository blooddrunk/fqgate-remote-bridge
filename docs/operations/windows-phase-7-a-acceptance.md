# Phase 7-A permanent-Windows acceptance

Phase 7-A observes the existing deployment. It does not install an autostart mechanism, restart a component, request login, apply updates, mutate Cloudflare, or send notifications.

Use the existing clean checkout at `D:\code\research\fqgate-remote-bridge`. Keep the operator configuration outside the repository. From a native Windows PowerShell terminal:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short --branch
.\scripts\windows\phase7a-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

The script runs fixed IDs `P7A-01-CHECKOUT` through `P7A-13-REMOTE-SURFACE`, covering frozen install, typecheck, lint, unit/integration tests, build, format, Playwright E2E, live inspect, three bounded watch cycles, journal validation, exact loopback listeners, and an unchanged Bridge route/policy diff. It writes only bounded normalized results to `D:\code\research\fqgate-phase7a-acceptance-evidence.json`.

For an individual read-only check:

```powershell
node .\dist\cli\main.js supervisor inspect --config D:\code\research\fqgate-acceptance-config.json --json
node .\dist\cli\main.js supervisor watch --config D:\code\research\fqgate-acceptance-config.json --interval-ms 1000 --max-cycles 3 --json
```

The journal is under `<configured installDirectory>\supervisor`. Only fixed normalized states and event reasons are stored. A second watcher fails while `watch.lock` exists. Do not delete that lock while a watcher is running. If a watcher crashed, confirm no watcher process owns the directory before a separate operator cleanup; Phase 7-A does not perform lock recovery.

`session=login_required` is a valid observation. No QR action is needed. If `P7A-09-INSPECT` fails because Bridge, FQGate or cloudflared is absent or unhealthy, the evidence retains the normalized snapshot and exact failed ID. Restore that prerequisite under its existing runbook, then rerun the acceptance command above. Do not stop or restart a healthy production component merely to create transition evidence; the failure/recovery transitions are covered by deterministic fixtures.

After the implementation commit is pushed, record the exact Ubuntu and Windows GitHub Actions run/job IDs in the handoff and external evidence. Phase 7-A is CLOSED only when all permanent-Windows IDs and exact-final-commit CI pass. Phase 7-B recovery and Phase 7-C notifications remain unauthorized.
