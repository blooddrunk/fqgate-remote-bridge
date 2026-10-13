# FQGate v2 operator risk acceptance — R3

On 2026-10-13 the user explicitly directed proceeding with v2 upgrade despite
missing publisher signing evidence. This supersedes the signature prerequisite
for this one manually controlled upgrade attempt only. It does not turn absent
cryptographic evidence into PASS or authenticate the publication sequences.

Target is the fixed official 2.0.5 Windows x64 ZIP, 29236811 bytes, SHA256
c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba.
Re-observe the official source before preparation; changed target/bytes/hash
requires a new review. Record `signatureVerified=false`,
`publisherTrust=UNVERIFIED_OPERATOR_RISK_ACCEPTED`, and a separate bounded
operator authorization receipt. R1/R2 signed qualification and automatic
installation outputs remain false. Do not supply a fake ReleaseAuthority to the
R2 authenticated kernel or bootstrap its security ledger from observed counters.

Authorized work: non-executing full-directory staging, isolated Windows runtime
preparation/qualification, directory backup/rollback engineering, and a manual
personal-environment replacement with verified artifact/version/ownership,
loopback/startup and a temporary fallback. The user permits direct replacement
before final login and Bridge qualification; keep runtime qualification false
until the remaining checks actually pass. Existing known v1 availability restoration
remains authorized. No cloudflared/Cloudflare write, credential/permission change,
unknown-process termination, production fault injection, Supervisor actuator,
automatic update or supportedRange/validatedVersions expansion is implied.
The permanent checkout and operator configuration remain protected.

The user subsequently clarified that this is a personal experimental project,
with no production users. A separate VM/Sandbox is optional, not a prerequisite
imposed on that basis. A one-time local host trial of the exact staged package
is authorized by the upgrade request and risk acceptance. Preserve existing v1,
configuration and relevant profile data; record that the test shares a host/user
and is not OS isolation. Use owned PID/path/creation-time proof for bounded
candidate termination; never kill unrelated/unknown processes. No OS feature,
reboot or permissions change is needed for the local trial.

The original PR #15 / Issue #16 full signing-qualified merge contract remains
unfulfilled. Record the exception alongside BLOCKED cryptographic gates, keep PR
OPEN, and do not rewrite historic R1/R2 evidence. Runtime/layout/compatibility
failure must stop activation and preserve v1, exact packages and bounded receipts.

The user additionally permits direct replacement and removal of 1.0.5/old
configuration after 2.0.5 validation; permanent retention is not required. Keep
only a temporary verified fallback during the attempt, and do not delete it
until actual candidate acceptance completes. Reuse D:\code\research; cleanup
may target proven obsolete task artifacts, never unrelated state or credentials.

After the user completes physical QR login, bounded diagnostics may read exactly
GET /v2/system/health and GET /v2/instruments/search?query=600000 in addition to
existing legacy health/search and GET /openapi.json. These canonical read-only
routes are explicitly selected from the actual 2.0.5 census to diagnose the same
existing health/instrument capability; this does not register new Bridge routes,
permissions, trading calls or automatic runtime discovery authorization. Enforce
loopback, bounded bytes/time/results and no raw payload/account/session persistence.

The actual v2 search parameter describes source-instance selection. Diagnostics
may additionally GET /v2/source-instances, and GET the account/authentication/
capabilities metadata of inventory-returned IDs only, with identifiers kept in
memory or hashed and account/login payloads discarded. Do not create instances,
perform account actions or auth mutations, or grant multi-profile Bridge access.
If selection is ambiguous, report it rather than selecting an arbitrary profile.
