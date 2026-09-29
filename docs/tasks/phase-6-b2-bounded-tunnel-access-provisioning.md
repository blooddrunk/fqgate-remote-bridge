# Phase 6-B2 — bounded Tunnel ingress and Access provisioning

Status: **AUTHORIZED / READY FOR IMPLEMENTATION**.

## Goal

Extend the Phase 6 reconciler from the closed B1 DNS-create slice to a narrowly bounded,
auditable Cloudflare provisioning slice for the existing deployment topology:

```text
Cloudflare Access
  -> remotely-managed Tunnel
  -> http://127.0.0.1:17282 Bridge
```

B2 must make the already-reviewed desired state reproducible without becoming a generic
Cloudflare control-plane client. It must preserve every Phase 0-6-B1 security boundary.

## Authorized production mutations

B2 may implement only the following plan-bound mutations, and only when the Phase 6-A/B1
reconciliation model classifies them as an unambiguous safe create/update for the exact desired
resource:

1. Tunnel ingress configuration for the single intended remotely-managed Tunnel, limited to the
   three exact desired hostnames and exact service `http://127.0.0.1:17282`, plus the reviewed
   terminal fallback rule already represented by desired state.
2. Creation or narrow correction of the three existing Access applications (human, admin,
   machine) when hostname and application identity are unambiguous.
3. Creation or narrow correction of the specific policies belonging to those three applications,
   limited to the already-reviewed semantics in Phase 4/4.5/5:
   - human application remains human-only;
   - admin remains human-only, separate AUD, MFA/short-session posture as represented by desired state;
   - machine remains service-token only and cannot inherit human/admin policy.
4. Existing B1 DNS CNAME creation remains available under its original one-action, stale-plan,
   rollback and token-scope rules.

Every apply remains **one supported action per invocation** and must consume an exact,
fresh reconciliation fingerprint.

## Explicitly unauthorized

B2 must not implement or infer authority for:

- arbitrary Cloudflare endpoint/method/path input;
- arbitrary DNS update/delete or wildcard record management;
- Tunnel deletion, recreation, token rotation, connector-token retrieval or service installation;
- Access application deletion;
- broad policy replacement when ownership/identity is ambiguous;
- `Bypass`, `Everyone`, policy widening, wildcard hostname, wildcard origin or direct FQGate
  `127.0.0.1:17281` ingress;
- changing Bridge operation permissions, caller contexts, remote-admin allowlists or
  remote-machine operation grants;
- provisioning a Global API Key;
- storing setup write credentials in repo, JSON config, logs, evidence or command arguments;
- background reconciliation, daemonized apply, self-healing writes, or Phase 6-C credential
  retirement.

Any unsupported drift is `manual_required`, `blocked` or `unsafe_conflict`, never silently
normalized into an apply action.

## Stale-plan and identity binding

Reuse and generalize B1's transaction model rather than adding an alternate apply path.

Before each mutation:

1. validate the submitted plan/fingerprint and desired-state fingerprint;
2. rediscover the exact resource set;
3. prove that the targeted resource and all identity-defining fields still match the plan;
4. reject ambiguous duplicate names/hostnames/applications/policies;
5. reject any change that would broaden access or point ingress anywhere except
   `http://127.0.0.1:17282`.

After each mutation:

1. rediscover;
2. prove the exact postcondition;
3. prove no unrelated desired resource changed;
4. if the API supports safe transaction-local rollback, roll back only the object/version created
   or modified by this invocation and only when its identity still matches the invocation record;
5. otherwise fail closed and emit a bounded `MANUAL_REQUIRED` record with the exact resource ID,
   expected state, observed bounded state, and safe recovery procedure.

Never issue a destructive compensating action against a resource that pre-dated the invocation
unless the task has an exact preimage and the Cloudflare API supports a safe, identity-bound
restore. Prefer no automatic rollback over an unsafe broad rollback.

## Write transport and credential separation

- Keep the Phase 6-A read client physically/logically GET-only.
- Keep B1 DNS-write scope separate from B2 account-level Tunnel/Access write scope.
- Add typed fixed-endpoint write clients only for the exact Cloudflare APIs B2 needs.
- Validate token capabilities before mutation and fail closed if scope is broader/unknown in a way
  the implementation cannot safely reason about.
