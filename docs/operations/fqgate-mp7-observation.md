# MP-7 repeat, evidence and deferred human boundaries

All commands below are observer/fixture verification unless explicitly marked
**RESERVED / NOT_EXECUTED**. No permanent runtime or account action is authorized.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED; multi-account production NO-GO.**

## Repeat the observer

Use an isolated clean worktree, never permanent Windows dist/.output. Node 22+
and the repository-pinned pnpm are required. The initial engineering worktree is
`/home/jelinenaro/research/fqgate-mp7`; external receipts are under
`/home/jelinenaro/research/fqgate-mp7-evidence-20261106`.

```sh
pnpm install --frozen-lockfile
pnpm build:cli
node scripts/observe-fqgate-releases.mjs > /tmp/fqgate-mp7-observation.json
node --input-type=module -e 'import fs from "node:fs";const r=JSON.parse(fs.readFileSync("/tmp/fqgate-mp7-observation.json"));if(r.status!=="RELEASE_OBSERVED")throw Error("STOP");fs.writeFileSync("/tmp/fqgate-mp7-baseline.json",JSON.stringify(r.baseline))'
node scripts/observe-fqgate-releases.mjs --baseline /tmp/fqgate-mp7-baseline.json
```

Exit 0 = RELEASE_OBSERVED only. `INITIAL_REVIEW_REQUIRED` on first observation;
`UNCHANGED_UNAUTHENTICATED` or `HUMAN_REVIEW_REQUIRED` on comparison. Signatures,
installation and runtime remain unqualified. Same-sequence hash/version conflict,
sequence regression, version rollback, latest-pointer discrepancy, malformed schema,
missing metadata, future timestamp, unexpected host/path/asset or transport failure
returns FAIL_CLOSED/1 without raw errors. Every unexpected CLI flag is rejected
before network/configuration work. A baseline is strict six-field JSON, max 4096
bytes, regular non-symlink file; caller file custody is not authenticated replay
protection. Never silently advance a baseline after failure. Network failure does
not imply old installed version is corrupt or permission to repair it.

The observer requests only official GitHub release metadata and immutable raw
manifests; it neither downloads packages nor creates timers, workflows, runtime
state, credentials or a production integration. Future 2.0.8+ stable patch/minor
versions reuse numeric comparison and change reporting. A major release, prerelease
or unrecognized schema stays fail-closed pending review. No periodic fetch is configured.

Optional existing non-executing ZIP audit, in the same isolated worktree:

```sh
node dist/cli/main.js fqgate audit-v2 --json
```

This older CLI deliberately exits **1 even after structural success**, because
qualification is blocked. It checks the latest v2 chain, not a caller-selected URL;
confirm exact version/hash against the observer receipt. Metadata redirects denied;
archive permits one bounded official GitHub CDN redirect. No extraction or execution;
temporary audit directory is removed. Current MP-7 additionally retained one audited
ZIP outside Git, mode 0600, for static in-memory ZIP entry reads. A successful ZIP
check does not verify publisher signature, real Windows startup or rollback.

## Automated verification and custody

Run standard scripts and `node scripts/audit-profile-prototype.mjs`. Linux browser
E2E starts only an isolated test server on 127.0.0.1:17283. Hosted Windows CI may
start its isolated smoke fixture; no permanent service is touched. Windows browser
E2E remains skipped by existing CI policy. Local native fixture files are copied
with the isolated CLI output to
`D:\code\research\fqgate-mp7-evidence-20261106\validation` and run there; do not
rebuild or switch `D:\code\research\fqgate-remote-bridge`.

Evidence records exact argv, UTC, cwd, source SHA, exit, elapsed time, log SHA-256,
source/tool hashes and before/after protected inventories. Early environment/tool
failures and the static legacy-document fingerprint rejection remain recorded;
they are not relabelled as successful checks. In this WSL session a process-local
pnpm shim selects Linux corepack because the ordinary pnpm launcher attempted a
Windows engine path. No persistent environment/package-manager config was changed.
Native fixtures use Windows Node/PowerShell, not Linux emulation.

The public receipt contains public release metadata only. API fixture files are
allowlisted projections; three signed envelopes retain exact original bytes, excluded
from formatting because their hash links cover those bytes. No credential, runtime
account response, private Source ID or browser profile enters Git. A file inventory
is sampled continuity, not OS-wide zero-write attestation. Preserve all external
private files and candidates. Never open Dashboard/lifecycle status to inspect a
process record under this read-only task: existing status cleanup may write it.

## Deferred item 1 — native host/runtime census

**NOT_EXECUTED / HOST_BLOCKED**, based on last MP-6 observation; no new runtime
census is asserted here. Needed because static package/notes cannot prove native
v2 schema, owning process, account continuity, query semantics or expiry behavior.
Prerequisites: separate explicit host restoration authorization, reviewed target
version, immutable package verification, complete source/build reconciliation,
protected baseline and owned loopback identity. No approved 2.0.7 native start,
install, repair, record adoption or rollback command exists in MP-7.

Exact existing decision sheets (still reserved):
`docs/operations/windows-fqgate205-mp6.md`, sheets 1/2/3; Windows permanent path
`D:\code\research\fqgate-remote-bridge`. Execute no command from them until
its stated prerequisites and separate approval are met. Once a future task has
supplied the chosen version-specific read-only census command, it must emit exact
version/artifact, native PID/creation/listeners, selected-operation fingerprints,
request count and protected-file comparisons. A bare GET 200 cannot pass ownership.
STOP on missing/unknown owner, state-0 ambiguity, unexpected write, contract drift,
account/L2 drift or absent backup. Do not rerun mutations or restore a stale PID
record. File rollback cannot undo native/provider sessions; full session rollback
is unqualified. Resume MP-7 engineering independently with the observer command above.

## Deferred item 2 — native identity/epoch clarification

**NOT_EXECUTED / UNKNOWN**, draft not sent. No secret entry is necessary to finish
MP-7. Native account identity, per-Source monotonic epoch, reincarnation and Saved
Login/L2/storage isolation cannot be established by visible field names or binary
tokens. A human/publisher clarification requires explicit authorization to send;
no message or GitHub comment was sent by this task.

Review `docs/plans/fqgate205-mp6-upstream-inquiry-draft.md`, update the target version
in a separately reviewed draft, request versioned field/schema/monotonicity,
Source recreation, Saved Login/L2, port and complete storage/IPC guarantees. Submit
only after approval through the publisher's official issue interface, without
account/QR/session/private path data. Preserve the official reply URL and exact
version/contract semantics. STOP if the answer is only a display ID, observation
time, legacy query-pool epoch or an instruction to copy credentials. No rollback
can retract an external disclosure; do not send private material. Resume the
reviewed evidence matrix and fixtures only; no native mutation follows by implication.

## Deferred item 3 — real login and multi-account acceptance

**NOT_EXECUTED / LIVE_UNQUALIFIED / PROD_NO_GO.** This is not a necessary human step
for MP-7. Requires a separate, precise protocol plus fresh authorization for each
QR/phone/MFA/login/Saved Login/L2 action, native identity/epoch contract, restoration
plan and operator attendance. The existing drafts are not executable permission.
No real two-account experiment command is supplied because those prerequisites
are absent. Expected future evidence must distinguish both identities/epochs,
Source/Worker lifetime, account and L1/L2 data isolation, cancellation and stale-result
fences. STOP on peer displacement, unobservable epoch, credential uncertainty or
unplanned provider effect. Never claim file restoration reverses provider-side
sessions. Keep NOT_EXECUTED until a separately approved protocol actually runs.
