# Phase 5-A Implementation Handoff

Date: 2026-09-20

Status: **OPEN — deterministic implementation is present; real machine
Cloudflare service-token acceptance is not yet completed**

Baseline source SHA before implementation:

```text
2a87426f8b511031759b0b434052144476d0951f
```

The baseline GitHub Actions run for that SHA was `35424657310` and completed
successfully on both Ubuntu and Windows.

The implementation and deterministic/Windows verification commit before this
evidence-document update is:

```text
d8ad39942779ec1fc90afe46c287d4acf9b7781b
```

## Implemented boundary

Phase 5-A adds only the identity/context foundation:

- `remoteAccess.machineHostname` and `remoteAccess.machineAccess.teamDomain` /
  `audience` are non-secret, paired metadata;
- human, admin, and machine hostnames are pairwise distinct and exact DNS-only
  values;
- `remote_machine` is a first-class request context;
- machine authentication uses a separate
  `CloudflareAccessMachineJwtVerifier` with shared bounded JWK/RS256 transport
  but independent machine claims;
- machine JWTs require exact issuer/AUD, RS256, valid temporal claims,
  `type=app`, bounded non-empty `common_name`, and an explicitly empty `sub`;
- the machine principal is reduced to `{ kind: "machine", subject, audience }`;
- the existing human-admin validator still requires a non-empty `sub`;
- no current operation includes `remote_machine` in `allowedContexts`;
- the top-level application gate rejects machine-host page/static/unregistered
  routes before TanStack Start can render the human Dashboard;
- the raw FQGate path remains unregistered and denied.

No Phase 5-B market-data operation, machine-facing OpenAPI, Cloudflare API
provisioning, service-token persistence, or financial state-changing operation
was added.

## Deterministic evidence

The new `tests/phase5a.test.ts` covers:

- three-way hostname collision and incomplete/invalid machine config;
- unknown Host and forwarded-host spoofing;
- valid, missing, malformed, non-RS256, bad-signature, wrong-issuer,
  wrong-AUD, multiple-AUD, expired, `nbf`, future-`iat`, wrong `type`, missing /
  blank / oversized `common_name`, and non-empty `sub` machine JWT cases;
- bounded JWK cache, one key-rotation refresh, and JWK failure;
- human/machine principal separation;
- the complete local / remote-human / remote-admin / remote-machine matrix over
  all currently registered operations;
- machine operation-forbidden behavior for every registered operation at the
  HTTP handler boundary, plus page/static/raw route denial.

The Windows script contract is covered by `tests/windows-scripts.test.ts`.
Normal CI remains credential-free.

## Local quality-gate result

On the implementation working tree, all required local commands passed:

```text
corepack pnpm install --frozen-lockfile  PASS
corepack pnpm typecheck                 PASS
corepack pnpm lint                      PASS
corepack pnpm test                      PASS — 16 files / 148 tests
corepack pnpm build                     PASS
corepack pnpm format:check              PASS
corepack pnpm test:e2e                  PASS — 13 tests
```

The Windows PowerShell harness and Node companion also pass syntax checks.
These are deterministic/local results only; they are not a substitute for the
real machine Access service-token evidence below.

The same seven commands passed on the permanent Windows checkout at
`D:\code\research\fqgate-remote-bridge`; its Windows E2E run passed 13/13.
The existing Windows CLI/loopback smoke passed with exit code 0, and the
PowerShell parser check for the new acceptance script passed.

## Live acceptance gate

The permanent Windows procedure is:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -VerifyLocal
```

After the operator creates the independent machine Access application/service
token and adds the machine hostname to the existing Tunnel, the hidden-input
matrix is:

```powershell
.\scripts\windows\phase5a-acceptance.ps1 `
  -ConfigPath D:\code\research\fqgate-acceptance-config.json `
  -RunAuthenticatedServiceTokenMatrix
```

The script accepts no credential command-line option. It prompts for Client ID
and Client Secret with `Read-Host -AsSecureString`, decrypts them only in
memory, passes them to the bounded child companion through environment
variables, and clears those variables/references in `finally`. The companion
prints only bounded test IDs, status, normalized error codes, redacted host
labels, and no response body/JWT/cookie/credential material.

This handoff must not be changed to CLOSED until the real matrix proves a valid
machine credential reaches Bridge and receives `OPERATION_FORBIDDEN`, and the
machine Tunnel ingress evidence proves exactly `http://127.0.0.1:17282` with no
`17281` route. The 2026-09-20 Windows results are recorded in the evidence
file: the existing external config has no machine hostname/team-domain/AUD,
and the authenticated wrapper exited with process status 1 before opening a
credential prompt. No live HTTP request was made, so the live matrix is
explicitly `HTTP N/A — P5A-SETUP precondition failed`, not a pass.
