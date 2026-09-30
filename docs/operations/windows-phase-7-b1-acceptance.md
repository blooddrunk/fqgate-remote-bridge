# Phase 7-B1 permanent-Windows acceptance

Use the existing `D:\code\research\fqgate-remote-bridge` checkout. Do not create another checkout, stop a production component, or manufacture downtime. Use the existing repo-external Bridge config file. The script reads no Cloudflare credential and requires no QR approval.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short --branch
git fetch origin
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\phase7b1-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json
```

The script refuses a dirty or different checkout. It records fixed P7B1-01 through P7B1-15 checks and bounded secret-free evidence at `D:\code\research\fqgate-phase7b1-acceptance-evidence.json`.

The checks cover frozen install, typecheck, lint, tests, build, format, Playwright E2E, live inspect, healthy-only recovery plan, history schema/size/path, Phase 7-A watch/journal, unchanged remote route/policy source, exact loopback listeners, and unchanged Bridge/FQGate/cloudflared PID and start time across the run. The script never executes a modeled restart action.

If a check fails, use its exact ID and `failureReason` from the evidence. Restore an environmental prerequisite without restarting, updating, logging in, changing Cloudflare, or modifying the repo to force a pass. Then rerun the same script. Only after a clean live pass, run exact-final-commit Ubuntu and Windows CI and record the run and job IDs in the implementation handoff.
