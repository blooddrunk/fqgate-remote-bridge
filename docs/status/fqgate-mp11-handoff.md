# MP-11 offline contract delta handoff

2026-11-06 Asia/Taipei. [Issue #39](https://github.com/blooddrunk/fqgate-remote-bridge/issues/39).
**HOST_BLOCKED / LIVE_UNQUALIFIED / PROD_NO_GO;
LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.

## Delivered result

Initial `git status --short` was clean; fetch/prune advanced origin/main to
`52e0620a7cbb8b89e34eadbb12e1095cfaa77b49`, the independently reviewed MP-10-A
PR #38 merge. Latest commits/open PRs/issues and official application/agent
releases/commits were inspected: no open PR at scope selection, latest 2.0.7.
Fresh branch `codex/mp11-207-contract-diff` and worktree
`/home/jelinenaro/research/fqgate-mp11` start at that accepted base. The original
Linux working tree and preserved Windows branch/output were not switched.

The [versioned matrix](../plans/fqgate-mp11-contract-delta.md) separates exact
205 source/historical requirements, preserved 206 research and new 207 static
findings. The [pins](../compatibility/fqgate-mp11-static-pins.json) and
[report](../compatibility/fqgate-mp11-static-report.json) are reproduced by a
standalone script that reads the reused exact MP-7 ZIP and retained 206 EXE.
It never executes EXE/DLL/embedded JS, writes package members, contacts local
APIs or constructs production application/config/lifecycle objects.

207 local API slice equals 206 byte-for-byte. QR slice has exactly one changed
eight-byte range in its main bundle import; other dependencies/native behavior
remain unproven. The search helper and account display helper provide bounded
static vocabulary only. Embedded legacy OpenAPI is still info.version 1.0.2,
with all seven required v2 method/path pairs missing. There is no new runtime
207 fingerprint, strong account ID, Source lifetime or monotonic login epoch.
Complete old/new runtime schema diff remains UNKNOWN because complete old
documents are unavailable and a new live census is outside this authorization.

No new candidate adapter is justified: MP-8 already has inert fake 207 cases
and real-byte denial; native evidence is still missing. Every production source,
configuration, route, permission and candidate registry stays byte-identical to
BASE. The import audit additionally rejects production imports of the new static
tool/pins/report, including type/re-export edges. Existing CI is unchanged.

The [MP-10-B memo](../plans/fqgate-mp10-host-decision.md) now records resolved
byte facts, exact unresolved native facts and a draft operator sheet. No runtime
target or start/repair command is selected. Historical MP-6 sheets remain drafts.

## Measured checks

| Check                                                                           | Result                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                                                                  | PASS, exit 0; pnpm 11.23.0                                                                                                                                    |
| Typecheck / lint                                                                | PASS, exits 0                                                                                                                                                 |
| Full unit                                                                       | PASS, 1132 tests / 42 files, including 33 new static/adversarial tests                                                                                        |
| Production import / permission preservation                                     | PASS; existing runtime and permission sources equal BASE; zero research imports                                                                               |
| Isolated CLI + SSR build                                                        | PASS, exit 0; worktree outputs only                                                                                                                           |
| Linux Chromium E2E                                                              | PASS, 19 cases, fake upstream and isolated port 17283                                                                                                         |
| Format                                                                          | Final check recorded in external delivery receipt                                                                                                             |
| Native Windows v2 observation                                                   | PASS, 40 inert cases                                                                                                                                          |
| Native Windows QR preflight / identity / no-approval                            | PASS, 28 + 5 + 1 cases                                                                                                                                        |
| Native Windows MP-2 / MP-3 / MP-4/5 / MP-6 / MP-8                               | PASS, 14 / 14 / 12 / 11 / 17 cases                                                                                                                            |
| Native Windows Vault fake store                                                 | PASS; no real credential read/write                                                                                                                           |
| Native operator-PC real Vault smoke                                             | NOT_EXECUTED; existing hosted Windows workflow runs it in an ephemeral runner                                                                                 |
| Windows browser E2E                                                             | SKIPPED / NOT_EXECUTED by unchanged CI policy; Linux executes browser matrix                                                                                  |
| Existing hosted PR Linux + Windows CI                                           | Final receipt/PR checks bind actual synthetic merge SHA, source HEAD, BASE, both revision attestations, run/job IDs and log hashes; no head-only substitution |
| Real host, local/remote authenticated semantics, accounts/QR/MFA/Saved Login/L2 | NOT_EXECUTED; no host restoration or live qualification                                                                                                       |

The new fixtures cover size/hash corruption/truncation, invalid UTF-8, unsafe
ranges/overlaps/duplicate/unbounded specifications, executable-looking hostile
text without execution, exact comparison bounds and redacted CLI denial.
No fixture success is reported as native or publisher acceptance.
Existing route-generator circular-dependency and bundle warnings do not fail
the checks; raw logs retain them. Bootstrap inspection errors and any failed
attempts remain in the private evidence notes, never relabeled PASS.

## Custody, blockers and next action

External Linux receipts:
`/home/jelinenaro/research/fqgate-mp11-evidence-20261106`.
Native inert staging:
`D:\code\research\fqgate-mp11-evidence-20261106\validation`.
Final machine-readable `delivery-receipt.json` binds final source/tree, source
inventories, lockfile/tools/scripts, all input hashes/provenance, commands,
UTC/cwd/exits/counts, failure/skip records, protected before/after manifests
and CI logs. Final hashes/CI IDs are external to avoid self-referential commits.
Initial pre-runner sync timestamps were not separately instrumented; their
commands/results are retained in the chat transcript and marked accordingly.

Protected comparisons cover 591 Windows outputs/config/candidate entries and
10 fixed native/manifest/record entries. Windows remains clean at
`c06fbcff1db11179bdad95ab83c90e888aa62587` on
`codex/fqgate206-compatibility`. These are sampled file continuity checks,
not machine-wide no-write or running-process attestation. No new live listener
observation was made; historical absence is not claimed as current evidence.

Remaining blockers are actual native v2 schema/semantics/503 behavior, strong
identity/epoch and complete storage/IPC namespaces, current runtime ownership,
publisher/expiry/replay trust and full native/session rollback. The
[operations document](../operations/fqgate-mp11-offline-review.md) names the
attempted static checks, why they cannot answer those questions, and the next
executable path: independent PR review, then separately scoped offline native
contract review or precise metadata-only observation. No human action is needed
to complete this offline PR. Host restoration and real account work require
separate concrete action/command/impact/STOP/rollback/resume authorization.

Stop at independent review. No self-merge, tag, release, deployment, service
start/stop, native/Cloudflare/account mutation, credential copying or upstream
inquiry send.
