# Phase 6 — Cloudflare provisioning and drift management

This plan is split deliberately. Phase 6-A is the current read-only control-plane
milestone. Phase 6-B is a future, separately authorized mutation milestone.

## Phase 6-A status and scope

Phase 6-A is **OPEN** until the permanent Windows, real Cloudflare, exact-commit
Ubuntu and exact-commit Windows evidence is recorded. It implements only:

- a fixed `https://api.cloudflare.com/client/v4` Cloudflare API client;
- bounded GET-only discovery of the configured account, zone, remotely-managed
  Tunnel/configuration, three DNS records, three Access applications and their
  policies;
- repo-external desired-state parsing;
- deterministic reconciliation and a canonical SHA-256 fingerprint.

The implementation is framework-independent and lives under `src/cloudflare/`.
The CLI exposes only `cloudflare discover` and `cloudflare plan`. The Bridge
operation registry, TanStack routes and FQGate adapter are not changed by this
milestone.

The allowed control-plane paths are fixed to the exact account/zone, Tunnel,
Tunnel configuration, DNS, Access application and Access policy GET resources
used by discovery. The transport has no POST/PUT/PATCH/DELETE/token-retrieval
method and the CLI has no mutation command.

## Desired state

The desired document is repo-external and must contain no credential. A checked-in
template is available at `config/cloudflare-phase6a-desired.example.json`.
It identifies:

- account and zone by bounded name and, preferably, exact ID;
- the named Tunnel and the immutable Bridge origin
  `http://127.0.0.1:17282`;
- Cloudflare Access team domain/name;
- independent `human`, `admin` and `machine` applications, hostname and AUD;
- policy minimums: human/admin `allow`, machine `non_identity`, exact machine
  service-token selector count, and administrator MFA requirement.

The desired state never contains an API token, Access assertion, service token,
Tunnel token, cookie, client secret or QR/session material.

## Reconciliation rules

Discovery never selects the first matching result. Duplicate account/zone/Tunnel,
hostname/DNS record, application or ambiguous policy resource is reported as
`ambiguous`. Missing dependency lookups are `blocked` rather than guessed.

The plan reports safe future drift actions (`create`, `adopt`, `update`, `remove`)
but Phase 6-A never performs them. It marks these as `unsafe_conflict` and keeps
the plan non-applying when it observes:

- a direct `127.0.0.1:17281`/localhost FQGate ingress;
- wildcard, broad or unexpected ingress;
- an origin other than exactly `http://127.0.0.1:17282`;
- missing/incorrect Tunnel Access protection, team or AUD;
- duplicate or non-CNAME/unproxied/wrong-target DNS;
- application hostname/type/AUD mismatch or shared application ID/AUD;
- Bypass, Everyone, broad service-token or other widening selectors;
- human/admin Service Auth or machine human-allow policy inheritance;
- machine Service Auth not scoped to a specific `service_token` selector.

If the read API cannot prove administrator MFA, the plan emits structured
`manual_required` evidence. It does not treat an unproven property as safe.

The canonical plan sorts resource collections and check IDs, excludes the
fingerprint while hashing, rejects sensitive markers, and computes SHA-256 over
the canonical UTF-8 JSON. Evidence stores bounded metadata only, never raw API
responses or authentication material.

## Phase 6-B boundary

Phase 6-B may later add explicit, reviewed mutation adapters and apply transactions
after a separate task package. It is not implemented here. No resource creation,
adoption, update, deletion, token creation/rotation/retrieval, DNS change, Access
policy change, Tunnel configuration mutation or generic REST proxy is authorized
by Phase 6-A.
