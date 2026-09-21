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

The complete repository gates and the permanent-Windows command remain pending until this
implementation is synchronized to `D:\code\research\fqgate-remote-bridge`.

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
