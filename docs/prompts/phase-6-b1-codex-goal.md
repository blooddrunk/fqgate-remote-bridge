# Codex goal — Phase 6-B1 stale-plan guarded DNS apply foundation

Status: **CLOSED**. The implementation and acceptance evidence are recorded in
`docs/status/phase-6-b1-implementation-handoff.md`. This task does not authorize
Phase 6-B2 or Phase 6-C.

Implement only `docs/tasks/phase-6-b1-stale-plan-guarded-dns-apply.md` in
`blooddrunk/fqgate-remote-bridge`.

Use the existing permanent Windows checkout at:

```text
D:\code\research\fqgate-remote-bridge
```

Do not create a second checkout. Protect any operator-owned repo-external files
and credentials.

## Read first

Read and treat as authoritative:

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/plans/phase-6-cloudflare-provisioning-and-drift-management.md`
- `docs/tasks/phase-6-a-cloudflare-readonly-discovery-and-plan.md`
- `docs/status/phase-6-a-implementation-handoff.md`
- `docs/tasks/post-phase-6-a-permanent-windows-acceptance-credential-vault.md`
- `docs/status/post-phase-6-a-credential-custody-implementation-handoff.md`
- `docs/operations/windows-post-phase-6-a-credential-custody.md`
- `docs/tasks/phase-6-b1-stale-plan-guarded-dns-apply.md`

## Goal

Build the first bounded Cloudflare write slice:

- recompute the Phase 6-A plan immediately before mutation;
- require an exact expected plan fingerprint;
- apply exactly one supported `missing/create` DNS check;
- production mutation is only an exact desired CNAME create for human/admin/machine;
- if postcondition or required regression fails after creation, rollback only the
  record ID created by this invocation;
- keep Access apps/policies, Tunnel configuration, arbitrary DNS update/delete,
  adoption, token lifecycle, background reconciliation, Bridge operations and
  Phase 6-B2/6-C out of scope.

Do not weaken any Phase 0–6-A security boundary.

## Required implementation properties

1. Keep the existing read-only Phase 6-A transport independently GET-only.
2. Add a separate typed write transport with no arbitrary URL/method/body API.
3. Reject stale plans twice: after initial recomputation and immediately before
   the POST.
4. Reject the entire apply if any plan check is unsafe, ambiguous, blocked or
   manual-required.
5. Accept one check ID only. A successful write invalidates the old fingerprint;
   another action requires a new plan.
6. Build the CNAME payload only from validated desired state and uniquely
   selected Tunnel/zone state. Never trust a caller-supplied DNS body.
7. Permit DELETE only inside rollback for the exact returned record ID. There is
   no caller-selectable production remove action.
8. Keep the current three-entry Windows acceptance vault unchanged. The B1 write
   token is separate, hidden, ephemeral and never persisted.
9. Add bounded normalized error codes. Never include Authorization, token values,
   response bodies, cookies, assertions or recoverable secret derivatives.
10. Do not add a Bridge HTTP route or expose Cloudflare mutation remotely.

## Verification strategy — automate first

Implement and run deterministic tests before any live mutation. Cover every
acceptance ID P6B1-T1..T6, including stale-plan races and rollback failure.

Run the full repository gates:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm test:e2e
```

On permanent Windows, use the existing repo and existing repo-external config.
Do not fabricate service drift.

Add an acceptance-only live write canary using exactly:

```text
_fqgate-remote-bridge-phase6b-canary.<desired-zone>
```

The canary must fail if that name already exists, create one bounded TXT record,
re-read it, delete only the returned ID, and prove absence. The token is entered
with `Read-Host -AsSecureString`. Cleanup is mandatory even if later checks
fail.

After canary cleanup, rerun the Vault-backed Phase 6-A 14/14 and Phase 5-C 21/21
regression and verify both listeners remain exactly loopback-only.

If the real production plan is already in sync, do not create artificial DNS
drift. Record the bounded state `NO_SUPPORTED_PRODUCTION_DRIFT`, prove that
production `apply` performs zero writes/refuses a non-create check, and use the
live canary plus deterministic write fixtures as the mutation evidence.

## Human intervention policy

Do not ask for manual work when automation can do it.

The only expected human step is entering the scoped Cloudflare DNS-write token
through a hidden local prompt. Never ask the operator to paste it into chat,
arguments or files.

If FQGate returns exact normalized `LOGIN_REQUIRED`, print the exact local URL
and QR approval/resume command. Do not treat other upstream failures as QR
requests.

If an API-unobservable Cloudflare property truly blocks closure, print:
Dashboard navigation, exact field, exact expected value, why API evidence is
insufficient, and the exact command to resume. Do not write vague statements
such as "evidence not fully recorded".

## Deliverables

- implementation and tests for B1 only;
- permanent-Windows acceptance/canary scripts;
- `docs/operations/windows-phase-6-b1-acceptance.md`;
- `docs/status/phase-6-b1-implementation-handoff.md`;
- synchronized README, roadmap, AGENTS/security/design docs where behavior or
  operator contract changed.

Keep the status OPEN until the permanent-Windows live canary cleanup,
post-canary 14/14 + 21/21 regressions, and Ubuntu/Windows CI all pass on the exact
final implementation commit. Record exact commit SHA, workflow run ID and job IDs
when available.

Do not implement Phase 6-B2 or Phase 6-C.
