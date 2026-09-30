# FQGate 1.0.4 remote closure attempt — 2026-09-29

Status: **ACTIVE — post-reset local runtime restored; real remote closure is incomplete**.

The existing `D:\code\research\fqgate-remote-bridge` working tree was synchronized
to `7c8e4d6` without replacing operator changes. The runtime implementation is
still `c03a3393597ad44dc00b0c1975ec4ab19d8b90b0`, whose historical GitHub
Actions run `36372964583` passed Ubuntu job `108772902641` and Windows job
`108772902787`. The 2026-09-28 Dashboard upgrade evidence in the task package
is historical; this attempt did not repeat the upgrade.

## Initial native Windows checks before runtime restoration

The native Windows host identified itself as `WORK-PC`. The commands were run
from a Windows Task Scheduler interactive-user process so that native child
exit codes were available. The process PATH used a temporary Corepack shim to
keep nested `pnpm` invocations at the repository's pinned 11.23.0; no repository
or system package-manager setting was changed.

| Check | Bounded result |
| --- | --- |
| Frozen install, typecheck, lint, build, format | PASS; all exit 0 |
| Unit/integration tests | PASS; 20 files, 245 tests |
| Playwright E2E | PASS; 15 tests after installing the required local Chromium revision |
| `acceptance.ps1 -VerifyCli -VerifyBridge` | PASS; production loopback and deny-by-default smoke |
| `phase5a-acceptance.ps1 -VerifyLocal` | FAIL at `P5A-W6`: no IPv4 loopback listener on 17281. `P5A-W9` reports the configured cloudflared service absent. |
| `phase5b-acceptance.ps1 -Census -VerifyLocal` | FAIL at `P5B-W2 LOOPBACK_LISTENER_REQUIRED port=17281` in native Windows PowerShell, before census. |
| `phase5c-acceptance.ps1 -VerifyLocal` | FAIL; `P5C-L2..L7` 0/6, with no stable live Bridge/FQGate runtime after the temporary smoke. |

The managed CLI returned `lifecycle: not_installed`, `process.state:
not_running`, and the configured expected executable path under
`C:\Users\xieyh\AppData\Local\FQGateRemoteBridge\fqgate\current`. Its health
probe returned `available: false`, `networkReady: null`, and `connected: null`.
The expected managed executable file and Windows service
`FQGateRemoteBridgeCloudflared` are absent on this host. Thus the live version,
size, SHA-256, managed process path, connected session, both persistent
listeners, and real Cloudflare remote matrices cannot be reverified here.

The operator confirmed that a Windows 11 reset removed the C-drive managed
installation and service while the D-drive checkout and external non-secret
configuration survived. This explains the difference from the 2026-09-28
checkpoint; it is not evidence of a Bridge code regression.

## Post-reset restoration attempt

- The fixed official FQGate release source returned 1.0.4,
  `FQGate-1.0.4-windows-x64-UNSIGNED.exe`, 23,201,792 bytes, SHA-256
  `6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290`.
  `fqgate qualify --dry-run` returned `supported_unvalidated` and `install`.
- A real `fqgate qualify` downloaded and verified that exact executable, then
  returned `HEALTH_TIMEOUT` after 120 seconds. The managed FQGate window was
  present but 17281 never listened. Because there was no known-good prior
  executable after the reset, the transaction recorded `lastActivation:
  failed` without a rollback target.
- The FQGate application log for both attempts recorded that the online risk
  declaration's confirmation phrase did not match the bundled version, so it
  fell back to its bundled risk declaration. No QR or login error was observed
  before the health timeout. The application window and its bundled declaration
  require local operator inspection; the current Windows Computer Use helper
  cannot initialize from this WSL workspace URI.
- The failed candidate was checked against its exact size/hash, absence of a
  running FQGate process and failed state, then preserved under the C-drive
  managed `fqgate/recovery` directory. A second qualification using a temporary
  600,000-ms first-run health timeout also returned `HEALTH_TIMEOUT`; the
  application window appeared, but 17281 still did not listen. The longer
  timeout did not bypass health, OpenAPI, semantic, or compatibility checks.
- Fixed official cloudflared 2026.9.0 was installed at the configured Program
  Files path. Its 54,967,280-byte executable has SHA-256
  `547057326266f0e1c7d50d102dbd22ff283d740c055bd61e94f10e2c606f89af`.
  The LocalSystem service was installed with only `tunnel run --token-file` and
  the configured protected ProgramData path. It is currently stopped with
  Win32 exit code 1067. A bounded diagnostic found that the newly entered
  token file contained only one character; it is now absent. The token value
  was never printed, logged or committed. A new hidden-input helper rejects
  short values and full commands before writing a replacement.
