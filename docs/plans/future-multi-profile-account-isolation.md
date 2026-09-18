# Future Plan: Multi-Profile FQGate Account Isolation

Status: **PLANNED — no implementation in Phase 4.5**.

This note records the multi-account idea raised during Phase 4.5 closeout. It
is separate from Phase 5 `remote_machine`: a profile is a human-owned FQGate
account/session inside one Windows deployment, while `remote_machine` is a
future machine/service identity and API surface. They must not inherit one
another's permissions.

## Problem statement

The current Bridge intentionally models one local FQGate instance and one
active local account/session. A deployment such as:

```text
PC A -> FQGate account A
PC B -> FQGate account B
```

is already understandable as two isolated instances. A future deployment
could instead host:

```text
one PC -> profile A / FQGate account A
       -> profile B / FQGate account B
```

This cannot be implemented by adding an `account` query parameter to a raw
upstream path. Profile selection must be explicit, registered, authenticated,
and isolated at the Bridge boundary.

## Terms and reuse boundaries

- **Deployment instance:** one Windows host, one Bridge process, its local
  FQGate process set, update state, cloudflared service, and Tunnel identity.
- **Profile:** one named FQGate account/session with its own login state,
  upstream endpoint/process handle, health state, and allowed operator set.
- **Tunnel:** a network ingress identity. Reuse it for multiple hostnames on
  one Windows Bridge only; do not use one connector pool to represent two
  independent PCs/accounts.

The current Phase 4.5 setup can reuse the same Tunnel for ordinary and admin
hostnames on one PC. A second PC should receive a new Tunnel and token file.
The Cloudflare team domain and account-level App Launcher policy may be shared
within one organization, but each instance still needs its own hostnames,
admin Access application/AUD, Bridge config, and WARP enrollment.

## Candidate architecture

The design must first establish whether the upstream FQGate contract supports
multiple isolated logins in one process. Two implementations are possible:

1. **Multiple local FQGate processes (preferred fallback):** each profile gets
   a distinct loopback port, process identity, login/session registry, health
   probe, and explicit adapter. Bridge routes only registered profile-aware
   operations to the selected fixed local endpoint.
2. **Native upstream multi-account support:** use only if FQGate explicitly
   provides isolated profile/session handles and contracts. The Bridge still
   owns profile registration and authorization; upstream discovery never
   becomes authorization.

The first design is easier to reason about if one FQGate process can hold only
one account, but it increases local process and port lifecycle complexity. No
choice should be coded before the upstream login, session, port, health, and
OpenAPI contracts are verified.

## Required security properties

- A profile ID is an explicit Bridge-owned identifier, never an arbitrary URL,
  port, or FQGate path supplied by the browser.
- Every profile-aware operation is registered with allowed caller contexts and
  profile permissions. UI selection is not authorization.
- Profile A data, QR/session state, errors, caches, OpenAPI fingerprints, and
  update status cannot leak into profile B responses.
- QR payloads, Access assertions, session material, and credentials remain
  ephemeral or protected by a Windows secret-storage abstraction; they are
  never in URLs, logs, browser local storage, or a shared plaintext profile
  JSON file.
- Remote human/admin authentication remains separate from profile selection.
  A verified admin must not automatically gain every future profile unless an
  explicit policy grants it.
- Financial state-changing operations remain forbidden for every profile.
- Profile selection must be bound into request context, audit events, and any
  confirmation protocol. An apply confirmation for one profile cannot be used
  for another.
- A profile must have a clear lifecycle: add, enroll, health-check, disable,
  remove, and recover. Removal must invalidate its sessions and in-memory
  grants.

## UI and API shape to investigate

The single existing frontend should gain a profile picker only after the
server contract is ready. The picker should show the active profile and a
bounded status/error state; it must not expose credentials or raw upstream
URLs. Candidate Bridge-owned operations are explicit, for example:

```text
profiles.catalog       read registered safe metadata
profiles.status        read one profile's health/session state
session.qr.begin       begin login for an explicitly selected profile
session.qr.poll        poll only that profile's ephemeral login registry
bridge.status          report instance and selected-profile context
```

Existing update operations are instance-level until a future design proves
that FQGate binaries/lifecycle are profile-level. A FQGate binary update must
not be confused with changing a profile's account.

## Future work sequence

1. Document and test the upstream multi-login/session contract.
2. Choose process-per-profile or native upstream handles.
3. Define profile registry, Windows secret storage, lifecycle, and redacted
   audit events.
4. Add deterministic isolation tests, including cross-profile cache/session/
   confirmation leakage and concurrent login races.
5. Add a local-only prototype before adding any remote profile operations.
6. Review whether remote-human and remote-admin need separate per-profile
   policies; default deny remains mandatory.
7. Perform a dedicated Windows multi-profile acceptance before exposing it
   through Tunnel/Access.

Configuration wizard/doctor work should be developed alongside this plan. It
can generate a redacted checklist and validate DNS, Access app/AUD, Tunnel
host mapping, certificate coverage, loopback listeners, and posture status,
but it must use plan/dry-run and never silently provision broad Cloudflare
permissions.
