# Codex /goal — FQGate 2.0.5 MP-0 shared-profile contract design review

**First synchronize latest source.** In the existing Windows checkout
`D:\\code\\research\\fqgate-remote-bridge`, inspect
`git status --short`, current branch, and refs. Run `git fetch origin main`;
only fast-forward a clean `main` (`git pull --ff-only origin main`).
Do not assume the baseline `3ddda01` is still HEAD. If worktree is dirty
or the branch has unrelated commits, preserve it, report the exact
difference, and do not reset, clean, overwrite or create a second checkout.
Create a focused branch from latest main only after that safety check.

Read `AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/security.md`, `docs/roadmap.md`,
`docs/tasks/fqgate-2-0-5-mp0-shared-profile-design-review.md`,
`docs/plans/future-multi-profile-account-isolation.md`, and
`docs/status/fqgate-2-0-5-qr-session-implementation-handoff.md`.

Goal: **complete MP-0, a bounded, read-only design review for
one consistent Bridge-owned profile selection across QR/status/lookup**.
Review the actual source, contracts, adapters, policy registry,
caches and UI generation ownership. Classify findings as observed,
fixture-only, blocked or not executed. Produce
`docs/plans/fqgate205-shared-profile-contract-review.md` with
native-instance vs process-per-profile decision, alias/identity/epoch
model, backward-compatibility and caller-permission matrix, negative
race/isolation cases and machine-checkable MP-1 acceptance. Add only
useful, wholly synthetic deterministic fixtures if needed; **do not
wire a profile resolver into production in MP-0**.

Respect the qualified baseline: PR #19 and post-merge Ubuntu/Windows
CI succeeded; deployed runtime `481db65097cd63ea0f9c28f39e526e341b700721`
passed operator-confirmed single-source QR Live 8/8, local 6/6 and
Vault remote_machine 22/22. Current main/your checkout SHA may be newer
than deployed runtime, and that is NOT permission to deploy/restart.
Two different concurrently logged-in accounts, native session epoch,
publisher signature, anti-replay and full v2 rollback remain unproven.
Do not relabel them PASS.

Priority: automate every available source check, fixture, typecheck,
lint, test, build, format and relevant browser/Windows CI check.
For each result capture exact SHA, command, exit, case IDs/counts and
a non-secret evidence hash in a protected Git-external receipt;
identify exactly what CI does not cover. When a Windows permanent-host
GET-only probe is safe, observe read-only; do not request tokens
unnecessarily or call any authentication POST. Preflight may report
running-build mismatch due solely to later doc commits: label the
actual SHA mismatch, do not auto-deploy to clear it. No real QR,
second-account login, source creation/deletion, saved-login changes,
FQGate/Bridge/cloudflared restarts, installer/upgrade, ACL/elevation,
Cloudflare mutation or broad permission changes. No Issues and no
planning-only PR.

There is **no mandatory human action for MP-0**. If two-account
behavior cannot be proven without a new login, write
`NOT_EXECUTED_REQUIRES_SEPARATE_APPROVAL` with a precise later
operator step-by-step: preflight, chosen private alias/source,
replacement risk, single explicit QR begin, browser readiness click,
phone confirmation only by the operator, bounded automated polling,
A/B isolation checks, failure stop/rollback and exact resume command.
Do not execute this later procedure now.

Finish with a concise result containing the contract/decision links,
changed files, source SHA and CI run IDs, actual test counts/outcomes,
unresolved upstream assumptions, MP-1 scope and an explicit
`MP-0 DESIGN_REVIEW_COMPLETE` or `BLOCKED` decision. Never write
"evidence incomplete" without naming the exact missing proof and
reproduction boundary.
