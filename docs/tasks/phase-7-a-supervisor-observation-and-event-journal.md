# Phase 7-A — supervisor observation and event-journal foundation

Status: **AUTHORIZED / OPEN**.

## Goal

Implement the first Phase 7 slice as a **read-only operational observer**.

Phase 7-A must provide deterministic local runtime observation and a bounded, redacted event
journal before any automatic recovery or notification behavior exists. It must be useful on the
existing always-on Windows PC while remaining safe to run continuously.

## Required outcome

At closure:

1. a Bridge-owned supervisor state model deterministically normalizes existing Bridge/FQGate,
   session and cloudflared service observations;
2. a one-shot CLI inspection produces a bounded secret-free JSON snapshot;
3. a read-only watch loop polls at a bounded interval and records only initial state,
   state transitions and bounded probe failures/recovery events;
4. repeated identical observations are deduplicated so a healthy or failed steady state does not
   grow the journal without bound;
5. the journal is stored outside the repository, has a fixed schema, bounded line size and bounded
   retention/rotation;
6. the watcher has a single-instance guard and fails closed rather than running multiple competing
   loops against the same state directory;
7. no recovery action, update action, Cloudflare mutation, login/QR action or notification send is
   reachable from the Phase 7-A implementation;
8. permanent-Windows live observation and exact-final-commit Ubuntu/Windows CI pass without
   changing the existing listener or authorization topology.

## Observation sources

Prefer existing typed services and contracts over new raw probes.

The initial model is:

```text
bridge:   ready | unavailable
fqgate:   ready | unhealthy | stopped | incompatible | unknown
session:  connected | guest | login_required | unknown
tunnel:   running | stopped | missing | unknown
```

The implementation may use:

- the existing loopback Bridge status/version surfaces or the same underlying typed lifecycle
  services;
- the existing FQGate health/lifecycle normalization;
- the existing bounded cloudflared Windows service-status controller;
- deterministic injected/fake adapters in tests.

Do not add direct remote Cloudflare API polling to the supervisor. Do not add a direct
`cloudflared -> FQGate` path.

A `login_required` or `guest` session is an observed state, not a condition that Phase 7-A may
repair.

## CLI surface

Add a narrow local CLI surface such as:

```text
fqgate-remote-bridge supervisor inspect --json
fqgate-remote-bridge supervisor watch
```

Exact naming may follow the existing CLI structure, but it must remain local-process control and
must not create a new Bridge HTTP route.

The watch command must have bounded interval validation and a deterministic bounded-run mode for
tests/acceptance (for example a maximum-cycle option). Default long-running behavior must still
perform observation only.

## Event journal

Use a dedicated state directory outside the repository, preferably under the existing configured
install/data directory rather than `D:\code\research`.

Journal records must use a fixed versioned schema and include only bounded operational metadata,
for example:

- schema version;
- timestamp;
- event type;
- component;
- previous normalized state, when applicable;
- new normalized state;
- fixed reason code;
- bounded run/cycle metadata if needed.

Do **not** persist raw HTTP bodies, raw FQGate health/OpenAPI, JWT/assertions, cookies, service-token
credentials, QR/session payloads, Cloudflare API bodies, Tunnel token contents, environment dumps or
arbitrary exception stacks.

Required journal behavior:

- one record per initial snapshot/meaningful transition/bounded probe failure or recovery;
- identical steady-state polls do not append duplicate records;
- each serialized record has a hard size limit;
- total journal storage has a hard retention/rotation limit;
- rotation cannot follow repository paths or symlinks/reparse points into the repository;
- concurrent second watcher invocation fails closed through a bounded single-instance mechanism;
- malformed/corrupt prior journal state must not cause unsafe actions; Phase 7-A has no recovery
  action to perform.

Reuse the existing redaction utilities where appropriate, but schema allowlisting is preferred over
trying to redact arbitrary payloads after the fact.

## Explicit non-goals

Phase 7-A must not:

- restart Bridge, FQGate or cloudflared;
- install/reconfigure a Windows service or Scheduled Task;
- add automatic startup/logon integration;
- send webhooks, email, ntfy, Bark, Telegram, Feishu, WeCom or any other notification;
- perform Cloudflare GET polling beyond already-established acceptance tooling, and must never call
  Cloudflare mutation endpoints;
