# Phase 7-B1 / B1-R1 permanent-Windows acceptance

Use the existing `D:\code\research\fqgate-remote-bridge` checkout. Do not create another checkout, stop a production component, or manufacture downtime. Use the existing repo-external Bridge config file. The script reads no Cloudflare credential and requires no QR approval. The integration branch must descend from the currently fetched `origin/main`; the gate verifies this and compares the Bridge route/policy tree with that base.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git -c safe.directory=D:/code/research/fqgate-remote-bridge status --short --branch
git -c safe.directory=D:/code/research/fqgate-remote-bridge fetch origin main:refs/remotes/origin/main
git -c safe.directory=D:/code/research/fqgate-remote-bridge fetch origin codex/phase-7-b1-r1-integration:refs/remotes/origin/codex/phase-7-b1-r1-integration
git -c safe.directory=D:/code/research/fqgate-remote-bridge switch --track -c codex/phase-7-b1-r1-integration origin/codex/phase-7-b1-r1-integration
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\phase7b1-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

Before switching, inspect the status. If the existing checkout is dirty or the local integration branch already exists with unexpected history, stop and preserve that state; do not reset or overwrite it. Once on the branch, the script requires a clean checkout and a current-main base. It records fixed P7B1-01 through P7B1-15 checks and bounded secret-free evidence at `D:\code\research\fqgate-phase7b1-acceptance-evidence.json`.

The checks cover frozen install, typecheck, lint, tests, build, format, Playwright E2E, live inspect, healthy-only recovery plan, history schema/size/path and decision/action semantics, Phase 7-A watch/journal, unchanged remote route/policy source from current `origin/main`, exact loopback listeners, and unchanged Bridge/FQGate/cloudflared PID and start time across the run. Deterministic tests exercise corrupt-state rejection without touching the live history file. The script never executes a modeled restart action.

If a check fails, use its exact ID and `failureReason` from the evidence. Restore an environmental prerequisite without restarting, updating, logging in, changing Cloudflare, or modifying the repo to force a pass. Then rerun the same script. Only after a clean live pass, run exact-final-commit Ubuntu and Windows CI and record the run and job IDs in the implementation handoff.
