# FQGate 2.0.5 MP-1 offline Resolver implementation handoff

Date: 2026-10-22 (Asia/Taipei). Scope: **offline executable prototype only**.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.

## Source and delivery custody

Clean source was fast-forwarded from `607d174e299371b1f296ca35175f64b6675b7e8c`
to fetched `origin/main` `14b5c339ef8f46f113f7b35510994e7dcf4cb0a3`, then the
implementation branch `codex/fqgate205-mp1-offline-resolver` was created.
No reset, clean, forced push, second checkout or runtime replacement occurred.
The existing permanent Windows checkout stayed clean at `607d174`; its historical
served runtime `481db65097cd63ea0f9c28f39e526e341b700721` was not redeployed.
No current native listener/login availability is claimed.

The final implementation commit, PR URL and exact-head Ubuntu/Windows run/jobs
are bound in the PR and Git-external `delivery-receipt.json` under
`/home/jelinenaro/research/fqgate-mp1-evidence-20261022`. This avoids embedding a
self-referential commit SHA. A complete designation requires all checks below
and both CI jobs for the final PR head, not an earlier successful run. CI checkout
is explicitly pinned to the PR head SHA (or push SHA), rather than GitHub's
synthetic merge commit. No merge
or deployment is implied by an implementation PR.

## Implementation and isolation

- `src/bridge/profiles/types.ts`: bounded synthetic evidence, injected authority,
  monotonic deadline clock, observation/QR/status/lookup ports and private lease
  type. Account tokens and worker creation evidence are **synthetic**, not new
  native FQGate facts. Display text never becomes identity proof.
- `registry.ts`: explicitly enrolled immutable snapshots, strict aliases
  (`p_` + 32 lowercase hex), at most 16 registrations, duplicate source/account
  rejection and explicit legacy-default/pin validation. Disable/remove/re-enroll
  propagate invalidation. Re-enrollment cannot recycle an alias for another
  account; it requires a new revision and explicit fixture-owned expected proof.
- `resolver.ts`: `resolve`, `validate`, synchronous `effect` and `commit` use
  runtime-owned, frozen empty objects recognized only by a private WeakMap.
  Each operation gets its own capability for the same registered binding;
  callers cannot serialize, forge or change its operation/target. Records bind
  registration/policy revision, authority principal/AUD/deployment, boot nonce,
  profile/deployment generation, exact artifact/contracts/endpoint, parent
  PID/path/creation, source/worker and account/entitlement evidence. No await
  separates final policy/generation validation from synchronous publication.
- `prototype.ts`: four synthetic operations, no result cache/dedup, generic
  errors, owner-aware memory-only QR flows, cancellation/selection visibility
  tokens and a conservative global QR mutex. The mutex also survives a deadline
  until the original auth Promise settles. Cancellation or fencing hides results;
  it **does not revoke or undo authentication** already performed by a port.
  Unexpected (including newly connected expected) enrollment is staged privately
  and suspended until explicit expected-account enrollment. There is no retry,
  fallback, repair, source creation, saved-login change or activation path.

Bounds: 5-second total fake deadline per operation including observations;
16 inventory entries and 16 lookup rows; bounded evidence strings, 128-character
instrument names and 8192-character synthetic QR. Flows expire at 120 seconds,
terminal retention is 30 seconds, with at most one active flow and 16 tombstones.
The boot-lifetime spent-UUID set is capped at 256: exhaustion denies before POST,
and tombstone eviction never makes an old UUID reusable. UUID factory entropy
is mixed with the boot nonce; a new instance rejects old leases and UUIDs.
At most 32 requests and 32 unsettled injected port calls are retained, even after
timeouts or when the same raw Promise is returned repeatedly. WeakMaps/WeakSets
do not retain abandoned lease/view objects. No data/QR/account material is logged.

The injected ports/clock/authority and enrollment control are trusted fixture
composition, not public API. The prototype provides no live observations or
production authority implementation. Future integration must review these ports,
boot entropy, total native I/O bounds and enrollment independently.

## MP1-01..28 receipts

`tests/profile-resolver.test.ts`: **28/28 PASS**, zero failures; fake clock and
Promise barriers, no sleeps. Every case emits normalized outcomes, fake call
counts and bounded resource counts; afterEach checks no foreign response/error,
no pending work/timer leak, and all allocation bounds. Totals below combine all
subfixtures in each numbered case; counts are observe / begin / poll / status /
lookup, all synthetic. Real I/O is absent by the module audit, not a live probe.

| Case   | Result                       | Fake calls (observe / begin / poll / status / lookup) |
| ------ | ---------------------------- | ----------------------------------------------------- |
| MP1-01 | PASS                         | 16 / 1 / 1 / 1 / 2                                    |
| MP1-02 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-03 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-04 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-05 | PASS                         | 5 / 0 / 0 / 1 / 0                                     |
| MP1-06 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-07 | PASS                         | 20 / 2 / 1 / 0 / 0                                    |
| MP1-08 | PASS                         | 9 / 2 / 0 / 0 / 0                                     |
| MP1-09 | PASS                         | 20 / 1 / 1 / 0 / 6                                    |
| MP1-10 | PASS                         | 15 / 0 / 0 / 0 / 5                                    |
| MP1-11 | PASS                         | 16 / 4 / 0 / 0 / 0                                    |
| MP1-12 | PASS                         | 3 / 0 / 0 / 0 / 1                                     |
| MP1-13 | PASS                         | 8 / 0 / 0 / 0 / 2                                     |
| MP1-14 | PASS; epoch remains unproven | 4 / 0 / 0 / 0 / 1                                     |
| MP1-15 | PASS                         | 9 / 0 / 0 / 0 / 3                                     |
| MP1-16 | PASS                         | 17 / 2 / 1 / 1 / 0                                    |
| MP1-17 | PASS                         | 12 / 2 / 1 / 1 / 0                                    |
| MP1-18 | PASS                         | 9 / 0 / 0 / 0 / 3                                     |
| MP1-19 | PASS                         | 9 / 0 / 0 / 0 / 3                                     |
| MP1-20 | PASS                         | 774 / 256 / 1 / 0 / 0                                 |
| MP1-21 | PASS                         | 5 / 0 / 0 / 0 / 2                                     |
| MP1-22 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-23 | PASS                         | 0 / 0 / 0 / 0 / 0                                     |
| MP1-24 | PASS                         | 12 / 1 / 1 / 1 / 1                                    |
| MP1-25 | PASS                         | 168 / 0 / 0 / 0 / 66                                  |
| MP1-26 | PASS                         | 9 / 2 / 0 / 0 / 0                                     |
| MP1-27 | PASS                         | 8 / 2 / 0 / 1 / 1                                     |
| MP1-28 | PASS                         | 6 / 1 / 1 / 0 / 0                                     |

