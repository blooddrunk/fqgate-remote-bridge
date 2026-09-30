# Phase 6-C permanent Windows closure acceptance

Status: implementation validation in progress. Executable scope:
`docs/tasks/phase-6-c-live-closure-and-credential-retirement.md`.

Run only in the existing `D:\code\research\fqgate-remote-bridge` checkout on a
clean `codex/phase-6-c` review commit or the final `main` commit. Preserve any
operator changes. The script does not create a checkout or provision Cloudflare.

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\phase6c-acceptance.ps1 `
  -DesiredStatePath D:\code\research\fqgate-phase6a-desired.json `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json
```

The one-command chain performs frozen installation, typecheck, lint, tests,
production build, format check, Playwright, pre-run credential audit, Phase 6-A
live discovery/plan and Phase 5-C remote machine matrix, headed Phase 4.5
ordinary/admin browser matrix, local Phase 5-A/B/C regressions, exact listener
checks, post-run audit and policy-outcome comparison. The audit calls the real
read-only plan with the existing Cloudflare read Vault entry. It never prompts
for B1/B2 write or scope-read credentials and never invokes Cloudflare apply.

The pre/post audit evidence is written outside the repository to
`D:\code\research\fqgate-phase6c-audit-pre.json` and
`D:\code\research\fqgate-phase6c-audit-post.json`. The chain summary is
`D:\code\research\fqgate-phase6c-closure-evidence.json`. These contain only
fixed check IDs, pass/fail results, the plan fingerprint, commit and approved
Vault target names. Do not copy credentials, browser assertions, QR material or
raw API bodies into evidence.

If the headed browser harness pauses for ordinary or admin Cloudflare Access
authentication, complete login and MFA in the opened browser windows for the
configured ordinary/admin hostnames, without changing Access policies, Tunnel,
DNS or tokens. The same command above resumes its remaining checks when the
harness continues. If the authenticated machine probe returns exact normalized
`LOGIN_REQUIRED`, open `http://127.0.0.1:17282/login` on the Windows host,
start the existing QR flow and physically approve it, then rerun the same
command. If an authorized read or machine acceptance Vault entry is expired,
renew only that fixed target via the hidden-input flow in
`docs/operations/windows-post-phase-6-a-credential-custody.md`, then rerun the
same command. Never enroll B1/B2 provisioning credentials into the Vault.

After the implementation and documentation are committed, run the GitHub Actions
workflow for that exact final commit and record the run ID plus Ubuntu and
Windows job IDs in the implementation handoff. Do not call Phase 6 CLOSED if
any gate fails.
