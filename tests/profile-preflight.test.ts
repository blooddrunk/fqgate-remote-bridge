import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectProfilePreflight,
  parseProfilePreflightConfig,
  type ProfileNativeFacts,
} from "../src/fqgate/diagnostics/profile-preflight.js";
import type { HttpRequestOptions } from "../src/fqgate/release/http.js";
import * as contract from "../src/fqgate/market/contract.js";
import { V2_LOOKUP_FINGERPRINT } from "../src/fqgate/market/v2.js";
import { V2_QR_FINGERPRINT } from "../src/fqgate/diagnostics/qr-contract.js";
import { listBridgeOperations } from "../src/bridge/policy/registry.js";

const sha = "a".repeat(40);
const config = () => ({
  schemaVersion: 1,
  expectedBridgeCommit: sha,
  profiles: [
    {
      alias: `p_${"a".repeat(32)}`,
      sourceId: "fixture-source-A",
      instanceNumber: 1,
      expectedState: "connected",
    },
    {
      alias: `p_${"b".repeat(32)}`,
      sourceId: "fixture-source-B",
      instanceNumber: 2,
      expectedState: "disconnected",
    },
  ],
});
const processFact = (pid: number, parentPid = 10) => ({
  pid,
  parentPid,
  path: "C:\\inert\\FQGate.exe",
  created: "2026-10-22T00:00:00.0000000Z",
});
const sources = () =>
  [1, 2].map((n) => ({
    instanceId: `fixture-source-${n === 1 ? "A" : "B"}`,
    instanceNo: n,
    providerId: "tonghuashun",
    pid: 20 + n,
    restartCount: 0,
    workerState: "ready",
    autoLogin: false,
    defaultGuest: false,
    session: { state: n === 1 ? "connected" : "disconnected" },
  }));
