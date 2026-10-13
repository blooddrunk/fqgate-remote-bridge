# FQGate v2 safe upgrade engineering (R2)

Authorized by the user's 2026-10-13 continuation: complete v2 safety engineering,
then upgrade/start only after prerequisite gates actually pass. This supersedes
R1's observation-only implementation scope, not its issuer trust or merge gates.
Do not ask the operator to find cryptographic keys or attest missing evidence.

Work that can proceed independently: a separate framework-independent directory
transaction/recovery kernel and persistent monotonic replay-state validation,
with fake trust/runtime ports and inert temporary directory packages in tests.
No production CLI/native process adapter is connected before independent signing,
bootstrap/revocation/freshness policy, Windows durability and isolation contracts
are established. Default trust authority refuses all activation. Fixtures are not
publisher verification, Windows runtime qualification or production rollback.

Keep v1 replaceExecutable, supportedRange/validatedVersions, Bridge operations,
remote permissions and planning-only Supervisor unchanged. No automatic upgrades,
Cloudflare writes, startup integration, notifications or Phase 7-B2/7-C.
Protect the existing permanent Windows checkout and operator state.

Every mutation in the kernel must be preceded by verified authority facts,
strict durable-state validation, exact payload-tree identity and managed-process
proof. Use fixed current/candidate/previous/rejected slots, exclusive writer locks,
atomic flushed journal/state writes, and conservative crash recovery. Never infer
an orphaned lock from age; a trusted owner-exit proof is required. Failure restores
only the verified retained baseline. Preserve journal/lock if identity, hashes or
rollback proof fail. Never delete old high-water marks on runtime rollback.

Validation: frozen install, typecheck, lint, complete tests, build, format,
Linux Playwright, Windows fixture behavior and exact-final-head CI. Record code
versus actual deployment gates separately outside Git. PR #15 and Issue #16 stay
open when publisher, real Windows transaction/runtime or production gates remain
blocked. No untrusted v2 execution is authorized by the desire to make gates pass.

Non-executing publisher-authenticity research may materialize only the two exact
root PE entries from an already size/hash/structurally audited official ZIP into
an isolated OS quarantine directory, inspect Windows Authenticode metadata, then
remove the directory. No process launch, installation, updater, arbitrary ZIP
extraction, trust-store modification or binary approval is implied. This probe
cannot replace envelope verification, independent publisher identity/revocation
or authenticated anti-replay.
