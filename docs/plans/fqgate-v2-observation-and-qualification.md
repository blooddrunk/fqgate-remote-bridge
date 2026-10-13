# FQGate v2 observation boundary

The v1 adapter and lifecycle remain unchanged. v2 inspection lives in independent
release modules and explicit local CLI commands, before configuration loading or
application construction. It has no lifecycle/process/qualification port.

The inspector follows only bounded fixed-base GETs: freshness, sequence-specific
stable, version-specific release, and fixed GitHub release API identity. Metadata
redirects are errors. Hash links compare exact downloaded envelope bytes. Signed
payloads decode strict unpadded base64url and bounded UTF-8 JSON; the observed
encoding is not a proven canonicalization/signature specification. Signed claims
remain unauthenticated even when all hash links agree. Sequence consistency is
checked within a snapshot; this is not persistent authenticated rollback prevention.

Archive audit compares GitHub asset name/size/digest with release claims, permits
at most one redirect to GitHub's fixed release-assets host, downloads into a fresh
OS temporary directory, and removes it on success/failure. No caller-selected
installation path, extraction, executable invocation or evidence persistence.
Lazy ZIP inspection rejects unsafe Windows paths, aliases, duplicate and conflicting
entries, links/special files, encrypted/unsupported entries and bounded size/count
violations. Entry streams are consumed with limits; required PE files receive a
non-executing header check. This does not prove updater semantics or authenticity.

Installation always remains blocked: no production v2 transaction exists.
A future implementation must first establish publisher trust roots and replay
policy, then a directory transaction with crash recovery, managed process identity,
health/OpenAPI/semantic gates and verified rollback. These are outstanding gates,
not implemented features. supportedRange/validatedVersions remain unchanged.

R1 separates the native read-only collectors from pure observation gates in
`scripts/windows/fqgate-v2-observation-gates.ps1`. CI invokes the same orchestration
with fixture providers and inert temporary files. The production entrypoint has
no fixture switch or caller-supplied process/operation provider. Existing schema
validation runs in a read-only Node helper and returns only the installation root
internally. Reports whitelist bounded metadata fields; unknown CLI fields and raw
errors are discarded. Missing/invalid config prevents filesystem/listener inspection
and still yields blocked evidence. All fixed files are rehashed after CLI errors.
