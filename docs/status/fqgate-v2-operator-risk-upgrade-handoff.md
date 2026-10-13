# FQGate v2 R3 manual upgrade — 2026-10-13

The user explicitly accepts missing publisher-signature evidence for this exact
2.0.5 upgrade attempt, clarified this is a personal experimental project with no
production users, and permits removal of v1/old configuration after validation.
Contract: `docs/tasks/fqgate-v2-operator-risk-upgrade.md`. The independent publisher
request is [fqgate/FQGate-releases#19](https://github.com/fqgate/FQGate-releases/issues/19).
Neither this exception nor manual installation grants a cryptographic PASS,
general update bypass, compatibility-range expansion or original PR merge closure.

## Actual installation and held runtime

The official 29236811-byte ZIP matched SHA256
c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba.
All nine complete payload files were audited/materialized and individually hashed.
Actual `FQGate.exe --version` returned `FQGate 2.0.5`, exit 0. An initial probe
failed because the diagnostic decoded a Uint8Array incorrectly; it stopped its
owned candidate and restored v1. A subsequent payload preflight detected the
new WebView2 directory. The agent corrected UTF-8 decoding and moved mutable
WebView2 data outside the payload using the documented environment override.
Those probe failures remain separate evidence, not publisher crash claims.

After the user requested uninterrupted login, the manual installer copied the
exact payload to a same-volume candidate, acquired the existing install lock,
flushed journal checkpoints, stopped only the verified v1 owner, retained its full
current directory as temporary previous, then renamed the complete candidate to
current. It used the existing managed-process controller to start 2.0.5, verified
path/PID/IPv4 loopback and parsed bounded health. State records actual 2.0.5
artifact identity **without qualification evidence**. No authenticated replay
ledger was initialized/reset and no fake ReleaseAuthority was supplied.

At 2026-10-13T06:52:48Z, PID 30424 started from the managed current path and kept
127.0.0.1:17281; Bridge PID 57956 remained on 127.0.0.1:17282. Native command
exit 0; current EXE is 53590016 bytes, SHA256
d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847.
Install lock/transaction cleared only after this invocation committed. WebView2
profile is under configured installDirectory, not the application payload. App
is left running; checks no longer automatically stop it or switch to 1.0.5.

## Real login / lookup and compatibility findings

The user physically completed QR login. At 2026-10-13T07:06:19Z the actual
GET /v2/system/version returned 2.0.5. Two source instances existed, with exactly
one connected. The inventory and that instance's account snapshot both confirmed
connected / saved-login available; no account name, ID, QR or session was saved.
Selected GET /v2/instruments/search?query=600000 returned HTTP 200/code 0,
one row/one exact match and bounded field checks PASS. Source IDs were hashed
in receipts and never supplied by a remote caller. Level2 access was false;
this proves no entitlement, not a complete L2 degradation/queue qualification.

Actual OpenAPI (695475 bytes, SHA256
908e7d808649c7321cbde0fea4329f94d5cdec41bdc1293c248702c18f9a1c73)
describes v2 canonical paths rather than the v1 paths required by the current
Bridge. With two sources, omission of selection yields source_instance_required;
legacy v1 aliases still observe a different disconnected source even when the
canonical instance header is supplied. Legacy search returned 409/code 3001.
Do not call the user's QR login a failure based on that unrelated legacy state.

The Bridge's >=1.0.0 <2.0.0 range and existing v1 OpenAPI/lookup/QR adapters remain
unchanged. Therefore manual App upgrade is complete, while **Bridge v2
integration remains BLOCKED**, and existing local/remote market acceptance cannot
be called preserved. Do not falsely add v2 to validatedVersions or reuse v1
qualification evidence. A separately designed exact-artifact/source-bound v2
adapter and explicit compatibility-policy decision are necessary before Bridge
market/QR maintenance can use this runtime. No new remote operation, arbitrary
instance selector or multi-profile interface was added here.

## Evidence / remaining gates

Git-external R3 receipts, native commands, exit codes, staged inventory, temporary
backup locations and current process/file hashes live under
`D:\code\research\fqgate-v2-r3-evidence`. The source/CI SHA, all tests and final
job URLs are recorded in its delivery receipt. Historical R1/R2 receipts are not
rewritten. Old v1 is temporary fallback pending full Bridge validation, not a
permanent-retention requirement. Only known obsolete trial artifacts may be
removed; no unrelated operator state, credentials, OS policy or services changed.

Signed trust/authenticated replay, full native power-loss/crash rollback,
queue/L2 qualification, v2 Bridge adapter and real remote matrix remain separate
BLOCKED/NOT_EXECUTED gates. App startup/login/search PASS does not waive them.
PR #15 / Issue #16 remain OPEN under the original full-qualified merge contract.
