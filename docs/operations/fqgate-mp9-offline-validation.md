# MP-9 repeatable offline validation and excluded live boundaries

Use a fresh isolated `codex/` worktree of the PR head. Never build in permanent
Windows `D:\code\research\fqgate-remote-bridge` or replace its existing outputs.
The task authorizes source, deterministic fixtures and inert CI only.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
node scripts/audit-profile-prototype.mjs
pnpm build:cli
FQGATE_BRIDGE_BUILD_DIRECTORY=/absolute/external/mp9-ssr pnpm build:bridge
pnpm format:check
pnpm exec playwright install --only-shell chromium
pnpm test:e2e
```

Linux E2E uses only its isolated test server at 127.0.0.1:17283. It is not live
native/service acceptance. Windows browser E2E stays SKIPPED by CI policy.
Windows full unit CI executes MP-9's production fixture regression. In a new
repo-external inert staging directory, also execute existing Windows fixture
scripts `test-fqgate-v2-observation.ps1`, `test-fqgate205-qr-preflight.ps1`,
`test-fqgate205-mp2-native.ps1`, `test-fqgate205-mp3-native.ps1`,
`test-fqgate205-mp4-cli.ps1`, `test-fqgate205-mp6-host.ps1`,
`test-acceptance-credential-vault.ps1`, `test-fqgate205-qr-identity.mjs` and
`test-fqgate-mp8.mjs`, with staged exact-source CLI outputs. The QR preflight
suite includes the no-approval boundary; Vault must use its fake-store suite.
Never invoke a real Vault-write smoke locally. Check each child exit **and**
case count/summary; a successful wrapper is insufficient. Exact final commit,
tree, build inputs, tool versions, commands/UTC/exits/counts/log hashes and
protected comparisons are retained externally in the delivery receipt.

The initial ordinary negative reproduction is retained externally with baseline
production bytes unchanged. To reproduce it independently, use a separate main
baseline worktree at `ec3b0bf4c820a7a469bb22c073ea1d5288e58023`, change only the
existing P0 `it.fails` to `it`, and run:

```sh
pnpm exec vitest run tests/fqgate-v2-lookup.test.ts -t 'P0 production'
```

Expected baseline: exit 1, assertion reports one instrument returned instead of
rejection. PR head: ordinary P0 negative passes with FQGATE_INCOMPATIBLE and no
published instrument. Initial red is evidence of the defect, never a green check.

## Future host/account work — NOT_EXECUTED, not prerequisites to this PR

No human action is needed for offline completion. Native host acceptance is
excluded because the preserved host installation is 2.0.6, current running
2.0.5 ownership/build is unestablished, and Issue #34 forbids restoration or
account operations. Historical absent listeners are not a fresh native census.

1. **Host restoration/census:** obtain a separately reviewed and explicitly
   authorized exact-version/artifact/build plan, protected backups, listener/
   worker ownership and rollback limits. Use the three existing MP-6
   [decision sheets](windows-fqgate205-mp6.md); they remain drafts. The operator
   must review the sheet's exact start/deploy command and configuration before
   any execution. Do not run it under MP-9. Once separately authorized prerequisites
   are met, the existing GET-only diagnostic may resume:
   `node scripts/windows/fqgate205-mp5-triage.mjs --config D:\code\research\fqgate-acceptance-config.json --profiles D:\code\research\fqgate-mp2-profiles.json --evidence D:\code\research\<new-evidence-directory>`.
   Run from the separately reviewed staged source directory, preserving the
   permanent checkout; use fresh matching preflight tools for the chosen version. Expected:
   sole loopback owners, exact reviewed build/payload and coherent Source/account
   evidence. STOP on absent/ambiguous listeners, state-0 UNKNOWN, identity mismatch,
   precision downgrade, unexpected writes or account drift. Preserve receipts;
   do not force-kill, retry startup, adopt records or invoke lifecycle status
   cleanup. File rollback cannot undo provider sessions. Only then can separately
   scoped local/remote regression be considered.
2. **QR/MFA/Saved Login/L2/two-account experiment:** no approved commands or UI
   actions exist in this issue. Require fresh account-owner consent, a reviewed
   one-attempt procedure with exact A/B identities, local attendance, authorized
   actions, expected observations, STOP and provider-side non-reversibility. Do
   not use older QR Live runners as a shortcut. This prerequisite cannot be
   automated because it grants new account authority and physical phone/MFA
   approval. After a future authorized run, resume that task's bounded GET-only
   checks and regression commands; fixture success cannot replace real evidence.
3. **Upstream identity/epoch inquiry:** draft only; no sending authorized.
   Independently authenticated native field semantics are required before
   claiming strong identity, epoch or complete isolation. New versions only
   trigger review; release/static hashes never authorize installation.

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / LIVE_UNQUALIFIED / PROD_NO_GO**.
