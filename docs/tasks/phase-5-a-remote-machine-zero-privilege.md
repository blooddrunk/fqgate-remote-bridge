# Phase 5-A Task — Remote-machine identity/context, zero privilege

Date: 2026-09-19

Status: **ACTIVE**

Planning baseline: `main@fe544b3a8fa25227521c68dcb08ff110ce8c6b67`.

## Objective

Implement and close the smallest safe Phase 5 checkpoint:

> A real Cloudflare Access service-token identity can be recognized by the
> Bridge as `remote_machine`, but `remote_machine` is authorized for **zero
> existing Bridge operations**.

Do not add any market-data operation in this task.

## Source of truth

Read in this order before editing:

1. `README.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/security.md`
5. `docs/upstream-contracts.md`
6. `docs/roadmap.md`
7. `docs/plans/phase-5-remote-machine-read-only-api.md`
8. this task
9. `docs/status/phase-4-5-implementation-handoff.md`
10. relevant Phase 4.5 tests and acceptance scripts

## Hard boundaries

Preserve all closed Phase 0-4.5 behavior.

Do not:

- add a market-data Bridge operation;
- add a generic/raw FQGate proxy;
- allow `remote_machine` into any current operation's `allowedContexts`;
- expose QR/session/update/admin/OpenAPI-refresh to a machine;
- weaken human/admin authentication to accommodate machine tokens;
- persist service-token Client ID/Secret in repo config, logs, artifacts,
  browser storage, docs, or command-line arguments;
- automate Cloudflare resource provisioning (Phase 6);
- add MCP/WebSocket support;
- add trading or any financial state-changing operation.

## A. Establish the exact baseline automatically

The permanent Windows test environment is under `D:\code\research`.

Before implementation, resolve the existing Git working tree inside that
directory. Prefer the existing `D:\code\research\fqgate-remote-bridge`
checkout if present; if the repository is mounted directly at
`D:\code\research`, use that. Do not create a second temporary acceptance
checkout merely for convenience.

Record:

```text
resolved Windows Git root
git status --short
git rev-parse HEAD
node --version
corepack pnpm --version
```

Sync with `origin/main` using fast-forward only. If the working tree contains
operator-owned uncommitted changes, do not discard them; report the exact paths
and perform implementation in the existing development checkout while keeping
the permanent target intact until a safe sync is possible.

Before code changes, confirm the baseline GitHub Actions result is green.

## B. Config and request-context model

Implement machine-specific non-secret metadata:

```text
remoteAccess.machineHostname
remoteAccess.machineAccess.teamDomain
remoteAccess.machineAccess.audience
```

Rules:

- machine hostname and machineAccess are configured together;
- human/admin/machine hostnames must all be pairwise distinct;
- each hostname is exact DNS-only input;
- team domain is a validated Cloudflare Access team domain;
- audience is bounded opaque metadata;
- service-token Client ID/Secret are not accepted here;
- unknown/ambiguous Host fails closed;
- `X-Forwarded-Host`, `Forwarded`, source IP, and similar metadata never
  select a context.

Add `remote_machine` to the request-context type and classification path.

## C. Refactor JWT/JWK plumbing without collapsing claim profiles

The current admin verifier correctly requires a non-empty human `sub`.
Cloudflare service-token JWTs instead use an application-token shape with
`type=app`, a service-token `common_name`, and empty `sub`.

Refactor only as much generic cryptographic infrastructure as needed:

Shared candidates:

- fixed team-domain cert endpoint derivation;
- bounded JWK fetch/cache/key rotation;
- RS256 signature verification;
- exact issuer/AUD/time validation;
- bounded assertion parsing.

Keep separate claim validators:

### Human admin

Continue requiring the existing human semantics and return a
`kind: "human"` principal. Do not relax this path.

### Machine service token

Require at least:

- `type === "app"`;
- exact issuer and exact single application AUD;
- valid `iat` and `exp` (and valid `nbf` when present);
- bounded non-empty `common_name`;
- empty `sub` service-token semantics;
- a `kind: "machine"` principal.

No service-token secret is available to or needed by the Bridge verifier; the
Bridge verifies the signed assertion Cloudflare places at the origin.

All errors must remain token-safe and bounded.

## D. Zero-privilege authorization checkpoint

Extend registry invariants to recognize `remote_machine` as a valid context
type, but do not add it to any current operation's `allowedContexts`.

Automated proof must show that a valid machine principal cannot invoke any of:

```text
bridge.version
bridge.capabilities
bridge.status
session.qr.begin
session.qr.poll
updates.status
updates.check
updates.plan
updates.apply
openapi.catalog
openapi.refresh
```

The complete context × operation matrix must be tested server-side, independent
of UI visibility.

Also prove the machine hostname cannot use page/static routing to bypass the
operation gate. The exact transport status may follow the existing normalized
policy, but it must not expose the ordinary/admin Dashboard as an authorization
path.

## E. Deterministic automated tests

At minimum add coverage for:

### Configuration/host matrix

- valid distinct human/admin/machine hostnames;
- every pairwise duplicate rejected;
- incomplete machine hostname/access pair rejected;
- invalid team domain/AUD rejected;
- unknown Host rejected;
- forwarded-host spoofing rejected.

### Machine JWT

Use deterministic generated test keys/JWK fixtures:

- valid service-token JWT accepted as machine;
- missing assertion;
- malformed JWT;
- non-RS256;
- bad signature;
- wrong issuer;
- wrong AUD;
- multiple/unexpected AUD;
- expired;
- not-yet-valid;
- future `iat`;
- unknown `kid` with one bounded refresh;
- JWK fetch/cache/failure/rotation cases;
- `type != app` denied;
- missing/empty/oversized `common_name` denied;
- non-empty `sub` denied for machine;
- human token cannot become machine;
- machine token cannot become admin;
- assertion/JWK/token values never leak into errors/logs.

