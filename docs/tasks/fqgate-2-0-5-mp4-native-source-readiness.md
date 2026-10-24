# MP-4 — Native Source contract clarification and GET-only readiness

Authorized by [Issue #24](https://github.com/blooddrunk/fqgate-remote-bridge/issues/24)
after MP-3 PR #23, merge `eb70a6dc4e3d04bbb94974bbfb3dd7b562f3ce97`.
**LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED**.

## Scope

Clarify exact Windows x64 FQGate 2.0.5 Source/account/session/Saved Login/L2
contracts and independently assess supported process/port/complete storage-root
configuration. Classify CONTRACT_PROVEN, OBSERVED, FIXTURE_ONLY, UNPROVEN,
UNKNOWN, BLOCKED and NOT_EXECUTED separately. Missing documentation is not proof
of impossibility; client action availability is not a server isolation guarantee.

Extend MP-2's standalone GET-only preflight, preserving explicit immutable
alias → Source ID/number/state mapping, exact installed client and native process
checks. Bound reads and reject unknown OpenAPI, stale responses, PID reuse,
creation/parent/path changes, Source/account/peer drift and ambiguous mappings.
Report current Bridge self-reported build, checkout mismatch and listener owner.
Missing 17282 is actionable BLOCKED; never start or deploy Bridge to fix it.
No new mock login framework or production Resolver integration.

Production v1/2.0.5 adapters, single-connected-source guard, MP-1, four caller
contexts/permissions and Cloudflare stay unchanged. No native process launch,
stop/restart, account/Source/config/Saved Login/WebView mutation, QR POST,
phone operation, L2 query or upstream message is authorized. A future one-attempt
research protocol is design only; any POST-capable implementation requires a
separate reviewed change and explicit operator authorization.

## Verification and delivery

Frozen install; typecheck; lint; full tests; build; format; Linux Playwright;
prototype/diagnostic import audit; Windows MP-2/MP-3/QR/identity/v2/CLI fixtures;
real Windows GET-only preflight. Capture commands, exits, counts, UTC, source/tool
hashes and reduced gates externally. Require Ubuntu/Windows CI on final PR HEAD;
Windows browser E2E remains skipped. Never convert a blocked native preflight
into PASS because fixtures are green.

Deliver [contract matrix](../plans/fqgate205-mp4-native-source-contract.md),
[Windows repeat / future authorization protocol](../operations/windows-fqgate205-mp4.md),
[handoff](../status/fqgate-2-0-5-mp4-readiness-handoff.md), diagnostics, tests and PR.
