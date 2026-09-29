# Post-Phase-5 FQGate 1.0.4 qualification handoff

Status: **CLOSED — permanent-Windows local, real remote-human/admin/machine, and exact runtime-commit CI passed on 2026-09-29.**

Task: `docs/tasks/post-phase-5-fqgate-1-0-4-dashboard-qualification.md`.
Design: `docs/plans/post-phase-5-fqgate-1-0-4-local-qualification.md`.
Permanent checkout: `D:\code\research\fqgate-remote-bridge` on `WORK-PC`.

## Scope and implementation

The runtime implementation baseline is
`c03a3393597ad44dc00b0c1975ec4ab19d8b90b0`. It fixes the official
release repository at `fqgate/FQGate-releases`, retains only the exact old
manifest URL as an external-config compatibility alias, and adds the local-only
Dashboard operation `updates.qualify`. That operation binds the live plan,
refreshed artifact and installed baseline to the fixed lookup qualification
probe, then uses the existing lifecycle integrity, health, OpenAPI, evidence
and rollback gates. `fqgate qualify` remains available. No remote allowlist,
market operation, Cloudflare write surface or Phase 6-B2/C behavior changed.

The original Dashboard qualification on 2026-09-28 is recorded in the task
package. A Windows 11 reset then removed the C-drive managed installation,
cloudflared service and user Vault entries while preserving the permanent
D-drive checkout. This closure restored the same official 1.0.4 artifact by
the guarded managed qualification path after the operator completed FQGate's
first-run desktop confirmation. The restoration is separate from, and does not
rewrite, the earlier Dashboard upgrade evidence.

## Exact artifact and live runtime

The final native Windows CLI/file/listener check recorded at
`D:\code\research\fqgate-1-0-4-closure-local\final-runtime-check.json`
returned:

| Check                                  | Result                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed lifecycle/process              | `ready` / `running`; actual path equals expected managed path                                                                                               |
| Version                                | `1.0.4`                                                                                                                                                     |
| Official Windows x64 executable        | 23,201,792 bytes; SHA-256 `6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290`                                                                |
| Compatibility and lookup qualification | `validated`; `market.instruments.lookup` contract fingerprint `a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5`, exact-code semantic probe |
| Health                                 | HTTP 200; `networkReady=true`; `connected=true`                                                                                                             |
| Listeners                              | exactly `127.0.0.1:17281` and `127.0.0.1:17282`                                                                                                             |

The temporary ten-minute health timeout applied only to the post-reset
first-run qualification attempt. It did not bypass candidate integrity,
runtime OpenAPI, semantic probe, health, identity or rollback checks. The
normal external acceptance config was retained for the final runtime.

## Permanent-Windows and CI evidence

All commands below ran in native Windows PowerShell against the existing
permanent checkout at `main@7c8e4d6de0354e1250901a3b612fca5b61537c81`.
The first Playwright attempt only lacked its browser
binary; after the required local Chromium install, the exact E2E rerun passed.
The reset also removed Git for Windows; the official winget package was
hash-verified and installed. Because the preserved D-drive repository still
carried its pre-reset owner SID, the remote-matrix evidence process used an
exact-path, process-local Git `safe.directory` setting. No global Git trust
setting or repository ownership was changed.

| Gate                                                                                 | Final bounded result                                                                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen pnpm install, typecheck, lint, build, format                                  | PASS; exit 0 each                                                                                                                          |
| Unit/integration tests                                                               | PASS; 20 files, 245 tests                                                                                                                  |
| Playwright E2E                                                                       | PASS; 15 tests                                                                                                                             |
| `acceptance.ps1 -VerifyCli -VerifyBridge`                                            | PASS; production loopback and deny-by-default smoke                                                                                        |
| `phase5a-acceptance.ps1 -VerifyLocal`                                                | PASS; both loopback listeners, raw-path/Host denial and protected cloudflared token-file service                                           |
| **Native** `phase5b-acceptance.ps1 -Census -VerifyLocal`                             | PASS; live 1.0.4 contract census, approved fingerprint and semantic probes, local request/denial checks                                    |
| `phase5c-acceptance.ps1 -VerifyLocal`                                                | PASS; machine matrix 6/6 and listener checks 2/2                                                                                           |
| `phase45-acceptance.ps1 -RunAuthenticatedBrowserMatrix`                              | PASS; exit 0, 74 PASS / 0 FAIL, including ordinary/admin authenticated operations, remote denial paths and 360/390/430/768-pixel viewports |
| `phase5c-acceptance.ps1 -RunAuthenticatedServiceTokenMatrix -CredentialSource Vault` | PASS; real service-token matrix 22/22 and Windows checks 3/3                                                                               |

The Phase 5-C entry point wrote its secret-free bounded evidence to
`D:\code\research\fqgate-phase5c-remote-evidence.json` with that exact
checkout commit, `matrixExitCode=0`, `failed=0` and `pending=0`.

The browser harness used non-persistent headed Edge contexts. The operator
completed only the ordinary and separate admin Cloudflare Access login/MFA
steps and pressed Enter at the harness prompts. The harness ran the HTTP,
authorization, route, negative and responsive checks. Its fixed output also
contains expected SKIPs for a cloudflared restart exercise, local maintenance
mode, and live confirmation negatives when no activatable candidate existed;
the deterministic confirmation suite remains covered by the repository tests.
No remote `updates.apply` was run to manufacture an update candidate. The
browser transcript remains repo-external and must not be committed because it
comes from authenticated browser acceptance:
`D:\code\research\fqgate-1-0-4-closure-local\phase45-browser-transcript.txt`.

The exact runtime implementation commit
`c03a3393597ad44dc00b0c1975ec4ab19d8b90b0` passed [GitHub Actions run
36372964583](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/36372964583):
Ubuntu job `108772902641` and Windows job `108772902787`, both with matching
`headSha` and `conclusion=success`. Closure changes only documentation; runtime
code did not change, so no new runtime-commit CI was required.

## Tunnel restoration and scope boundary

The existing Tunnel connector token was entered only in a hidden prompt and
stored in the protected LocalSystem token file. The existing machine Client
ID/Secret and Cloudflare read-only API token were re-enrolled through hidden
prompts in the current-user Vault. No credential was written to Git, command
arguments, logs or evidence. Before network repair, the machine host returned
Cloudflare 1033 and read-only discovery reported the Tunnel `down`. The
operator enabled daed direct-egress rules for Cloudflare Tunnel endpoints on
TCP/UDP 7844. Subsequent read-only discovery reported `healthy`, the 46-check
Cloudflare plan was in sync with zero drift or conflicts, and both real remote
matrices passed through the same Tunnel. These observations prove the route
used for this acceptance; they do not require an inbound port forward or
authorize changes to Cloudflare control-plane resources.

No Phase 6-B1 DNS canary or production write was rerun for this maintenance
closure. Its existing deterministic regression coverage remained green.
Phase 6-B2 and Phase 6-C remain unimplemented and unauthorized pending
separate reviewed tasks.
