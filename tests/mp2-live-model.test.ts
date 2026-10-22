import { afterEach, describe, expect, it, vi } from "vitest";
import { modelOneApprovedAttempt, type FixtureBinding } from "./helpers/mp2-live-model.js";
import { QR_FLOW_TTL_MS } from "../src/bridge/qr/adapter.js";

function fixture() {
  let time = 0;
  const expected: FixtureBinding = {
    alias: "A",
    source: "inert",
    build: "fixture-sha",
    processCreation: "fixture-creation",
    account: "synthetic-account",
    epoch: "synthetic-epoch",
    state: "connected",
  };
  const observe = vi.fn(async () => ({ ...expected }));
  const begin = vi.fn(async () => {});
  const poll = vi.fn(async (): Promise<"waiting" | "connected"> => "connected");
  const options = {
    expected,
    observe,
    begin,
    poll,
    now: () => time,
    wait: vi.fn(async () => {
      time += 2000;
    }),
    mode: "FixtureLive" as const,
    fixtureQrApproval: true,
    fixtureReadiness: true,
  };
  return { options, expected, begin, poll, observe };
}
afterEach(() => vi.useRealTimers());
describe("MP2-D executable fixture-only one-attempt specification", () => {
  it.each(["default", "approval", "readiness"])("%s sends zero auth commands", async (kind) => {
    const f = fixture();
    const r = await modelOneApprovedAttempt({
      ...f.options,
      ...(kind === "default"
        ? { mode: "Preflight" as const }
        : kind === "approval"
          ? { fixtureQrApproval: false }
          : { fixtureReadiness: false }),
    });
    expect(r.counts).toEqual({ begin: 0, poll: 0 });
    expect(f.observe).not.toHaveBeenCalled();
  });
  it("one explicitly approved synthetic begin followed by bounded polling", async () => {
    const f = fixture();
    f.poll.mockResolvedValueOnce("waiting");
    const r = await modelOneApprovedAttempt(f.options);
    expect(r).toEqual({
      evidence: "FIXTURE_ONLY",
      reason: "COMPLETED",
      counts: { begin: 1, poll: 2 },
    });
    expect(JSON.stringify(r)).not.toMatch(/synthetic|inert|fixture-sha/);
  });
  it.each(["alias", "source", "build", "processCreation", "account", "epoch", "state"] as const)(
    "%s drift before begin stops with zero effects",
    async (key) => {
      const f = fixture();
      f.observe.mockResolvedValue({
        ...f.expected,
        [key]: key === "state" ? "disconnected" : "changed",
      });
      const r = await modelOneApprovedAttempt(f.options);
      expect(r.counts).toEqual({ begin: 0, poll: 0 });
      expect(r.reason).toBe("STOP_NO_RETRY_OR_RECOVERY");
    },
  );
  it("post-begin drift cannot undo auth, suppresses completion without retry", async () => {
    const f = fixture();
    f.begin.mockImplementation(async () => {
      f.observe.mockResolvedValue({ ...f.expected, account: "B" });
    });
    const r = await modelOneApprovedAttempt(f.options);
    expect(r.counts).toEqual({ begin: 1, poll: 0 });
    expect(r.reason).toBe("STOP_NO_RETRY_OR_RECOVERY");
  });
  it("no response cannot exceed existing QR TTL or trigger second begin", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.begin.mockImplementation(() => new Promise(() => {}));
    const pending = modelOneApprovedAttempt(f.options);
    await vi.advanceTimersByTimeAsync(QR_FLOW_TTL_MS);
    const r = await pending;
    expect(r.counts).toEqual({ begin: 1, poll: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("pending until TTL stops polling with one begin", async () => {
    const f = fixture();
    f.poll.mockResolvedValue("waiting");
    const r = await modelOneApprovedAttempt(f.options);
    expect(r.reason).toBe("STOP_NO_RETRY_OR_RECOVERY");
    expect(r.counts.begin).toBe(1);
    expect(r.counts.poll).toBeLessThanOrEqual(60);
  });
  it("cancellation while begin is in flight cannot retry or poll", async () => {
    const f = fixture(),
      controller = new AbortController();
    f.begin.mockImplementation(async () => {
      controller.abort();
    });
    const r = await modelOneApprovedAttempt({ ...f.options, signal: controller.signal });
    expect(r.counts).toEqual({ begin: 1, poll: 0 });
  });
});
