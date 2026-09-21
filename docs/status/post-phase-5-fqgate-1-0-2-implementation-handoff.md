# Post-Phase-5 FQGate 1.0.2 compatibility maintenance handoff

Date: **2026-09-21**  
Status: **IMPLEMENTATION IN PROGRESS — live Windows/remote/CI closure pending**

## Scope

This maintenance track refreshes the permanent FQGate environment from 1.0.1 to the official
stable 1.0.2 release and removes lookup's active-version coupling. It does not add a market
operation, change any Phase 5 caller context, expose FQGate, provision Cloudflare, or alter the
machine allowlist.

## Implemented model

The lifecycle now has a quarantined `fqgate qualify` boundary. A candidate must first satisfy
the configured supported semantic-version range and the existing official manifest, size,
checksum, candidate identity, health, OpenAPI required-contract, concurrency, and rollback
checks. It is not admitted as an ordinary update merely because it is in the range.

Qualification persists only bounded, artifact-bound evidence:

```text
operation ID
approved operation/transitive-schema fingerprint
semantic probe ID
qualification timestamp
```

`market.instruments.lookup` requires all of the following at call time:

1. a supported running FQGate;
2. stored evidence for `market.instruments.lookup` and the reviewed probe ID;
3. the current approved operation fingerprint matching the stored evidence; and
4. the existing strict six-digit request/envelope/result decoder.

The reviewed fingerprint ledger currently contains the historical Phase 5 fingerprint:

```text
a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5
```

The pre-upgrade 1.0.1 state format remains usable through a narrowly scoped historical
compatibility bridge. New versions cannot use that bridge and require persisted qualification
evidence. A changed fingerprint remains denied until a reviewed ledger change and a new bounded
semantic probe pass.

## Code and harness evidence

Implemented changes include:

- operation qualification evidence and state validation;
- supported-but-unqualified candidate validation;
- shared lifecycle qualification/rollback transaction;
- `fqgate qualify [--dry-run] [--json]`;
- operation-scoped lookup fingerprint/probe binding;
- new permanent-Windows qualification harness;
- Phase 5-B/5-C matrix error allowlist updates;
- deterministic unchanged-patch, changed-contract, semantic-failure, unsupported-major,
  and rollback tests.

Deterministic checks already passing in this working tree:

```text
TypeScript noEmit: passed
Focused qualification/Phase 5-B/Windows-script tests: 66 passed
```

The complete repository gates and the permanent-Windows command were pending at the initial
implementation handoff; the current verification snapshot below records the synchronized
results and the remaining live qualification boundary.

## Current verification snapshot (2026-09-21)

The implementation is synchronized to exact commit
`7b8a9d234bc0c25a6246b9165f7388bd6d548614` on both the repository and permanent Windows
`main` checkouts. The final Ubuntu and Windows CI jobs passed in run
`35564718411`:

- `Checks (ubuntu-latest)`: success, job `106224173387`;
- `Checks (windows-latest)`: success, job `106224173207`.

Permanent-Windows pre-qualification gates passed: frozen install, typecheck, lint, 205 unit
tests, production build, format check, and 13 browser tests. The exact stable manifest check
also passed for `FQGate-1.0.2-windows-x64-UNSIGNED.exe`, 23065088 bytes,
SHA-256 `024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2`.

The bounded harness recorded two candidate attempts. Each preserved the baseline census
(89 runtime operations, approved lookup fingerprint, one exact-code result), then failed
candidate health readiness and automatically restored the known-good 1.0.1 executable.
The authoritative permanent-Windows state after the latest attempt is:

```text
active version: 1.0.1
last activation: rolled_back
FQGate listener: exactly 127.0.0.1:17281
Bridge listener: exactly 127.0.0.1:17282
```

The direct CLI diagnostic identified the candidate failure as `HEALTH_TIMEOUT`: the 1.0.2
GUI process remained responsive but did not expose the health listener. The upstream Windows
installer documents that first launch can require a user-completed risk confirmation before
health becomes available. That confirmation has not yet been completed, so no QR/login or
service-token boundary has been opened and the remote matrix has not run. The generated
external evidence file remains bounded and outside Git at
`D:\code\research\fqgate-post-phase5-1-0-2-evidence.json`; the task remains ACTIVE until
the first-use confirmation is completed and the full 1.0.2/local/remote evidence is recorded.

## Required closure evidence

Run the command in:

```text
docs/operations/windows-post-phase-5-fqgate-1-0-2-qualification.md
```

It must produce the external bounded file:

```text
D:\code\research\fqgate-post-phase5-1-0-2-evidence.json
```

The handoff must then be updated with the exact final commit, CI run IDs, `P5Q-SUMMARY` totals,
local/remote machine totals, active 1.0.2 identity, and any actual QR/manual boundary. Until
those values exist, the task package stays **ACTIVE**.