function fixture() {
  const f = {
    config: config(),
    sources: sources(),
    display: "SECRET_MASKED_ACCOUNT",
    runningSha: sha,
    mutate: (_sample: number) => {},
    onNative: (_sample: number) => {},
    native: {
      listeners: [
        { port: 17281, address: "127.0.0.1", pid: 10 },
        { port: 17282, address: "127.0.0.1", pid: 11 },
      ],
      processes: [
        processFact(10, 1),
        { ...processFact(11, 1), path: "C:\\node.exe" },
        processFact(21),
        processFact(22),
      ],
      payloadVerified: true,
      recordVerified: true,
    } satisfies ProfileNativeFacts,
    accountExtra: {} as Record<string, unknown>,
    broken: "",
    blockedPath: "",
    nativeCalls: 0,
    inventoryCalls: 0,
    barrier: (_path: string): Promise<void> => Promise.resolve(),
  };
  vi.spyOn(contract, "operationContractFingerprint").mockImplementation((_doc, contracts) =>
    contracts.length === 6 ? V2_QR_FINGERPRINT : V2_LOOKUP_FINGERPRINT,
  );
  const calls: { url: string; method: string }[] = [];
  const http = {
    request: vi.fn(async (url: string, options: HttpRequestOptions) => {
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
      expect(options.redirect).toBe("error");
      expect(options.timeoutMs).toBeLessThanOrEqual(5000);
      calls.push({ url, method: options.method! });
      const path = new URL(url).pathname;
      await f.barrier(path);
      if (path === f.blockedPath) throw Error("SECRET_ERROR");
      let value: unknown = {};
      let status = 200;
      if (path === "/api/v1/version")
        value = { name: "fqgate-remote-bridge", commit: f.runningSha };
      else if (path.startsWith("/api/v1/")) {
        value = { error: { code: "METHOD_NOT_ALLOWED" } };
        status = 405;
      } else if (path === "/v2/system/version")
        value = {
          product: "FQGate",
          version: "2.0.5",
          api_version: "2.0",
          platform: "windows",
          architecture: "x86_64",
        };
      else if (path === "/v2/system/health") value = { status: "ready" };
      else if (path === "/v2/source-instances") {
        f.mutate(++f.inventoryCalls);
        value = { instances: f.sources };
      } else if (path.endsWith("/authentication")) value = { modes: ["app_qr"] };
      else if (path.endsWith("/account")) {
        const s = f.sources.find((s) => path.includes(s.instanceId))!;
        value = {
          descriptor: { session_supported: true },
          snapshot: {
            state: s.session.state,
            account_display: f.display,
            session_kind: "user",
            level2_access: false,
            saved_login: { available: true },
            observed_at: "2026-10-22T00:00:00Z",
            ...f.accountExtra,
          },
        };
      }
      return {
        status,
        headers: {},
        body: new TextEncoder().encode(
          path === f.broken ? "SECRET_MALFORMED_JSON" : JSON.stringify(value),
        ),
      };
    }),
  };
  const native = vi.fn(async () => {
    f.onNative(++f.nativeCalls);
    return structuredClone(f.native);
  });
  const run = (signal?: AbortSignal, timeoutMs?: number) =>
    inspectProfilePreflight({
      config: f.config,
      checkoutCommit: sha,
      http,
      native,
      ...(signal ? { signal } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    });
  return { f, calls, http, native, run };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const gate = (r: Awaited<ReturnType<typeof inspectProfilePreflight>>, id: string) =>
  r.gates.find((g) => g.id === id);
function assertSafe(r: Awaited<ReturnType<typeof inspectProfilePreflight>>) {
  expect(r.readyForNativeIntegration).toBe(false);
  expect(r.qualification).toBe("LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED");
  expect(r.counters).toMatchObject({ post: 0, accountWrites: 0, qrBegin: 0, qrPoll: 0 });
  expect(JSON.stringify(r)).not.toMatch(/SECRET|fixture-source|p_aaaa|FQGate.exe/);
}
describe("MP2 alias-aware GET-only diagnostic", () => {
  it("MP2-01: observes A/B mappings and native creations but never promotes display/epoch to proof", async () => {
    const t = fixture(),
      r = await t.run();
    expect(gate(r, "ALIAS_SOURCE_CONTINUITY")?.status).toBe("OBSERVED");
    expect(gate(r, "ACCOUNT_IDENTITY")?.status).toBe("UNPROVEN");
    expect(gate(r, "SESSION_EPOCH")?.status).toBe("UNPROVEN");
    expect(gate(r, "MP1_NATIVE_REQUIREMENTS")?.status).toBe("BLOCKED");
    expect(r.profiles).toHaveLength(2);
    expect(t.native).toHaveBeenCalledTimes(3);
    expect(t.calls.length).toBe(21);
    assertSafe(r);
  });
  it.each(["duplicateAlias", "duplicateSource", "duplicateNumber", "missing", "extra", "url"])(
    "MP2-02 configuration %s is rejected before I/O",
    async (kind) => {
      const t = fixture(),
        [a, b] = t.f.config.profiles;
      if (kind === "duplicateAlias") b!.alias = a!.alias;
      if (kind === "duplicateSource") b!.sourceId = a!.sourceId;
      if (kind === "duplicateNumber") b!.instanceNumber = a!.instanceNumber;
      if (kind === "missing") t.f.config.profiles = [];
      if (kind === "extra") Object.assign(t.f.config, { url: "http://attacker" });
      if (kind === "url") a!.sourceId = "../account";
      const r = await t.run();
      expect(gate(r, "CONFIG")?.status).toBe("BLOCKED");
      expect(t.calls).toHaveLength(0);
      expect(t.native).not.toHaveBeenCalled();
      assertSafe(r);
    },
  );
  it.each(["wrongSource", "wrongNumber", "wrongState", "extraSource", "duplicateInventory"])(
    "MP2-03 mapping drift %s cannot silently reselect",
    async (kind) => {
      const t = fixture();
      if (kind === "wrongSource") t.f.config.profiles[0]!.sourceId = "absent";
      if (kind === "wrongNumber") t.f.config.profiles[0]!.instanceNumber = 3;
      if (kind === "wrongState") t.f.config.profiles[0]!.expectedState = "disconnected";
      if (kind === "extraSource" || kind === "duplicateInventory")
        t.f.sources.push({
          ...t.f.sources[0]!,
          ...(kind === "extraSource" ? { instanceId: "unmapped", instanceNo: 3 } : {}),
        });
      const r = await t.run();
      expect(gate(r, "ALIAS_SOURCE_CONTINUITY")?.status).toBe("BLOCKED");
      expect(r.profiles).toEqual([]);
      assertSafe(r);
    },
  );
  it.each([
    "worker",
    "pidReuse",
    "parent",
    "restart",
    "removed",
    "recreated",
    "renumbered",
    "account",
    "epoch",
    "l2",
    "savedLogin",
  ])("MP2-04 two-sample drift %s discards all summaries", async (kind) => {
    const t = fixture();
    t.f.mutate = (n) => {
      if (n !== 2) return;
      if (kind === "worker") t.f.sources[0]!.pid = 22;
      if (kind === "pidReuse") t.f.native.processes[2]!.created = "2026-10-22T01:00:00Z";
      if (kind === "parent") t.f.native.processes[2]!.parentPid = 999;
      if (kind === "restart") t.f.sources[0]!.restartCount++;
      if (kind === "removed") t.f.sources.shift();
      if (kind === "recreated") t.f.sources[0]!.instanceId = "new-source";
      if (kind === "renumbered") t.f.sources[0]!.instanceNo = 3;
      if (kind === "account") t.f.display = "OTHER_SECRET";
      if (kind === "epoch") t.f.accountExtra = { session_epoch: "injected_not_authority" };
      if (kind === "l2") t.f.accountExtra = { level2_access: true };
      if (kind === "savedLogin") t.f.accountExtra = { saved_login: { available: false } };
    };
    const r = await t.run();
    expect(gate(r, "ALIAS_SOURCE_CONTINUITY")?.status).toBe("BLOCKED");
    expect(r.profiles).toEqual([]);
    assertSafe(r);
  });
  it("MP2-05 A-B-A between samples and same display on A/B remain unproven", async () => {
    const t = fixture();
    let hidden = "A";
    t.f.mutate = (n) => {
      if (n === 2) {
        hidden = "B";
        hidden = "A";
      }
    };
    const r = await t.run();
    expect(hidden).toBe("A");
    expect(gate(r, "SESSION_EPOCH")?.reason).toContain("A_B_A");
    expect(r.profiles.every((p) => p.strongAccountIdentity === false)).toBe(true);
    assertSafe(r);
  });
  it("MP2-06 unknown identity and injected strong token cannot satisfy MP-1 ports", async () => {
    const t = fixture();
    t.f.accountExtra = { account_id: "fixture-token" };
    const r = await t.run();
    expect(gate(r, "ALIAS_SOURCE_CONTINUITY")?.status).toBe("BLOCKED");
    assertSafe(r);
  });
  it("MP2-07 A/B account GETs may finish in reverse order without exchanging summaries", async () => {
    const t = fixture();
    let release!: () => void;
    const waiting = new Promise<void>((r) => (release = r));
    const completions: string[] = [];
    t.f.barrier = async (path) => {
      if (path.endsWith("/account")) {
        if (path.includes("-A/")) await waiting;
        else release();
        completions.push(path.includes("-A/") ? "A" : "B");
      }
    };
    const r = await t.run();
    expect(completions.slice(0, 2)).toEqual(["B", "A"]);
    expect(r.profiles.map((p) => [p.profile, p.state])).toEqual([
      [1, "connected"],
      [2, "disconnected"],
    ]);
    assertSafe(r);
  });
  it.each(["malformed", "noResponse", "cancel", "timeout"])(
    "MP2-08 %s terminates boundedly with zero writes and no late publication",
    async (kind) => {
      vi.useFakeTimers();
      const t = fixture();
      const controller = new AbortController();
      if (kind === "malformed") t.f.broken = "/v2/source-instances";
      if (kind === "noResponse") t.f.blockedPath = "/v2/source-instances";
      if (kind === "cancel" || kind === "timeout") t.f.barrier = () => new Promise(() => {});
      const pending = t.run(controller.signal, 100);
      await vi.advanceTimersByTimeAsync(1);
      if (kind === "cancel") controller.abort();
      await vi.advanceTimersByTimeAsync(100);
      const r = await pending;
      expect(r.exitCode).toBe(1);
      expect(r.profiles).toEqual([]);
      assertSafe(r);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([17281, 17282])("MP2-09 port %i absent is BLOCKED without recovery", async (port) => {
    const t = fixture();
    Object.assign(t.f.native, { listeners: t.f.native.listeners.filter((l) => l.port !== port) });
    const r = await t.run();
    expect(gate(r, `LISTENER_${port}`)?.reason).toBe("LISTENER_ABSENT");
    assertSafe(r);
  });
  it.each(["0.0.0.0", "::", "::1"])("MP2-10 rejects %s listener", async (address) => {
    const t = fixture();
    Object.assign(t.f.native.listeners[0]!, { address });
    const r = await t.run();
    expect(gate(r, "LISTENER_17281")?.status).toBe("BLOCKED");
    assertSafe(r);
  });
  it("MP2-11 actual running commit differs from checkout/approved build", async () => {
    const t = fixture();
    t.f.runningSha = "b".repeat(40);
    const r = await t.run();
    expect(gate(r, "BRIDGE_BUILD")?.reason).toBe("RUNNING_BUILD_MISMATCH");
    expect(gate(r, "CHECKOUT_RUNTIME")?.status).toBe("BLOCKED");
    assertSafe(r);
  });
  it("MP2-12 fixed install or process record failure stays blocked", async () => {
    const t = fixture();
    Object.assign(t.f.native, { payloadVerified: false, recordVerified: false });
    const r = await t.run();
    expect(gate(r, "PAYLOAD_PROCESS_RECORD")?.status).toBe("BLOCKED");
    assertSafe(r);
  });
  it("MP2-13 parse freezes private configuration and forbids silent defaults", () => {
    const input = config(),
      parsed = parseProfilePreflightConfig(input);
    input.profiles[0]!.sourceId = "replaced";
    expect(parsed.profiles[0]!.sourceId).toBe("fixture-source-A");
    expect(Object.isFrozen(parsed.profiles[0])).toBe(true);
  });
  it("MP2-14 all four contexts retain the complete existing operation matrix", () => {
    const operations = listBridgeOperations();
    const safe = [
      "bridge.version",
      "bridge.capabilities",
      "bridge.status",
      "session.qr.begin",
      "session.qr.poll",
      "updates.status",
      "openapi.catalog",
    ];
    const admin = ["updates.check", "updates.plan", "updates.apply", "openapi.refresh"];
    const machine = ["market.instruments.lookup", "openapi.machine"];
    expect(operations).toHaveLength(14);
    for (const op of operations) {
      const expected = machine.includes(op.id)
        ? ["local", "remote_machine"]
        : op.id === "updates.qualify"
          ? ["local"]
          : admin.includes(op.id)
            ? ["local", "remote_admin"]
            : ["local", "remote_human", "remote_admin"];
      expect(
        safe.includes(op.id) ||
          admin.includes(op.id) ||
          machine.includes(op.id) ||
          op.id === "updates.qualify",
      ).toBe(true);
      expect([...op.allowedContexts].sort()).toEqual(expected.sort());
    }
  });
  it("MP2-15 after cancellation, late GET resolution cannot publish or issue another GET", async () => {
    const t = fixture(),
      controller = new AbortController();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    t.f.barrier = () =>
      new Promise<void>((r) => {
        release = r;
        entered();
      });
    const pending = t.run(controller.signal);
    await started;
    expect(t.calls).toHaveLength(1);
    controller.abort();
    const r = await pending,
      serialized = JSON.stringify(r),
      count = t.calls.length;
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.stringify(r)).toBe(serialized);
    expect(t.calls).toHaveLength(count);
    assertSafe(r);
  });
  it("MP2-16 one profile failure fences the other profile's delayed account GET", async () => {
    const t = fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    t.f.blockedPath = "/v2/source-instances/fixture-source-A/account";
    t.f.barrier = async (path) => {
      if (path === "/v2/source-instances/fixture-source-B/account")
        await new Promise<void>((r) => {
          release = r;
          entered();
        });
    };
    const pending = t.run();
    await started;
    const r = await pending,
      count = t.calls.length;
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.calls).toHaveLength(count);
    expect(r.profiles).toEqual([]);
    assertSafe(r);
  });
  it("MP2-17 two connected sources with the same display cannot prove duplicate-account safety", async () => {
    const t = fixture();
    t.f.config.profiles[1]!.expectedState = "connected";
    t.f.sources[1]!.session.state = "connected";
    const r = await t.run();
    expect(gate(r, "LEGACY_SINGLE_PROFILE_STATE")?.status).toBe("BLOCKED");
    expect(gate(r, "ACCOUNT_IDENTITY")?.status).toBe("UNPROVEN");
    assertSafe(r);
  });
});
