# Separate v2 directory transaction kernel

R2 keeps the existing v1 installer intact. A new unconnected kernel accepts
trusted authority/runtime ports; its default authority refuses all activation.
There is no new CLI/HTTP route, publisher verifier, production runtime adapter,
range expansion or qualification override. Prepared directory trees in fixtures
are inert text, never FQGate/updater execution. Real extraction remains blocked.

The kernel validates bounded, link-free immutable file trees and hashes a sorted
path/length/SHA256 inventory. current/candidate/previous/rejected are fixed local
slots. Application mutable state and sessions must live outside these payload
trees; actual upstream data-path semantics remain an integration blocker.

A preexisting trusted bootstrap ledger is mandatory. Missing/corrupt state never
silently bootstraps. Conservative Bridge replay rules reject decreasing release
or freshness counters, same-counter changed identities, version regression and
trust-policy changes. Those are Bridge invariants, not invented publisher rules;
the publisher verifier/bootstrap/revocation/expiry adapter remains unresolved.

Upgrade acquires a flushed exclusive lock with bounded owner identity, records
baseline/candidate digests and claims before stopping, proves managed ownership,
renames the full baseline into previous and candidate into current, then checks
exact runtime version, identity, IPv4-only listener and fixed health/OpenAPI/session/
lookup/queue/L2 qualification flags. Only then advances the security high-water
ledger atomically and records commit. previous is retained; a later invocation
refuses to overwrite it. A release verifier must bind tree identity to authenticated
artifact bytes before any real adapter can use this kernel.

On ordinary failure the candidate is stopped only with known managed identity;
baseline restoration requires its original tree hash and baseline health proof.
Any unknown identity, altered baseline or failed restore preserves journal/lock.
Crash checkpoints never pretend normal completion. Explicit recovery requires
positive proof the recorded lock owner exited, rejects corrupt/ambiguous journal,
recognizes only hash-proven reachable slot arrangements, resumes rollback and
preserves committed high-water marks. No age-based lock clearing or automatic
recovery timer exists. Full Windows power-loss durability still requires separate
native acceptance; passing synthetic checkpoints does not prove it.