- On permanent Windows, B2 write credentials are entered only via hidden prompt, passed to the
  bounded process through environment/in-memory plumbing, and cleared in `finally`.
- Do not add B2 setup credentials to the long-lived acceptance Vault or runtime config.

## Deterministic automated verification

The implementation is not complete until automated tests prove at least:

- exact safe Tunnel ingress create/update plan -> one intended write;
- ingress to 17281, non-loopback origin, wildcard hostname/origin, duplicate route, ambiguous Tunnel
  -> fail closed with zero writes;
- stale plan between preview and apply -> zero writes;
- human/admin/machine Access app identity remains distinct;
- app hostname/AUD mismatch -> zero writes;
- policy widening to Bypass/Everyone or cross-profile policy reuse -> zero writes;
- ambiguous duplicate application/policy -> zero writes;
- machine policy cannot become human/admin policy and vice versa;
- one-action-per-invocation remains enforced across DNS/Tunnel/Access actions;
- unexpected Cloudflare response, redirect, oversize body, pagination overflow, timeout and partial
  failure remain bounded and secret-safe;
- redaction tests prove tokens/assertions/policy-sensitive payloads are absent from logs/errors;
- Phase 0-6-B1 regression suites continue to pass.

Prefer fixture-driven Cloudflare HTTP contract tests that record request method + fixed path +
bounded sanitized body, so tests can assert exact write count and exact endpoint family.

## Permanent Windows acceptance

Use only:

`D:\code\research\fqgate-remote-bridge`

Do not create a second checkout and do not overwrite operator changes.

Acceptance must begin with repository quality gates and Phase 6-A live discovery/plan. If the real
deployment is already in sync, **do not manufacture production drift** merely to exercise a
production update. In that case:

- prove zero-write refusal/no-op against the real in-sync plan;
- exercise write behavior through deterministic fixtures and, where Cloudflare permits a truly
  isolated temporary canary resource that cannot affect the production hostnames/policies, use a
  dedicated B2 canary with automatic cleanup;
- never weaken or temporarily replace a production Access policy for testing.

If genuine supported drift exists naturally, the operator may apply one reviewed action at a time
and the harness must automatically rediscover and verify the postcondition after each action.

After the final B2 mutation/no-op verification, automatically run:

1. Phase 6-A read-only live acceptance and assert deterministic no-op plan;
2. Phase 5-C real remote-machine service-token matrix;
3. Phase 4.5 headed ordinary/admin browser matrix;
4. local Phase 5-A/B/C regressions and loopback listener checks;
5. full repository install/typecheck/lint/test/build/format/E2E gates;
6. exact-final-runtime-commit Ubuntu and Windows GitHub Actions CI.

Secret-free evidence must include commit SHA, tool/runtime versions, plan fingerprints, bounded
resource IDs/types, exact mutation count, endpoint families, PASS/FAIL IDs and postcondition
classification. It must never include tokens, Access assertions/cookies, service-token secrets,
Tunnel credentials, QR/session material or raw sensitive Cloudflare bodies.

## Human intervention boundary

Automation is the default. Human action is allowed only for:

1. hidden entry of a least-privilege B2 Cloudflare write credential;
2. ordinary/admin Cloudflare Access login + MFA when the existing headed browser harness requires it;
3. physical FQGate QR only on exact normalized `LOGIN_REQUIRED`;
4. a real Cloudflare API limitation that cannot be verified automatically.

For item 4 the implementation must emit `MANUAL_REQUIRED` with all of:

- exact Cloudflare dashboard navigation;
- exact resource ID/name and field;
- expected value;
- why the API/automation cannot prove or change it safely;
- what must not be changed;
- exact command to resume automated verification.

A statement such as "evidence not fully recorded" is not an acceptable closure artifact.

## Exit criteria

B2 closes only when:

- the bounded mutation surface above is implemented and tested;
- unsupported/broad/destructive drift is proven fail-closed;
- permanent Windows ends at a deterministic no-op plan;
- human/admin/machine remote paths all pass after B2;
- loopback-only origin topology is re-proven;
- no setup write credential is persisted as a runtime dependency;
- exact final runtime commit has successful Ubuntu + Windows CI;
- a secret-free implementation handoff records exact checks, IDs and remaining boundaries.

Phase 6-C remains unauthorized until B2 is closed.
