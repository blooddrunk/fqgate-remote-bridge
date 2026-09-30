# Phase 6-C — live closure and credential retirement

Status: **CLOSED — permanent-Windows live acceptance and exact-commit Ubuntu/Windows CI passed**.

## Goal

Close Phase 6 without expanding the Cloudflare mutation surface.

Phase 6-C must prove that the deployed system is fully reconciled and that normal runtime,
read-only planning, remote human/admin/machine access, and permanent-Windows acceptance do not
depend on any Cloudflare DNS/Tunnel/Access **write** credential.

The bounded B1/B2 apply paths remain available only as explicit operator-invoked repair tools for
future supported drift. Phase 6-C must not delete those guarded code paths merely to claim
credential retirement.

## Required outcome

At closure:

1. the real Cloudflare deployment produces a deterministic all-`in_sync` Phase 6-A plan;
2. no B1 DNS-write or B2 Tunnel/Access-write credential is stored in repo, normal JSON config,
   Windows Credential Manager acceptance Vault, service configuration, environment persistence,
   startup scripts, evidence, or runtime state;
3. Bridge/FQGate normal startup and cloudflared service operation require only their existing
   runtime credentials and never request a provisioning credential;
4. Phase 6-A read-only discovery/plan remains usable with the existing least-privilege read
   credential;
5. human/admin/machine remote acceptance, local regressions, loopback listeners, and exact-final-
   commit Ubuntu/Windows CI pass after the retirement audit;
6. future write remediation still requires explicit invocation, a fresh plan fingerprint, one
   selected supported action, and a fresh transient least-privilege write credential.

## Explicit non-goals

Phase 6-C must not:

- add new Cloudflare write endpoints, mutation classes, background reconciliation or self-healing;
- widen DNS/Tunnel/Access permissions;
- rotate or delete the cloudflared runtime Tunnel token;
- remove the Cloudflare read credential needed for explicit discovery/acceptance unless a
  separately reviewed replacement is introduced;
- revoke an unknown remote API token by guessing its identity;
- persist B1/B2 write credentials for convenience;
- add a generic credential-management API;
- change Bridge operation permissions or the human/admin/machine authorization matrix;
- manufacture production drift to prove write behavior already covered by B1/B2;
- claim a remote token was revoked merely because a local file or environment variable was
  removed.

## Credential classes

Phase 6-C must distinguish these classes explicitly:

### Runtime-required

- protected cloudflared Tunnel token file used by the Windows service;
- existing Bridge/FQGate local runtime material already authorized by earlier phases.

These remain in place and are not provisioning credentials.

### Acceptance/read-only

- the existing least-privilege Cloudflare read credential used by Phase 6-A;
- existing machine Access service-token credentials used only by the Phase 5-C remote regression.

These may remain in the established bounded acceptance Vault when required by the closed custody
task. Their continued existence must not grant B1/B2 provisioning authority.

### Provisioning/write

- B1 exact-zone DNS write token;
- B2 exact-account Tunnel/Access write token;
- B2 account-token scope-read credential used only to prove the B2 write token's permissions.

These must be transient-only. Phase 6-C must prove that no long-lived copy is required or retained.

## Automated credential-dependency audit

Add a deterministic, secret-safe Windows closure audit. Prefer a dedicated script under
`scripts/windows/` plus tests rather than a new production HTTP surface.

The audit must automatically prove at least:

- the permanent checkout is exactly `D:\code\research\fqgate-remote-bridge` and clean;
- normal Bridge/FQGate startup succeeds with all B1/B2 write-token environment variables removed;
- Phase 6-A discover/plan succeeds without any B1/B2 write token;
- the plan is fully `in_sync` and has no mutation method in the read-only transport;
- fixed B1/B2 write credential environment variables are absent from the persistent process
  environment before and after the run;
- the acceptance Credential Manager contains only the credential targets explicitly authorized by
  the closed custody task, and contains no B1/B2 provisioning target;
