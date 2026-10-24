# MP-4 coding-agent goal

Follow Issue #24 and `docs/tasks/fqgate-2-0-5-mp4-native-source-readiness.md`.
Sync safely from MP-3 PR #23; preserve permanent Windows runtime/configuration.
Review `docs/plans/fqgate205-mp4-native-source-contract.md` and the MP-1/2/3
handoffs before changing diagnostics. Reuse the GET-only MP-2 preflight, require
explicit A/B mappings, exact client/OpenAPI and native PID+creation ownership,
no late follow-up reads after failure, bounded freshness and reduced evidence.
No POST-capable execution path, QR/account/phone action, process launch/deploy,
Source/Saved Login/WebView mutation or runtime permission change. Do not send the
upstream clarification draft. Document absent 17282 and other native gates with
exact GET-only repeat commands. Run the full quality matrix, Windows fixtures,
real GET-only observation and exact final-head Ubuntu/Windows CI. Keep production
integration NO-GO while identity/epoch contracts remain unproven and retain
LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED. Future account experiments require
a separate reviewed change and fresh explicit operator authorization.
