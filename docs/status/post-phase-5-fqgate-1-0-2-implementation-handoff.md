# Post-Phase-5 FQGate 1.0.2 compatibility maintenance handoff

Date: **2026-09-21**  
Status: **CLOSED — permanent-Windows 1.0.2, local, remote and CI acceptance passed**

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

The initial implementation handoff had not yet recorded the complete repository gates or the
permanent-Windows result. The synchronized closure evidence is recorded below; the only
operator boundary encountered was hidden service-token entry for the real remote matrix.

## Final verification snapshot (2026-09-21)

The implementation and documentation baseline was
`main@2797bea6775876c8f2707bb68ebb8eaa724e8b9b`. The final CI run for that exact commit was
`35565062952` ([GitHub Actions](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/35565062952));
Ubuntu and Windows jobs both passed. The permanent Windows toolchain recorded Node v24.15.0,
pnpm 11.23.0 and PowerShell 5.1.26100.9444.

The bounded qualification evidence at
`D:\code\research\fqgate-post-phase5-1-0-2-evidence.json` records the automated candidate
checks through `P5Q-Q5` as PASS:

```text
P5Q-M1: official 1.0.2 package, 23065088 bytes,
        SHA-256 024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2
P5Q-B1: known-good 1.0.1 baseline PASS
P5Q-B2/P5Q-B3: exactly one IPv4-loopback listener on 17281/17282 PASS
P5Q-B4: 89 runtime operations, approved lookup fingerprint, one exact-code result PASS
P5Q-Q1: quarantined 1.0.2 qualification PASS
P5Q-Q3: active 1.0.2 artifact identity and health PASS
P5Q-Q4/P5Q-Q5: exactly one IPv4-loopback listener on 17281/17282 PASS
```

The first wrapper's `P5Q-R1` record was an acceptance-environment failure, not a candidate
or market failure: the already-running Bridge process had been launched without
`FQGATE_REMOTE_BRIDGE_CONFIG` and therefore used the default compatibility list. After that
process was stopped and the Bridge was relaunched with the repo-external acceptance config,
the same bounded Phase 5-B and Phase 5-C local commands passed:

```text
Phase 5-B: P5B-C1/C2/C3/C4/C5/C6 PASS; P5B-L2/L3/L4/L5/L6 PASS
Phase 5-C: P5C-W2 17281/17282 PASS; P5C-L2/L3/L4/L5/L6/L7 PASS
P5C-SUMMARY: total 6, passed 6, failed 0
P5C-W-SUMMARY: total 2, passed 2, failed 0
```

The final live state is:

```text
active version: 1.0.2
artifact size: 23065088
artifact SHA-256: 024bf1a395977856e70d7b03a3d6616620f82dfbf4872ca710a70b138ae47bc2
qualification: market.instruments.lookup / approved fingerprint / exact-code-v1
FQGate: ready, connected, 127.0.0.1:17281
Bridge: 127.0.0.1:17282 with the acceptance config loaded
```

## Closure evidence

The real remote-machine service-token command completed using the existing hidden
`Read-Host -AsSecureString` prompts. No QR login was needed. The external bounded file is:

```text
D:\code\research\fqgate-phase5c-remote-evidence.json
```

It records `commit=2797bea6775876c8f2707bb68ebb8eaa724e8b9b`, `matrixExitCode=0`,
`failed=0`, `pending=0`, and a machine-derived remote `P5C-SUMMARY` of 21/21 PASS. The
wrapper recorded `P5C-W-SUMMARY` 3/3 PASS, including both loopback listeners and Bridge-only
ingress with no 17281 route. The remote matrix proved the filtered machine document and
lookup, malformed/oversized rejection, all old-operation/raw/page/static denials, human/admin
hostname isolation, and never called `updates.apply`.

This task is closed. Phase 6 and additional market operations remain outside scope.