- the cloudflared Windows service command/config references only the protected runtime token-file
  mechanism and does not contain a raw token or provisioning credential;
- repo/config/source/evidence scans contain no secret value and no newly introduced persistent
  write-token storage path;
- the old retired secrets directory remains absent or has zero authorized consumers;
- no normal startup/acceptance path prompts for a B1/B2 write credential when the live plan is
  already in sync.

Tests must validate the audit parser, bounded evidence shape, fail-closed handling, and negative
fixtures for accidental provisioning-credential persistence.

Do not print Credential Manager secret contents. Enumerate only fixed target names and bounded
metadata needed to prove allowed/forbidden target membership.

## Real Cloudflare token revocation boundary

If an exact B1/B2 remote API token ID is available through a **secret-safe, already-authorized**
source and the Cloudflare API provides a narrowly scoped way to revoke that exact token, document
the candidate and require separate explicit operator authorization before destructive revocation.

Phase 6-C does **not** need remote revocation to close when the accepted B1/B2 workflow used
short-lived transient tokens and there is no known retained remote token. In that case closure
evidence must say exactly that: local/runtime persistence is proven absent; remote revocation was
not attempted because no exact retained token identity exists.

Never ask the operator to browse Cloudflare manually merely to manufacture a token ID.

## Permanent-Windows acceptance

Use only the existing checkout:

`D:\code\research\fqgate-remote-bridge`

Automation first:

1. frozen install, typecheck, lint, unit/integration tests, build, format and Playwright E2E;
2. Phase 6-C credential-dependency audit;
3. Phase 6-A live discovery/plan and assert all checks `in_sync`;
4. Phase 5-C real remote-machine service-token matrix;
5. Phase 4.5 headed ordinary/admin browser matrix;
6. local Phase 5-A/B/C regressions;
7. assert listeners exactly `127.0.0.1:17281` and `127.0.0.1:17282`;
8. re-run the closure audit after all regressions to prove no write credential was introduced;
9. exact-final-commit Ubuntu and Windows GitHub Actions CI.

Evidence should be written to a secret-free repo-external file such as:

`D:\code\research\fqgate-phase6c-closure-evidence.json`

It should include commit SHA, tool versions, plan fingerprint, fixed audit check IDs, allowed
credential target names (names only), listener results, regression summaries and CI run/job IDs.
It must never contain token values, Access assertions/cookies, service-token secrets, Tunnel token
contents, QR/session material, raw Cloudflare bodies or Credential Manager secret blobs.

## Human intervention boundary

Human action is permitted only when automation genuinely cannot complete the existing accepted
authentication flow:

1. ordinary/admin Cloudflare Access login + MFA in the headed browser harness;
2. physical FQGate QR only after exact normalized `LOGIN_REQUIRED`;
3. hidden renewal of an already-authorized read/acceptance credential if it is expired;
4. separately authorized exact remote-token revocation, only if an exact retained token identity is
   known and revocation is deliberately chosen.

For every human-only step, the tool/runbook must state:

- exact reason automation stopped;
- exact UI/location or hidden-input action;
- exact expected result;
- what must not be changed;
- exact command to resume automated verification.

Do not use vague closure statements such as “evidence not fully recorded”.

## Exit criteria

Phase 6-C closes only when all of the following are true:

- real Phase 6-A plan is deterministic and fully `in_sync`;
- normal runtime and acceptance complete without B1/B2 provisioning credentials;
- no persistent B1/B2 write credential target/file/config/environment dependency exists;
- cloudflared still uses the protected runtime token file and Bridge/FQGate remain loopback-only;
- human/admin/machine remote paths pass;
- local Phase 5 regressions pass;
- post-run credential audit is identical in policy outcome to pre-run audit;
- exact final commit passes Ubuntu + Windows CI;
- a secret-free implementation handoff records exact automated evidence and any intentionally
  retained credential classes.

After closure, Phase 6 is complete. Any broader Cloudflare automation, token lifecycle manager,
background drift repair or new remote capability requires a new separately reviewed phase/task.