- Windows Credential Manager reports `VAULT_MISSING` for `CloudflareRead`,
  `MachineClientId` and `MachineClientSecret`. The original D-drive evidence
  remains historical and does not restore those credentials.

The first-run desktop confirmation and complete existing Tunnel token re-entry
were then completed as recorded below. The failures above describe the initial
post-reset state, not the current local runtime.

## Restored local runtime and rerun

The operator completed FQGate 1.0.4's first-run desktop confirmation locally.
After verifying and preserving the failed candidate's exact artifact identity,
the native Windows `fqgate qualify` retry passed. The Bridge reported
`lifecycle: ready`, a managed process at the configured current path, the exact
23,201,792-byte / SHA-256
`6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290`
artifact, `compatibility: validated`, and a qualified
`market.instruments.lookup` probe. Health returned HTTP 200, `networkReady:
true`, `connected: true`. The temporary 600,000-ms timeout was only for this
first-run retry; all integrity, health, OpenAPI, semantic and rollback gates
remained active.

The operator entered the complete existing Tunnel connector token through the
revised hidden prompt. The protected token file check reported `secure`; the
LocalSystem `FQGateRemoteBridgeCloudflared` service started and remained
`Running` after a delayed check. The token value was never recorded in this
evidence or in the repository. The production Bridge was started using the
permanent Windows config, and its listener was verified at exactly
`127.0.0.1:17282`.

| Native Windows rerun | Bounded result |
| --- | --- |
| `phase5a-acceptance.ps1 -VerifyLocal` | PASS; P5A-W1/W2/W4–W9, including both loopback listeners and protected token-file service |
| `phase5b-acceptance.ps1 -Census -VerifyLocal` | PASS; live 1.0.4 census, exact lookup contract fingerprint and semantic probes, local authorization/denial matrix |
| `phase5c-acceptance.ps1 -VerifyLocal` | PASS; P5C-L2–L7 6/6 and Windows listener checks 2/2 |

The operator re-enrolled the existing machine Client ID/Secret and Cloudflare
read-only API token in the current-user Vault via hidden PowerShell prompts.
Metadata status for all three is `READY`. The first Client Secret attempt was
rejected by the Vault format guard and never stored; a corrected entry passed.
No value was printed, logged or committed.

The real Phase 5-C remote-machine Vault matrix ran twice. It reached the
machine Access application (`P5C-R1` returned 401 without the service token),
but authenticated requests returned Cloudflare HTTP 530 / error 1033 before
reaching the Bridge. The bounded matrix result was 3/22 passed, 19 failed;
the human and admin hosts still returned their expected unauthenticated 302
Access challenges. This is a real remote failure, so the task remains ACTIVE.

Phase 6-A read-only `cloudflare discover` and `cloudflare plan` were run from
the permanent Windows tree with the Vault API token. The plan was read-only,
exit 0, 46/46 in sync, zero drift/conflicts/manual items: the Tunnel ID,
human/admin/machine ingress, DNS and Access configuration match the desired
state. The live discovery reported the Tunnel as `down`. The installed
cloudflared service remained `Running`, but its metrics showed no requests
arriving from Cloudflare. The protected token decoded to the exact desired
Tunnel ID; a bounded temporary connector reported no invalid-token or
authentication error.

A short-lived connector diagnostic reported the automatic QUIC pre-check
unable to use outbound UDP 7844. A forced HTTP/2 diagnostic also failed to
register and logged `TLS handshake with edge error: EOF` on TCP 7844, alongside
the binary's outbound TCP 7844 warning. The Windows TCP socket test alone
passed, so packet-level TCP reachability does not prove the TLS route works.
This points to the WORK-PC network egress path; check OpenWrt daed/passwall2
or upstream interception for outbound TCP/UDP 7844 to Cloudflare Tunnel edge
endpoints. No inbound port forward, Cloudflare mutation, or Phase 6-B1 canary
was attempted.

## Resume

After the operator restores direct outbound TCP/UDP 7844 to Cloudflare Tunnel
endpoints and removes proxy/TLS interception for that traffic, confirm the
read-only Cloudflare discovery changes from `down` to an active Tunnel state.
Then rerun the exact remote checks from native Windows PowerShell in
`D:\code\research\fqgate-remote-bridge`:

```powershell
.\scripts\windows\phase45-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedBrowserMatrix
.\scripts\windows\phase5c-acceptance.ps1 -ConfigPath D:\code\research\fqgate-acceptance-config.json -RunAuthenticatedServiceTokenMatrix -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json -CredentialSource Vault
```

Only after both remote matrices pass should the task and roadmap be marked
CLOSED. Phase 6-B2 and Phase 6-C remain unauthorized.