### Authorization regressions

- full four-context × all-current-operation matrix;
- all Phase 4 remote-human expectations unchanged;
- all Phase 4.5 remote-admin expectations unchanged;
- local semantics unchanged;
- raw/unregistered upstream routes still denied;
- no wildcard CORS/proxy introduced.

## F. Permanent Windows verification — automatic by default

After implementation, sync/build/run the permanent Windows checkout under
`D:\code\research` and execute as much as possible automatically.

Required commands/gates:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
corepack pnpm test:e2e
```

Also run the existing Windows CLI/loopback smoke paths and add a Phase 5-A
acceptance mode/script. The Phase 5-A script must automatically verify:

- FQGate listener remains only on loopback;
- Bridge listener remains only on loopback;
- existing human/admin host configuration still works as before;
- machine hostname is distinct;
- unknown Host/raw FQGate paths are denied;
- no secret-bearing values appear in normal output.

Normal CI must remain credential-free and deterministic. GitHub Actions must be
green on both Ubuntu and Windows before closure.

## G. Real Cloudflare service-token acceptance

Real service-token acceptance is mandatory before Phase 5-A can close because
the machine claim profile differs from the human profile.

### G1. What Codex must automate

Implement a bounded Windows acceptance companion that, after credentials are
provided through a secret-safe operator boundary, automatically runs the remote
matrix and prints only:

```text
test ID
PASS/FAIL
HTTP status
normalized Bridge/edge error code when available
redacted hostname/application label
timestamp
```

Never print or persist:

- Client ID;
- Client Secret;
- `Cf-Access-Jwt-Assertion`;
- cookies;
- raw JWT claims;
- Tunnel token;
- response bodies that might contain secrets.

The companion must not call a mutating update operation.

The live matrix must prove at least:

1. machine hostname without service credentials is rejected/challenged by
   Access;
2. valid machine service credentials pass Access and reach the Bridge;
3. a safe current Bridge operation such as `bridge.version` is rejected by
   the Bridge with the normalized operation-forbidden result, proving
   authentication succeeded but zero privilege held;
4. the same machine credentials do not gain ordinary-human/admin privilege on
   their hostnames;
5. raw/unregistered FQGate paths remain unavailable through the machine
   hostname;
6. Tunnel ingress for the machine hostname targets only
   `http://127.0.0.1:17282`, never `17281`.

The complete dangerous-operation deny matrix remains deterministic/fake-backed;
do not live-call `updates.apply` just to prove denial.

### G2. Exact manual boundary — Cloudflare setup

This is manual only because automated Cloudflare provisioning is explicitly
deferred to Phase 6.

If the resources do not already exist, the operator performs exactly:

1. In Cloudflare Zero Trust, create a **separate self-hosted Access
   application** for the chosen machine/API hostname.
2. Create a **service token** under Access controls -> Service credentials.
3. Attach an Access policy to the machine application with action
   **Service Auth**, scoped to that service token. Do not use Bypass.
4. Record only the non-secret application AUD, team domain, and hostname in
   the local repo-external acceptance config.
5. Add the machine hostname to the existing remotely-managed Tunnel with origin
   exactly `http://127.0.0.1:17282`. Do not add any `17281` route.
6. Keep the service-token Client ID/Secret outside Git and normal config.

Expected result before returning to automation:

- unauthenticated request to the machine hostname does not reach an approved
  Bridge operation;
- the machine application has a distinct AUD;
- Tunnel route points only to Bridge loopback.

Do not ask the operator for screenshots containing the Client Secret.

### G3. Exact manual boundary — credential entry

The acceptance script must support secret-safe interactive input when needed.

Preferred pattern:

- prompt both Client ID and Client Secret with PowerShell
  `Read-Host -AsSecureString`;
- decrypt only in memory long enough to pass them to the bounded child request
  process through its environment;
- never place either value in process command arguments;
- clear the temporary process environment in `finally`;
- never echo the values.

The operator's only action is typing the two values into those hidden prompts.
After that, the acceptance matrix runs automatically.

This is the end of human involvement for Phase 5-A unless Cloudflare itself
reports an account-side configuration error.

## H. Documentation and closure

Update at least:

- `README.md`;
- `AGENTS.md`;
- `docs/roadmap.md`;
- `docs/security.md` if implementation changes the described auth boundary;
- `docs/architecture.md` if topology/context diagrams change;
- `docs/agent-guide.md`;
- a Phase 5-A implementation handoff/status document;
- a Phase 5-A Windows acceptance runbook/evidence document.

Closure requires all of:

1. exact baseline and final SHA recorded;
2. deterministic quality gates green;
3. Ubuntu + Windows GitHub Actions green;
4. permanent Windows `D:\code\research` verification green;
5. real service-token acceptance proves machine authentication;
6. valid machine identity still has zero Bridge operation privileges;
7. no secret-bearing evidence committed;
8. Phase 4/4.5 regressions remain green.

If the real service-token acceptance cannot be completed, leave Phase 5-A
OPEN and report the exact failed test, HTTP/error code, and the specific
remaining operator action. Do not summarize the state as merely “evidence
incomplete”.

## I. Out of scope / next task

Do not implement Phase 5-B in this task.

After Phase 5-A closes, the next task is a live FQGate contract census plus the
first minimal read-only market-data slice, based on the target Windows runtime
rather than guessed public contracts.
