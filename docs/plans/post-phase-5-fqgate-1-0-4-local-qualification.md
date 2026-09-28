# FQGate 1.0.4 local qualification design

Status: **ACTIVE — separate maintenance task; the 1.0.2 closure remains historical and closed**.

## Current upstream evidence

The official stable manifest now lives at
`https://raw.githubusercontent.com/fqgate/FQGate-releases/main/releases/stable.json`.
It declares FQGate 1.0.4, published 2026-09-24, with this Windows x64 artifact:

```text
FQGate-1.0.4-windows-x64-UNSIGNED.exe
size: 23201792
sha256: 6816b8e9225db3ffee464c8f61173eea02ae66663ba2b137e9aa39c4d6bc9290
```

This identity is release evidence only. It does not add 1.0.4 to configured
`validatedVersions` or approve activation. The existing supported range and pin
remain authoritative.

## User workflow

The existing Windows launcher remains a launcher. `-ConfigPath` selects the
configuration and managed install directory; it does not update FQGate. A normal
validated candidate continues through the existing check, preview, and apply flow.

When a preview is `blocked` solely because its version is `supported_unvalidated`,
the local `/updates` page offers a checked, explicit **验证兼容并升级** action.
The action is visible only when the request context is exactly `local`. The same
workflow remains available through `fqgate qualify` CLI.

## Server and lifecycle boundary

Register one Bridge operation, `updates.qualify`, at
`POST /api/v1/updates/qualify`, allowed only for `local`. The handler accepts only
the `planId` from the current in-memory update preview. It must reject a different
candidate, a changed official artifact identity, a changed installed baseline,
unsupported or pinned-mismatch versions, and an already validated plan.

The service obtains a fresh candidate plan with the existing supported-but-
unvalidated gate, then passes only the fixed production
`market.instruments.lookup` qualification probe to the existing lifecycle
`installPlan` transaction. Existing size, SHA-256, executable version, stop/start,
health, runtime OpenAPI, semantic-probe, artifact-bound evidence, concurrency,
and rollback checks remain in force. The candidate is promoted only by the
existing successful qualification persistence path.

Do not add a remote-admin permission. Its maintenance allowlist remains exactly
`updates.check`, `updates.plan`, `updates.apply`, and `openapi.refresh`. The
remote-human matrix remains unchanged. The remote-machine matrix remains exactly
the approved lookup and its filtered OpenAPI document; the new operation is
denied to both remote contexts.

## Acceptance

- Verify the official manifest and exact 1.0.4 artifact identity.
- Prove old approved update flows and CLI qualification still work.
- Prove stale plan, release drift, baseline drift, unsupported/pinned versions,
  missing qualification probes, and failed probes fail closed.
- Prove qualification failures restore the previous managed artifact.
- Prove only local callers can reach `updates.qualify`; remote-human,
  remote-admin, and remote-machine requests are denied at the Bridge handler.
- Preserve the closed Phase 4/4.5 and Phase 5 operation matrices.
- On the permanent Windows tree, use the local Dashboard to qualify and update
  to 1.0.4, then prove managed version/hash, health, lookup qualification
  evidence, loopback-only listeners, QR behavior, and remote regressions.
- Keep this task active until permanent-Windows evidence and exact-commit CI are
  complete. Do not rewrite the Phase 5-A or 1.0.2 closure records.
