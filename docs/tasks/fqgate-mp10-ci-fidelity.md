# MP-10 — PR merge-candidate CI fidelity

Authorized by [Issue #37](https://github.com/blooddrunk/fqgate-remote-bridge/issues/37)
after reviewed MP-9 PR #36 merged at
`b33a44116be51b8306d908b01796eb9459bd9a7f`. MP-10-A is executable software work;
MP-10-B is a [host prerequisite decision memo](../plans/fqgate-mp10-host-decision.md)
only. Independent review is required before closure; never merge this PR here.

## Implementation contract

Restore default checkout for `pull_request`: GitHub's `refs/pull/<n>/merge` and
event `github.sha`, without a fallback to PR head. Keep main-push behavior,
pinned Actions, read-only token, disabled credential persistence, PR-only
cancellation, unique main-run groups, 20-minute limits and both OS duties.
Keep Linux-only static checks/Chromium headless shell and no artifact upload.

Run the CI-only revision gate before installation. Read event metadata from
GitHub's JSON file rather than interpolating PR input into shell commands.
Require HEAD = event SHA and, for PRs, the expected merge ref and exactly two
commit parents in base/head order. Read raw headers so shallow checkout works.
Emit validated SHA/ref metadata; never label the merge SHA source HEAD. Missing
merge ref, stale head/base or unexpected checkout fails without head fallback.
GitHub checkout failure also fails the job before tests. Updated base/head must
receive a fresh PR validation; a historical green run is not current evidence.

Static workflow tests must reject head overrides, lost Windows fixture calls,
conditional unit/build coverage and changed resource/security policy. Synthetic
Git fixtures test shallow merge/main-push success and provenance denials without
HTTP, native application or credentials. No extra workflow or dependency.

## Acceptance and evidence

Run frozen install, typecheck, lint, full unit, production import/permission
audit, formatting, isolated CLI/SSR builds and Linux Chromium E2E (19 cases).
Hosted Ubuntu and Windows must test the actual PR merge candidate. Inspect
checkout, provenance JSON, full counts, child fixture markers, build and each
step's status, including designed OS skips. Windows inert suites include v2,
QR/no-approval, MP-2/3/4/5/6/8 and Vault fake store. The existing disposable
Vault smoke runs only on the hosted ephemeral runner; no local real Vault use.
Windows browser E2E stays SKIPPED. Never call an unavailable check passing.

Retain repo-external command/source inventories, UTC, argv/cwd, exits, durations,
tool versions, counts, log SHA-256, failed attempts, skips, protected before/after
hashes, source HEAD/base/tested merge, run/job IDs and step results. Public docs
contain only aggregate evidence and safe pointers. If hosted CI is unavailable,
deliver a reviewable PR with CI_NOT_VERIFIED, not a closure claim.

No production adapters/routes/registry/config/compatibility change; no native or
service action, deployment, Cloudflare, real account/QR/MFA/Saved Login/L2 action,
upstream inquiry send or automatic 2.0.6/2.0.7 activation. Preserve Windows
c06fbcf, existing outputs, private inputs and external evidence. Fixtures and
merge CI cannot qualify native host, account isolation or rollback.

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
