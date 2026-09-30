# Phase 6-C implementation handoff

Status: **OPEN — permanent Windows and exact-final-commit CI pending**.

The Phase 6-C code adds a fixed-scope, secret-safe Windows credential-dependency
audit and a one-command closure chain. It preserves the B1/B2 guarded apply
paths for future operator-invoked supported drift repair. The audit enumerates
Credential Manager target names only; it does not read credential blobs. The
normal runtime and acceptance chain clear B1/B2 write/scope-read process
variables and require their absence from persistent user/machine environment.

The closure record must include the exact implementation and final commit SHA,
real all-`in_sync` Phase 6-A fingerprint, pre/post audit PASS IDs, human/admin/
machine remote regression outcomes, local Phase 5-A/B/C outcomes, exact loopback
listeners, and exact GitHub Actions run plus Ubuntu/Windows job IDs. It must
distinguish automated checks from any actual human Access authentication step.
No raw token, assertion, cookie, QR/session or sensitive Cloudflare response
body belongs in this file or external evidence.

Local/runtime persistence can be declared absent only after the permanent
Windows audit passes. No exact retained B1/B2 remote token identity is known
from the already authorized evidence; do not search for, guess, or revoke one.
Remote revocation requires a separate explicit authorization if an exact
identity becomes available from an authorized source.

Permanent Windows command and pause/resume instructions:
`docs/operations/windows-phase-6-c-acceptance.md`.
