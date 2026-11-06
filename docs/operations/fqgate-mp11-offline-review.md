# MP-11 offline repeat and host handoff

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
[Issue #39](https://github.com/blooddrunk/fqgate-remote-bridge/issues/39) authorizes
static research and fixtures only. No human action is needed to complete this PR.

## Reproduce static evidence without executing package members

In the isolated worktree, after frozen install:

```sh
node scripts/mp11-static-review.mjs \
  --archive-207 /home/jelinenaro/research/fqgate-mp7-evidence-20261106/untrusted-2.0.7.zip \
  --exe-206 /mnt/d/code/research/fqgate-recovery-20261030/candidate-2.0.6/unpacked/FQGate.exe
pnpm exec vitest run tests/fqgate-mp11-static.test.ts
node scripts/audit-profile-prototype.mjs
```

Paths are existing read-only inputs, never command targets. The script checks
exact lengths/full hashes **before** any archive decoding or slice inspection;
only FQGate.exe is streamed into bounded memory. It writes no files, invokes no
child process, makes no network request and never evaluates client JavaScript.
Needle hits are byte facts; missing needles describe only the selected slice.
Malformed size/hash/UTF-8/range/overlap/duplicate specifications deny. CLI errors
emit a fixed redacted result, exit 1. Exit 0 means static comparison succeeded,
with admission DENIED and runtimeQualified=false; it is not host acceptance.

The [pins](../compatibility/fqgate-mp11-static-pins.json) are review data used
only by this script. The [report](../compatibility/fqgate-mp11-static-report.json)
is deterministic public output. Format JSON with repository Prettier before
comparing file hashes. For another machine, obtain the exact already-pinned
official bytes under its own documented custody; an absent input is NOT_EXECUTED,
never permission to fetch arbitrary assets or run a package. Do not weaken pins
to make a changed input pass. No new 2.0.5 artifact is required for this repeat;
its baseline remains source/historical evidence as specified in the matrix.

The existing standalone release observer may independently repeat fixed public
GETs after `pnpm build:cli`. It never contacts local services or accounts:

```sh
node scripts/observe-fqgate-releases.mjs
```

Preserve timestamped output and compare its version/source/envelope hashes to
the prior observation. Download counts may change without artifact authority.
New version/source/hash or contradictory metadata means REVIEW_REQUIRED; it
must not silently update the static pins, deployment target or runtime ledger.

## Validation and private receipts

Run frozen install, typecheck, lint, full unit, import audit, build, format and
Linux Chromium E2E using the existing scripts. E2E uses isolated port 17283 and
fake upstreams; no real FQGate/Bridge deployment is started. Stage compiled CLI
and existing Windows fixture scripts under the new external validation directory,
never permanent dist/.output. Run MP-2/3/4/5/6/8, v2 observation, QR preflight,
inline identity/no-approval and Vault fake tests. Never run live/preflight
account harnesses or the real local credential-store smoke on the operator PC.
The unchanged hosted Windows workflow may run that smoke in its ephemeral runner.
Windows browser E2E remains SKIPPED by existing policy; Linux runs 19 cases.

External receipt directory:
`/home/jelinenaro/research/fqgate-mp11-evidence-20261106`.
Windows staging: `D:\code\research\fqgate-mp11-evidence-20261106\validation`.
Keep exact argv/cwd/UTC/exits/duration, source inventory and lockfile/tool/runner
hashes, test counts, failed/skipped attempts, read-only input provenance,
protected before/after manifests and Git identities. Do not include credentials,
raw account values, QR or provider session state. Final delivery receipt binds
source HEAD, BASE and tested synthetic merge SHA independently, CI run/job IDs
and downloaded log hashes. Verify `Verify tested revision` in **both** jobs;
GitHub run.head_sha alone is not proof of the tested checkout.

## Concrete missing facts and next action

Current 2.0.7 v2 OpenAPI/response schemas, native identity/epoch, complete mutable
storage/IPC contract, authenticated publisher/expiry policy and data/session
rollback are unknown. We tried existing MP-7 receipt/hash checks, exact embedded
local API/QR/search/account slices and legacy schema inspection. They reveal
client vocabulary but cannot observe native timing, provider state, persistent
storage behavior or a running build. Historical 206 census omitted raw OpenAPI;
neither an exact schema diff nor current host readiness can be reconstructed.
No localhost probe was attempted because Issue #39 expressly excludes it.

The next executable work is independent review of this PR and the revised
[MP-10-B decision sheet](../plans/fqgate-mp10-host-decision.md). A separate task
can first authorize the already-described **metadata-only** collector after
pinning its exact staged source/hash/command and owner; missing categories stay
UNKNOWN. It requires no process start. A new version-specific GET census cannot
use the 205 triage by replacing its pins, and must be reviewed before approval.
Native contract documentation may be reviewed offline; the upstream identity
inquiry is still unsent. Sending it requires separate explicit authorization.

No approval to restore a host is requested here: there is no selected target or
safe concrete start/repair command yet. Any later human step must name why
automation cannot prove it, exact target/prerequisites/command, impact and
protected before/after files, expected observations, one-attempt STOP/failure/
rollback limits, and the exact command resuming automated verification. Do not
ask the operator to log in or repair a process merely to turn an UNKNOWN green.
