# Coding-agent goal — close Post-Phase-5 FQGate 1.0.4 qualification

Close only the active FQGate 1.0.4 maintenance task in
`blooddrunk/fqgate-remote-bridge`.

Use the existing permanent Windows checkout only:

```text
D:\code\research\fqgate-remote-bridge
```

Do not create a second checkout and do not bypass repo-external operator state.
Phase 6-B2 and Phase 6-C are still unauthorized. Do not implement Cloudflare
Tunnel/Access provisioning, widen any Bridge caller allowlist, add market-data
operations, or change the Phase 6-B1 write surface as part of this task.

## Read first

Treat these as authoritative:

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/plans/post-phase-5-fqgate-1-0-4-local-qualification.md`
- `docs/tasks/post-phase-5-fqgate-1-0-4-dashboard-qualification.md`
- `docs/operations/windows-phase-4-5-acceptance.md`
- `docs/operations/windows-phase-5-b-acceptance.md`
- `docs/operations/windows-phase-5-c-acceptance.md`
- `docs/status/phase-6-b1-implementation-handoff.md`

The runtime implementation baseline is
`c03a3393597ad44dc00b0c1975ec4ab19d8b90b0`. It already passed GitHub Actions
run `36372964583`: Ubuntu job `108772902641` and Windows job
`108772902787`. The permanent Windows Dashboard has already qualified and
installed official FQGate 1.0.4 with SHA-256
`6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290`.
Do not redo the upgrade merely to create evidence.

## Goal

Finish the remaining real remote closure against the already-qualified FQGate
1.0.4 runtime, then mark the maintenance task CLOSED only if every required
regression is green.

The required closure proves all of the following without widening policy:

1. FQGate is still the managed official 1.0.4 artifact and is healthy/connected.
2. FQGate and Bridge listeners remain exactly `127.0.0.1:17281` and
   `127.0.0.1:17282`.
3. The existing remote-human and remote-admin browser matrix passes through the
   real Cloudflare Access applications.
4. The existing remote-machine service-token matrix passes through its separate
   Access application and still exposes only the Phase 5-C read-only surface.
5. `updates.qualify` remains local-only. Remote human/admin/machine callers do
   not inherit it.
6. Phase 6-B1 remains regression-green and no Cloudflare write/canary is needed
   for this maintenance closure.
7. If runtime code changes while fixing a real regression, the changed runtime
   commit receives fresh exact-commit Ubuntu and Windows CI before closure.

## Automate first

Start in native Windows PowerShell, not a WSL-hosted PowerShell process:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
git status --short
git rev-parse HEAD
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

The previous generic `P5B-CENSUS FAIL` occurred only when the aggregate
PowerShell wrapper was launched through WSL and `& node.exe` did not populate
`$LASTEXITCODE`. Native Windows PowerShell is the required retry environment.
Do not paper over a native failure by citing the earlier direct-module success;
if it fails natively, capture the exact bounded failing check and fix the actual
wrapper/runtime defect before continuing.

Before remote tests, automatically verify the active artifact identity and
listeners from the existing CLI/config. Expected artifact:

```text
version = 1.0.4
size = 23201792
sha256 = 6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290
process actualPath = expected managed path
health HTTP = 200
networkReady = true
connected = true
```

Do not manually copy executables, force-kill an unidentified process, weaken the
managed-process identity check, or widen compatibility/version rules.

## Real remote-human + remote-admin regression

Run the existing authenticated browser helper:

```powershell
.\scripts\windows\phase45-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedBrowserMatrix
```

Prefer the default Edge channel. Use `-BrowserChannel chromium` only if the
runbook's supported local browser condition requires it.

The helper must perform all machine-verifiable HTTP, authorization, negative,
responsive and route checks itself. Do not ask the operator to inspect cookies,
JWTs, network payloads, policy JSON or screenshots.

The only expected human boundary here is real Cloudflare Access
authentication/MFA in the non-persistent headed browser opened by the helper:

1. when the ordinary-human Access page is shown, authenticate with the already
   approved ordinary identity and complete its required verification;
2. when the separate admin Access page is shown, authenticate with the intended
   admin identity and complete MFA;
3. return to the helper and let it complete the matrix automatically.

Never export or persist browser storage, Access cookies/JWTs/assertions,
confirmation grants, QR/session data, screenshots or traces containing secrets.

A remote-human/admin failure is not permission to expand an allowlist or relax
Access/JWT/Origin/CSRF checks. Diagnose the exact existing contract first.

## Real remote-machine regression

Use the existing Vault-backed machine credentials and the existing tunnel
ingress evidence:

```powershell
.\scripts\windows\phase5c-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedServiceTokenMatrix `
  -TunnelIngressConfigPath D:\code\research\fqgate-machine-tunnel-ingress-evidence.json `
  -CredentialSource Vault