MP1-14 deliberately demonstrates an undetected A → B → A between samples and
requires `LIVE_SESSION_EPOCH_UNPROVEN`. Its PASS means the limitation is reported,
not that live identity is proven. MP1-27 starts B lookup while connected, then
simulates B disconnect before A QR so the legacy peer guard remains intact;
the deployment fence discards B's delayed response before a new observation.
B's disconnected status is tested separately. This does not prove independent
native authentication across two connected accounts.

## Automated verification

Linux/WSL x64: Node `v24.19.0`, pnpm `11.23.0`. Commands run from repository root;
final exit codes and hashes are in the Git-external `<check>.json`/`.log` receipts.

| Command                                                        | Result / exit          |
| -------------------------------------------------------------- | ---------------------- |
| `corepack pnpm install --frozen-lockfile`                      | PASS / 0               |
| `corepack pnpm exec vitest run tests/profile-resolver.test.ts` | 28 PASS / 0            |
| `corepack pnpm typecheck`                                      | PASS / 0               |
| `corepack pnpm lint`                                           | PASS / 0               |
| `corepack pnpm test`                                           | 680 PASS, 34 files / 0 |
| `corepack pnpm build`                                          | PASS / 0               |
| `corepack pnpm format:check`                                   | PASS / 0               |
| `corepack pnpm test:e2e`                                       | 19 PASS / 0            |
| `node scripts/audit-profile-prototype.mjs`                     | PASS / 0               |

The initial new-test typecheck failed with exit 2 (fixture type-inference cycle)
and lint with exit 1 (type-only import). Both were corrected and rerun. The
initial test iteration also corrected omitted-alias/barrier/TTL fixture
expectations. No environment/service change was needed. Build-generated route
output is checked against the baseline and excluded from the implementation.
Rerun the exact command above after a source correction; stop at a failing offline
check, with no native repair or login. All public evidence is synthetic/redacted.

`audit-profile-prototype.mjs` parses imports, exports, import types and literal
dynamic loads, resolves TypeScript paths, and checks reachability from every
non-prototype source in `src`, `server`, `config`. **124 production files**, zero
paths into the four prototype modules, zero external dependencies from those
modules, zero forbidden I/O globals. The audit runs in both CI jobs. Production
runtime, routes, UI, configuration, adapters, v1/v2 compatibility, operation
registry, machine OpenAPI and context/JWT/Origin/intent rules are unchanged.
The unchanged baseline suites exercise v1 and exact-2.0.5 single-profile behavior,
including ambiguous two-connected-source denial and all remote allowlists.

Permanent Windows x64 / Node `v24.20.0`, existing checkout only: the source and
fixture scripts were byte-compared with this implementation's unchanged versions.
No build output was overwritten and no listener/service was started. These
commands passed with exit 0:

```powershell
Set-Location D:\code\research\fqgate-remote-bridge
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate205-qr-preflight.ps1
node .\scripts\windows\test-fqgate205-qr-identity.mjs
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\test-fqgate-v2-observation.ps1
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\bootstrap.ps1 -VerifyCli
powershell.exe -NoProfile -NonInteractive -File .\scripts\windows\acceptance.ps1 -VerifyCli
```

Results: native QR fixtures **28/28**, identity **5/5**, no-approval/zero-QR guard
**1/1**, v2 observation fixtures **40/40**, both CLI smoke commands PASS. The
existing CLI reports build commit `unknown`; this is not final-head runtime proof.
Final-head native build/tests/CLI/loopback fixture smoke run in GitHub Actions;
Windows browser E2E remains skipped by the existing workflow, Linux E2E passes.
`-VerifyBridge` was not run on the permanent host. The CI temporary fixture server
is not a permanent-host deployment or multi-account acceptance.

## Remaining native gates and next boundary

Native A/B isolation, stable account identity/session epoch, source persistence,
same-account duplicate behavior, saved-login isolation and L1/L2 displacement are
**NOT_EXECUTED**, independently of offline success. Publisher signature/replay and
full directory/power-loss rollback remain unqualified historical gates.

A subsequent separately authorized integration must first build an alias-aware
GET-only preflight and one-attempt harness; prove exact running build, loopback
listeners, process/source/profile bindings and expected account evidence; explain
possible account replacement/logout/L2 effects; obtain explicit account-operation
authorization and readiness; allow at most one QR begin and operator-only phone/MFA
confirmation; automate bounded poll/A-B negatives. Stop on drift, timeout,
unexpected account or permission failure without retry/logout/restore/restart.
No live continuation command exists in MP-1, so none is invented here.
