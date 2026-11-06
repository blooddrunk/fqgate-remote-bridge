# Draft upstream inquiry — native account and isolation contracts

**DRAFT ONLY — NOT SENT.** MP-6 / Issue #28, 2026-11-06 Asia/Taipei.
No upstream issue, email or other message has been sent. This draft contains no
private Source IDs, account displays, their hashes, QR data or local credentials.

Subject: Versioned FQGate Windows account identity, login generation and isolation contracts

We maintain a loopback-only, explicitly allowlisted read-only adapter. Our
reviewed 2.0.5 client/OpenAPI evidence exposes Source ID/number, worker PID and
restart count, account display/state, observation time, Saved Login availability
and nullable L2 status. These do not establish native account identity or an
authentication generation. Our host has since acquired 2.0.6 through separate
operator work; please distinguish semantics supported by each exact release.
We have not qualified concurrent distinct accounts or process-per-account use.

Could you provide versioned native-server documentation, field definitions and
supported examples for these specific questions?

1. **Strong account identity:** Is there a non-display, stable account identifier
   scoped to provider/account that is returned by an authenticated snapshot?
   Define uniqueness across Sources, masking, guest/disconnected states,
   restarts and account replacement. Is same-account duplication on two Sources
   detectable without comparing display strings? If absent, please state that.
2. **Monotonic login epoch:** Is there a server-owned generation that changes on
   every authentication, logout, reconnect, Saved Login restore, replacement
   and disconnect? Define ordering, persistence, reset/overflow, atomic pairing
   with account identity and query results, and how a client detects A→B→A
   entirely between GET samples. Observation time/PID/restart count cannot
   substitute for this property.
3. **Source persistence:** What guarantees govern ID/number allocation,
   deletion/recreation, renumbering, worker recovery and parent restart? Can
   removed IDs/numbers be reused? How can clients fence late requests/results
   against the prior incarnation, including queued provider operations?
4. **Saved Login:** What is the credential namespace: account, Source, provider,
   Windows user, application directory or another key? What exact target does
   restore use, and can restore/clear/logout/delete on B affect A? Describe
   disk persistence, concurrent access, cancellation and supported backup/restore
   limits without requesting any user's credential material.
5. **L2 and displacement:** Which same-account/different-account concurrent
   combinations are supported? What invalidates a peer's session or L2 access,
   and when are displacement notices observable? Does an L2 flag attest usable
   data, or entitlement only? Are subscription/data queues and SDK caches
   isolated by Source/account, and can results from an old login be returned
   after replacement? Please distinguish L1, L2 and authentication scopes.
6. **Complete mutable root:** Is there a supported setting covering every
   credential/Saved Login database, SDK cache, WebView2 profile/cache, temporary
   file, plugin, updater, named mutex and IPC endpoint? Enumerate machine/user/
   process/global components. Is relocation of an existing profile supported,
   with which shutdown/lock/backup steps and rollback limitations? We will not
   guess environment variables or copy live browser storage to test this.
7. **Independent port:** Is a second native process supported with an explicit
   IPv4-loopback-only port and complete independent storage/IPC scope? Provide
   supported syntax, precedence, validation, port-conflict/singleton behavior
   and version/platform restrictions. A configurable adapter base URL does not
   configure the native bind address. If unsupported, please say so separately
   from native multi-Source support.

Please identify which answers are guaranteed native behavior and which are
observational/UI behavior. A minimal supported test protocol and known
limitations would help us design a later separately approved one-attempt
experiment. We are not asking for new financial mutation endpoints, credentials,
automatic login, remote exposure or an undocumented workaround.