```

This must automatically prove the approved machine OpenAPI/lookup surface,
malformed/oversized handling, forbidden old/raw/page/static routes, forwarded or
unknown Host denial, and human/admin/session/update isolation. Do not paste
service-token credentials into arguments, files, logs or chat.

If and only if automation returns the exact normalized `LOGIN_REQUIRED`
condition for the local FQGate session, the human boundary is:

1. open `http://127.0.0.1:17282/login` on the permanent Windows host;
2. start the existing FQGate QR login flow;
3. physically scan and approve that QR with the intended FQGate client;
4. wait until the local session reports connected;
5. rerun the exact machine-regression command above.

Do not interpret `UPSTREAM_UNAVAILABLE`, timeout, Access denial, bad token,
network failure, or any other error as permission to request a QR login.

## Phase 6-B1 regression boundary

This maintenance task did not change the B1 Cloudflare apply implementation.
Use the repository test suite plus existing loopback/policy checks as the normal
B1 regression proof. Do not create a new DNS TXT canary and do not request a
DNS-write token solely to close FQGate 1.0.4 qualification.

If review discovers an actual B1 runtime regression caused by this maintenance
change, stop closure, reproduce it deterministically, fix it within the smallest
scope, and then run the existing B1 acceptance contract. Do not silently expand
B1 into Phase 6-B2.

## Human-intervention rule

Automate every check that an API, CLI, script or browser harness can observe.
A statement such as "evidence not fully recorded", "manual verification needed",
or an unexplained internal acronym is not an acceptable closure result.

If a genuinely API-unobservable manual property blocks closure, report all of
the following before asking for human action:

- exact product/UI navigation path;
- exact field or control;
- exact expected value/state;
- why existing APIs/scripts cannot prove it;
- what must not be changed;
- the exact command that resumes automation immediately afterward.

Expected human-only boundaries for this task are limited to the already-required
Cloudflare Access login/MFA and, only on exact `LOGIN_REQUIRED`, physical
FQGate QR approval.

## Closure evidence and repository updates

When all remote regressions pass:

1. create
   `docs/status/post-phase-5-fqgate-1-0-4-implementation-handoff.md`;
2. record bounded, secret-free evidence: active artifact version/size/SHA,
   listener addresses, local gate results, native Phase 5-B wrapper result,
   remote-human/admin matrix counts, remote-machine matrix counts, and exact
   implementation commit;
3. record CI run ID and Ubuntu/Windows job IDs. The already-known implementation
   baseline is `c03a339...` / run `36372964583`; if runtime code changed,
   replace these with the new exact implementation commit and its successful CI;
4. change the 1.0.4 task and roadmap status to CLOSED and synchronize README /
   agent guidance only where status wording is stale;
5. leave Phase 6-B2 and Phase 6-C explicitly unauthorized. Do not implement them
   in the same change.

If a regression cannot be closed safely, leave the task ACTIVE and record the
exact automated failing check, bounded result, root cause if known, and precise
resume command. Do not claim closure and do not substitute a vague evidence
note.
