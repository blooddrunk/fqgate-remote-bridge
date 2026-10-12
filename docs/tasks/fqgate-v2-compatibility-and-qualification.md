# FQGate v2 compatibility and qualification

Authorized 2026-10-12 by the attached goal. Base: PR #14 merged as
`40ad339d863391e8a746252581adbcee600a3fa0`.

Deliver the safe subset: independent fixed-source v2 metadata inspection and
isolated, non-executing Windows ZIP audit. Never adapt a ZIP to replaceExecutable.
All results are observations, not qualification or signature verification.
Unknown trust roots, signing algorithm/bytes contract, revocation/rotation and
persistent authenticated anti-rollback remain blockers. No v2 installer,
activation, runtime evidence approval, updater invocation, Bridge route or
permission change is authorized by inspection. No production update/restart.

Read-only checks use the existing permanent Windows checkout. Preserve its
branch and operator state. Record live results separately from fixture tests.
Full runtime 2.x acceptance requires an independently authorized environment;
production upgrades remain NOT EXECUTED. Keep PR open while those gates are blocked.

Validation: frozen install, typecheck, lint, unit/integration, build, format,
E2E, native Windows script smoke, exact-head Ubuntu/Windows CI. Negative tests
must reject malformed/hash-inconsistent metadata, unsafe paths and redirects,
archive attacks and ambiguous packages; structurally plausible signatures must
never authorize installation. Existing policy, loopback, lifecycle/rollback,
market gating and non-actuating supervisor tests remain mandatory.
