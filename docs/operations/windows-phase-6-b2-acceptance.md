# Phase 6-B2 permanent-Windows acceptance

Status: closed after permanent-Windows live acceptance on 2026-09-29. The task contract is
`docs/tasks/phase-6-b2-bounded-tunnel-access-provisioning.md`. Use only the existing
`D:\code\research\fqgate-remote-bridge` checkout. Never manufacture drift in the
three production hostnames or policies.

## Inputs and boundaries

Use the existing repo-external Phase 6-A desired state, Bridge config, and
Tunnel ingress config paths. The invoking user must have a current CloudflareRead
Credential Manager entry. If the vault reports `VAULT_EXPIRED`, re-enroll it
through the existing hidden-input `acceptance-credentials.ps1` flow with its
actual UTC expiration. The read credential is not a B2 write credential.

A B2 write profile, when natural supported drift exists, is a repo-external JSON
file with exact `phase6b2.v1` schema:

```json
{
  "schemaVersion": "phase6b2.v1",
  "policies": {
    "human": {
      "name": "<exact reviewed human policy name>",
      "selector": { "kind": "email", "value": "<operator email>" },
      "sessionDuration": "24h"
    },
    "admin": {
      "name": "<exact reviewed admin policy name>",
      "selector": { "kind": "email", "value": "<admin email>" },
      "sessionDuration": "30m"
    },
    "machine": {
      "name": "<exact reviewed machine policy name>",
      "selector": { "kind": "service_token", "value": "<exact service token ID>" },
      "sessionDuration": "24h"
    }
  }
}
```

Human/admin may use an exact `group` ID selector instead of email. These are
examples of structure, not identities to adopt. Compare every value with the
current independent Access apps/policies before use. Do not put the profile in
Git, runtime config, command arguments as JSON, or evidence. The CLI calculates
and validates its fingerprint. B2 writes require a short-lived exact-account
write token with only Access Apps and Policies Write and Cloudflare One Connector:
cloudflared Write. A separate transient Account API Tokens Read credential
allows the tool to inspect and reject overbroad/unknown write-token scopes.
Both are hidden inputs, inherited only by the bounded child process, and cleared.
B1 DNS writes use their separate exact-zone token.

## Automated run

From an interactive PowerShell terminal in the permanent checkout, on the clean
`codex/phase-6-b2` review branch:

```powershell
.\scripts\windows\phase6b2-acceptance.ps1 `
  -DesiredStatePath '<repo-external desired-state JSON>' `
  -ConfigPath '<repo-external Bridge config JSON>' `
  -TunnelIngressConfigPath '<repo-external Tunnel ingress config JSON>'
```

The script first runs full repository quality gates and Phase 6-A live read-only
discovery/plan. With an in-sync plan, it
proves the B2 CLI refuses apply with zero writes and without a write credential.
It then reruns Phase 6-A with the Phase 5-C real service-token matrix,
Phase 4.5 headed ordinary/admin browser (complete each Access login and MFA in
the opened browser, then press Enter in that same terminal),
local Phase 5-A/B/C, and loopback checks. The secret-free result is written to
`D:\code\research\fqgate-phase6b2-acceptance-evidence.json`.

If the live plan contains a naturally missing or safely correctable item, review
its exact check ID and corresponding repo-external policy profile first. Rerun
with `-ApplyCheckId '<exact plan check ID>'` and, for Tunnel/Access, also
`-B2WriteProfilePath '<repo-external exact profile JSON>'`. The script accepts
one action per invocation, prompts for bounded credentials, then rediscovers
and proves the postcondition. Rerun without `-ApplyCheckId` once the plan is
fully in sync. Do not select a conflict, ambiguous, or manual-required item.

When an API call may have partially succeeded and exact postcondition cannot be
proved, stop writes. Inspect only the resource ID/check ID in the error against
the exact desired Bridge origin, hostname/AUD, or policy selector/MFA field as
applicable. Use Cloudflare Zero Trust > Networks > Tunnels > the identified
Tunnel > Public Hostnames for ingress; Zero Trust > Access > Applications >
identified application/policy for Access. Do not change any other host, app,
policy, token or Tunnel service. Rerun the same command above without the
apply flags for read-only rediscovery; a further mutation needs a new review
of the fresh fingerprint and check.

Physical QR approval is permitted only after the automated FQGate regression
returns exact `LOGIN_REQUIRED`. Use the existing local
`http://127.0.0.1:17282/login` flow, then rerun the same acceptance command.
Access login/MFA follows the existing headed browser harness. Record exact
human-only limitations; never mark the phase closed while a required check,
permanent-Windows run, or exact-final-commit Ubuntu/Windows CI is unresolved.

If all live plan, remote and headed browser checks passed but a later local
regression failed transiently, retain the failed evidence and run
`phase6b2-resume-local.ps1` with the same three path arguments. The resume
script accepts only a clean descendant review commit with no runtime changes,
the same in-sync plan fingerprint and the recorded ordinary/admin browser PASS.
It reruns Phase 6-A 14/14 and all local Phase 5/loopback checks. Its separate
secret-free evidence names the prior failure explicitly; it never converts a
failed production mutation or browser step into a pass.
