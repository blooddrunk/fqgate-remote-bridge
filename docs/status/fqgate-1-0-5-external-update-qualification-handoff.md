# FQGate 1.0.5 external-update qualification handoff

Status: **permanent-Windows qualification and regressions passed; PR review/merge pending**.

On 2026-09-30 the operator's FQGate self-updater had already replaced managed current with official 1.0.5. Bridge's old active record still named 1.0.4, and no previous executable was present. The normal `fqgate qualify` replacement transaction correctly refused to overwrite this unvalidated current file.

The separate local `fqgate qualify-current` path now verifies the exact official stable package (`23707648` bytes, SHA-256 `2b9613dbf2d0f10b1672684f2e24ac8917d2d8d3fa9bd7fbbae04d57dd73d83c`), one `127.0.0.1:17281` listener owned by the managed executable, health, required OpenAPI and the fixed lookup semantic probe. It rechecks release, file and PID before writing the active qualification. It does not replace or restart FQGate. A failed probe leaves the current file unvalidated; no absent rollback file is claimed.

## Permanent Windows evidence

Existing checkout: `D:\code\research\fqgate-remote-bridge`, clean on qualification implementation commit `daf0523`. The CLI returned `validated / ready / running` for 1.0.5, PID `49020`, exact official SHA-256, connected session and one artifact-bound `market.instruments.lookup` semantic evidence record. No QR action was required.

On the same checkout, `scripts/windows/phase7a-acceptance.ps1` passed P7A-01 through P7A-13, including 293/293 unit/integration tests, 15/15 Playwright tests, live inspect/watch/journal checks, both loopback listeners and unchanged Bridge remote surface. Its external bounded evidence is `D:\code\research\fqgate-phase7a-acceptance-evidence.json`.

Phase 5-C local lookup/docs matrix passed 6/6. The real Cloudflare service-token matrix passed 22/22 and the Windows wrapper passed 3/3 using existing Vault credentials. The first wrapper invocation had all request checks pass but could not resolve the Git commit because process-local Git safe.directory was omitted; the rerun supplied it and passed fully. The bounded remote evidence remains outside Git at `D:\code\research\fqgate-phase5c-remote-evidence.json`.

The implementation commit `daf0523` passed [Ubuntu and Windows CI](https://github.com/blooddrunk/fqgate-remote-bridge/actions/runs/36664311951). Follow-up deterministic drift/transaction tests and this handoff will receive their own final-commit CI before PR review closes.

## Future upgrades

Prefer the existing local Dashboard preview/qualification transaction while the old managed binary still exists; that path has a real rollback file. If FQGate has already self-updated, the explicit one-command CLI path above avoids a manual file swap, release hard-code change, and repeated state repair. The release's real Windows and remote regression checks remain acceptance requirements; they can be automated with existing scripts and Vault-backed credentials.
