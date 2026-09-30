# Phase 7 — supervisor, recovery, audit trail and notifications

Status: **ACTIVE**. Phase 7-A is closed. Phase 7-B1 is separately authorized; Phase 7-B2/7-C are not authorized yet.

## Goal

Make the existing always-on Windows deployment observable and eventually recoverable without
turning background monitoring into an implicit administration channel.

Phase 7 follows the closed Phase 6 deployment and preserves every existing local/remote security
boundary. It is intentionally split so that observation is proven before any automatic recovery,
and recovery is proven before any outbound notification provider is allowed to run continuously.

## Phase 7-A — read-only supervisor observation and event journal

Status: **AUTHORIZED / OPEN** under
`docs/tasks/phase-7-a-supervisor-observation-and-event-journal.md`.

Deliver a deterministic supervisor state model, one-shot inspection, a bounded read-only watch
loop, and a redacted local event journal. The first slice may observe only existing local runtime
surfaces and Windows service state. It must not restart anything, perform updates, mutate
Cloudflare, trigger QR/login, or send network notifications.

The first state model should cover the operational signals that are already authoritative:

```text
bridge:   ready | unavailable
fqgate:   ready | unhealthy | stopped | incompatible | unknown
session:  connected | guest | login_required | unknown
tunnel:   running | stopped | missing | unknown
```

Later Phase 7 slices may extend the model only through separately reviewed tasks.

## Phase 7-B — bounded recovery

Status: **PLANNED / NOT AUTHORIZED**.

After 7-A proves stable observation and journaling, define an explicit recovery policy with
cooldowns, attempt ceilings, stable-state requirements, and per-action allowlists. Recovery must be
limited to already-supported local lifecycle/service operations. It must never perform Cloudflare
provisioning, update apply, QR/login automation, trading/financial mutation, or generic
process/service control.

The Windows launch/startup model for a long-running supervisor is also deferred to the reviewed
7-B task; Phase 7-A does not install a service or Scheduled Task.

## Phase 7-C — notifications and Phase 7 closure

Status: **PLANNED / NOT AUTHORIZED**.

Only after recovery semantics are proven may Phase 7 add a fixed-schema redacted notification
provider, initially a generic JSON webhook if the task can bound destination, payload, retry,
deduplication and secret handling safely. Notification delivery must not become a generic HTTP
client or data-exfiltration path.

Phase 7 closes only after permanent-Windows observation/recovery/notification acceptance and
exact-commit Ubuntu/Windows CI are complete.

## Shared invariants

Every Phase 7 slice must preserve:

- FQGate listener exactly on `127.0.0.1:17281`;
- Bridge listener exactly on `127.0.0.1:17282`;
- cloudflared origin only to the Bridge;
- no new remote-human/admin/machine operation unless separately reviewed;
- no generic/raw FQGate proxy;
- no Cloudflare background reconciliation or provisioning;
- no automatic FQGate update activation in Phase 7;
- no trading, brokerage/account control, order, cancellation or fund mutation;
- secrets, JWTs, cookies, QR/session payloads, Tunnel tokens, raw market payloads and raw Cloudflare
  responses never enter journal/evidence/notifications;
- machine-verifiable checks are automated first; any unavoidable human boundary must have exact
  reason, steps, expected result, forbidden changes and resume command.

## Phase boundary principle

Observation does not imply permission to recover. Recovery does not imply permission to notify
arbitrary endpoints. Notifications do not imply a new remote control surface.

Each capability requires its own reviewed task and exact acceptance evidence.