- invoke Phase 6 B1/B2 apply;
- trigger FQGate QR/login;
- check/apply/qualify updates automatically;
- add remote-human, remote-admin or remote-machine operations;
- expose a generic process/service supervisor API;
- change current remote authorization, Access JWT validation, confirmation or machine policy;
- implement MCP, WebSocket, packaging, turtle-value-engine integration or financial state mutation.

Phase 7-B recovery and Phase 7-C notifications remain unauthorized until their own task packages
are reviewed.

## Automated tests

Tests must cover at least:

- deterministic state normalization for healthy, unavailable, unhealthy, incompatible,
  login-required and missing-service fixtures;
- identical inputs producing identical snapshots;
- transition detection and steady-state deduplication;
- probe failure followed by recovery;
- journal schema allowlist and secret/raw-payload rejection;
- per-record size bound;
- rotation/retention bound;
- path/reparse/symlink escape rejection where relevant to the platform abstraction;
- single-instance guard behavior;
- bounded watch interval/cycle validation;
- proof that Phase 7-A has no recovery/notification action adapter;
- existing logger/redaction and authorization regressions.

Use dependency injection/fake clocks so deterministic tests do not sleep in real time.

## Permanent-Windows acceptance

Use only the existing checkout:

`D:\code\research\fqgate-remote-bridge`

Do not create a second checkout and do not overwrite operator changes.

Automate:

1. clean-checkout verification;
2. frozen install;
3. typecheck;
4. lint;
5. unit/integration tests;
6. production build;
7. format check;
8. Playwright E2E;
9. one-shot live supervisor inspection against the existing FQGate/Bridge/cloudflared deployment;
10. a short bounded live watch run proving journal creation + steady-state deduplication without
    stopping or restarting production components;
11. journal schema/size/secret scan and retention assertions;
12. exact listener checks for `127.0.0.1:17281` and `127.0.0.1:17282`;
13. regression proof that no Bridge remote operation/authorization surface changed;
14. exact-final-commit Ubuntu and Windows GitHub Actions CI.

Do not manufacture production downtime merely to prove transition handling; use deterministic
fixtures for failure/recovery transitions.

Write secret-free acceptance evidence outside the repository, for example:

`D:\code\research\fqgate-phase7a-acceptance-evidence.json`

Record exact commit, tool versions, fixed check IDs, normalized live component states, journal
record/rotation counts, listener results and CI run/job IDs. Do not record raw response bodies,
credentials or arbitrary environment/config dumps.

## Human intervention boundary

Phase 7-A is designed to require **no mandatory human authentication step**.

- `login_required` is a valid observed session state; do not ask the operator to scan QR merely to
  make the supervisor green.
- Do not require Cloudflare Access browser login/MFA for Phase 7-A closure.
- Do not prompt for B1/B2 provisioning credentials.
- If an existing local prerequisite is unexpectedly absent or unhealthy, fail with an exact check
  ID, observed normalized state, why closure cannot be claimed, and the exact command the operator
  can rerun after separately restoring that prerequisite. Do not auto-repair it in 7-A.
- If a genuinely unavoidable OS permission issue prevents read-only service inspection, document
  the exact command/location, required privilege, expected output and what must not be changed;
  prefer changing the implementation to avoid elevation when safe.

Never summarize a blocker as “evidence not fully recorded”.

## Exit criteria

Phase 7-A closes only when:

- state normalization and transition behavior are deterministic;
- the live Windows snapshot reflects the existing deployment through bounded read-only probes;
- the watch loop writes a bounded secret-free journal and deduplicates steady state;
- no automatic recovery, update, login, Cloudflare mutation or notification path exists;
- the permanent deployment remains loopback-only with unchanged remote authorization;
- all required automated Windows checks pass;
- the exact final commit passes Ubuntu + Windows CI;
- a secret-free implementation handoff records exact automated evidence and any external blocker
  that prevented a claimed pass.

After closure, Phase 7-B remains unauthorized until a separate bounded recovery task is reviewed.
