# FQGate 1.0.5 external-update qualification

Status: **IMPLEMENTED / LIVE QUALIFIED; final CI and PR merge pending**. This is a separate local maintenance task; Phase 7-A remains observation-only.

## Incident and goal

The operator used FQGate's built-in updater. The current managed executable is the official 1.0.5 artifact, but Bridge's active record still names 1.0.4 and its process record no longer identifies the live listener. The existing `fqgate qualify` transaction correctly refuses to replace a current artifact that is not known-good. Provide an explicit local CLI recovery path for this already-updated case, and make later repetitions one bounded command.

## Bounded `fqgate qualify-current` contract

- CLI only; no Bridge HTTP route or remote permission. Never run on startup, in supervisor watch, or on a timer.
- Require the fixed official stable manifest, in-range supported version, exact managed current file version/size/SHA-256, and a rechecked release identity before committing evidence. Do not accept a caller-supplied URL, path, hash, or version.
- On Windows, require exactly one TCP listener for port 17281 at IPv4 `127.0.0.1`, identify its owning PID, and verify that PID's executable path is the managed current file. Reject unknown identity, a different listener, stale conflicting process record, or another update lock/transaction.
- Adopt only that verified running PID into the managed process record. Perform existing bounded health, required OpenAPI, and fixed `market.instruments.lookup` semantic probes. Recheck artifact and PID identity afterward. Persist artifact-bound qualification only after every check passes.
- Do not replace, stop, or restart the externally updated executable. A failed qualification leaves the artifact unvalidated and Bridge's market operation denied. Because this path does not change the binary, it does not claim to restore 1.0.4. Keep managed replacement with rollback under the existing `fqgate qualify` transaction.
- Preserve existing `previous` record only when its binary is present and matches; otherwise remove the stale record in the new active state. Do not fabricate a rollback binary.
- Report exact failure codes without raw upstream bodies or credentials. Keep `LOGIN_REQUIRED` as the sole QR human boundary.

## Acceptance

Deterministic tests cover wrong artifact/hash/version, non-loopback or ambiguous listener, path mismatch, stale process identity, failed health/OpenAPI/semantic probe, release or artifact drift, lock/transaction rejection, and successful artifact-bound evidence. On the permanent Windows checkout, run the explicit command, verify 1.0.5 ready/running and exact loopback listeners, rerun Phase 7-A acceptance and real remote-machine regression, then exact-final-commit Ubuntu/Windows CI. Preserve all operator data.
