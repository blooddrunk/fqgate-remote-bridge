# MP-8 repeat and excluded operator actions

**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED / PROD_NO_GO**.
Contract: [MP-8 task](../tasks/fqgate-mp8-admission-candidates.md).
Run only in a new isolated worktree from accepted main; preserve permanent
`D:\code\research\fqgate-remote-bridge`, c06fbcf and all old outputs/private files.

## Engineering commands

Node 22+, pinned pnpm 11.23.0. Actual engineering worktree:
`/home/jelinenaro/research/fqgate-mp8`; external receipts:
`/home/jelinenaro/research/fqgate-mp8-evidence-20261106`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
node scripts/audit-profile-prototype.mjs
pnpm build:cli
node scripts/windows/test-fqgate-mp8.mjs
FQGATE_BRIDGE_BUILD_DIRECTORY=/absolute/new/evidence/ssr pnpm build:bridge
PLAYWRIGHT_HTML_OPEN=never pnpm test:e2e
pnpm format:check
node scripts/observe-fqgate-releases.mjs --baseline /absolute/existing/mp7-baseline.json
```

`build:cli` cleans only this new worktree's dist, never an existing served output.
SSR is directed to a fresh external directory. Linux E2E starts its isolated
127.0.0.1:17283 test server. CI checks exact PR head on Ubuntu/Windows; Windows
browser E2E remains SKIPPED by policy. Windows inert compiled suite runs via
native Windows Node from copied dist/scripts in a new evidence-only directory:

```powershell
node D:\code\research\fqgate-mp8-evidence-20261106\validation\scripts\windows\test-fqgate-mp8.mjs
```

Other native inert suites: MP-2 14, MP-3 14, MP-4/5 flags 12, MP-6 11, v2
observation 40, QR preflight 28, identity 5, Live no-approval 1, fake Vault store.
These start diagnostic interpreters and inert fixture files only. No real Vault
write smoke locally; hosted isolated CI owns its existing smoke step.

Receipts record exact argv, UTC, cwd, exit, duration, source SHA plus source-file
inventory, runner/tool/log SHA-256, staged Windows input inventory and protected
before/after lists. Keep failures, including P0 red and harness setup failures;
process exit 0 alone is insufficient if a required fixture did not run. No raw
private config, account/Source/QR material or display hashes go into Git.
File inventory continuity is sampled, not OS-wide zero-write attestation.

## Native census and future human boundaries

Current MP-8 read-only MP-6 metadata collection reports no 17281/17282 TCP rows;
running artifact remains UNKNOWN. **HOST_BLOCKED / semantic census NOT_EXECUTED**.
No PID/listener/version/build/backup/rollback attestation is fabricated. Do not
start or repair services to pass. Engineering continues independently.

No human step is required to complete MP-8. If a later task needs runtime work,
use the three [MP-6 decision sheets](windows-fqgate205-mp6.md) as drafts only.
Before requesting approval, bind the chosen exact artifact/source/hash and
protected inventory, verify backup/rollback and both listener owners, provide
the exact version-specific fixed GET commands, expected results, STOP rules and
resume commands. No such authorized native execution plan exists in MP-8.
STOP on missing/ambiguous owner, state 0, rounded creation, build/hash/version
drift, unapproved path/method, account drift or unexpected write. No retry/adoption.
Never run broad lifecycle status or Dashboard diagnosis: historical status can
delete a stale process record. File restoration cannot restore provider sessions.

Strong-account-ID/monotonic-epoch/Source recreation/Saved Login/L2/storage/IPC/port
questions remain an **unsent draft**, based on the versioned MP-6 inquiry and
MP-7 matrix. Do not send without separate approval. A display or old query-pool
epoch cannot resolve it; an external disclosure cannot be rolled back.

Account/QR/phone/SMS/MFA/Saved Login/L2 and double-account experiments require
fresh independent approval with operator presence, explicit A/B expected native
identities, one-attempt protocol, commands, STOP and recovery steps. No such live
command is provided or executed here. Never infer permission from fixture/CI
success or elapsed time. End at independent PR review, no merge/tag/release,
deployment, service actuation or Cloudflare change.
