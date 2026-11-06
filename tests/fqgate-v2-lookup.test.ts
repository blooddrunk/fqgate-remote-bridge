import { afterEach, describe, expect, it, vi } from "vitest";
import * as contract from "../src/fqgate/market/contract.js";
import {
  FqgateV2InstrumentLookup,
  V2_LOOKUP_FINGERPRINT,
  V2_LOOKUP_CONTRACTS,
} from "../src/fqgate/market/v2.js";
import { FqgateInstrumentLookup } from "../src/fqgate/market/lookup.js";
import type { HttpRequestOptions } from "../src/fqgate/release/http.js";

import { BridgeService } from "../src/bridge/service.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";

const source = () => ({
  instanceId: "fixture-source",
  providerId: "tonghuashun",
  instanceNo: 2,
  pid: 123,
  restartCount: 0,
  workerState: "ready",
  autoLogin: false,
  defaultGuest: false,
  session: { state: "connected" },
});
const TEST_NOW = Date.parse("2026-11-06T00:00:00Z");
const account = (state = "connected") => ({
  descriptor: {
    session_supported: true,
    saved_login_supported: true,
    actions: ["logout", "restore_saved_login", "clear_saved_login"],
  },
  snapshot: {
    state,
    account_display: "never-return",
    session_kind: "user",
    level2_access: true,
    saved_login: {
      available: true,
      account_display: "never-return",
      session_kind: "user",
      level2_access: true,
    },
    observed_at: new Date(TEST_NOW).toISOString(),
    session_notice: null as string | null,
  },
});
const set = (value: unknown, path: string, replacement: unknown) => {
  const parts = path.split(".");
  let current = value as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) current = current[part] as Record<string, unknown>;
  if (replacement === undefined) delete current[parts.at(-1)!];
  else current[parts.at(-1)!] = replacement;
};
const result = () => ({
  code: 0,
  message: "ok",
  data: {
    row_count: 1,
    data_state: "present",
    coverage: { status: "unknown", returned_count: 1 },
    items: [
      { security: { code: "600000", market: "XSHG" }, name: "Fixture", secret: "never-return" },
    ],
  },
});
function fixture() {
  let inventories = 0;
  const f = {
    version: {
      product: "FQGate",
      version: "2.0.5",
      api_version: "2.0",
      platform: "windows",
      architecture: "x86_64",
    },
    sources: [source()],
    account: account(),
    peerAccount: account("disconnected"),
    result: result(),
    health: { status: "ready" },
    mutate: (_count: number) => {},
    status: 200,
    bytes: undefined as Uint8Array | undefined,
    time: TEST_NOW,
    error: false,
  };
  vi.spyOn(contract, "operationContractFingerprint").mockReturnValue(V2_LOOKUP_FINGERPRINT);
  const identity = vi.fn(async () => "a".repeat(64));
  const request = vi.fn(async (url: string, options: HttpRequestOptions) => {
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.timeoutMs).toBeGreaterThan(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(5000);
    if (f.error) throw new Error("secret raw upstream error");
    const path = new URL(url).pathname;
    let value: unknown;
    if (path === "/v2/system/version") value = f.version;
    else if (path === "/v2/system/health") value = f.health;
    else if (path === "/openapi.json")
      value = { openapi: "3.1.0", info: { title: "fixture", version: "2.0" }, paths: {} };
    else if (path === "/v2/source-instances") {
      f.mutate(++inventories);
      value = { instances: f.sources };
    } else if (path === "/v2/source-instances/fixture-source/account") value = f.account;
    else if (path === "/v2/source-instances/peer/account") value = f.peerAccount;
    else if (path === "/v2/instruments/search") {
      expect(new URL(url).search).toBe("?query=600000");
      expect(options.headers?.["X-FQGate-Instance-Id"]).toBe("fixture-source");
      expect(Number(options.headers?.["X-Request-Timeout-Ms"])).toBe(options.timeoutMs);
      value = f.result;
    } else throw new Error("Unexpected route");
    return {
      status: path === "/v2/instruments/search" ? f.status : 200,
      headers: {},
      body:
        (path === "/v2/instruments/search" ? f.bytes : undefined) ??
        Buffer.from(JSON.stringify(value)),
    };
  });
  const adapter = new FqgateV2InstrumentLookup({
    http: { request },
    identity,
    nowMs: () => f.time,
    nowUtcMs: () => f.time,
  });
  return { f, request, adapter, identity };
}
afterEach(() => vi.restoreAllMocks());
describe("exact 2.0.5 read-only lookup", () => {
  it("normalizes only exact security identities and exposes no source/account fields", async () => {
    const f = fixture();
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toEqual({
      items: [{ code: "600000", market: "XSHG", name: "Fixture", instrumentId: "XSHG:600000" }],
    });
    expect(f.identity).toHaveBeenCalledTimes(2);
    expect(f.request).toHaveBeenCalledTimes(11);
  });
  it("returns an empty canonical search without retry", async () => {
    const f = fixture();
    f.f.result.data = {
      row_count: 0,
      data_state: "empty",
      coverage: { status: "complete", returned_count: 0 },
      items: [],
    };
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toEqual({ items: [] });
  });
  it.each(["2.0.4", "2.0.6", "2.0.7", "2.0.8", "1.0.5", "unknown"])(
    "denies wrong version %s",
    async (version) => {
      const f = fixture();
      f.f.version.version = version;
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
        code: "FQGATE_INCOMPATIBLE",
      });
      expect(f.request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ sources: [] }, { sources: [{ ...source(), session: { state: "disconnected" } }] }])(
    "requires a connected source %#",
    async ({ sources }) => {
      const f = fixture();
      f.f.sources = sources;
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
        code: "LOGIN_REQUIRED",
      });
    },
  );
  it("denies multiple connected sources and never guesses the default", async () => {
    const f = fixture();
    f.f.sources.push({ ...source(), instanceId: "other", instanceNo: 3, pid: 456 });
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "FQGATE_INCOMPATIBLE",
    });
    expect(f.request.mock.calls.some(([u]) => u.includes("search?"))).toBe(false);
  });
  it.each([
    "instanceId",
    "pid",
    "restartCount",
    "instanceNo",
    "providerId",
    "workerState",
    "disconnect",
  ])("discards results after source change %s", async (key) => {
    const f = fixture();
    f.f.mutate = (n) => {
      if (n === 2) {
        const s = f.f.sources[0]!;
        if (key === "disconnect") s.session.state = "disconnected";
        else if (["pid", "restartCount", "instanceNo"].includes(key))
          (s as unknown as Record<string, unknown>)[key] = 456;
        else (s as unknown as Record<string, unknown>)[key] = "changed";
      }
    };
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toBeDefined();
  });
  it("P0 production 2.0.5 rejects account-display drift without publishing results", async () => {
    const f = fixture();
    f.f.mutate = (n) => {
      if (n === 2) f.f.account.snapshot.account_display = "changed-private-account";
    };
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "FQGATE_INCOMPATIBLE",
    });
    expect(f.request).toHaveBeenCalledTimes(8);
    expect(f.identity).toHaveBeenCalledTimes(1);
    expect(f.request.mock.calls.filter(([u]) => u.includes("search?")).length).toBe(1);
  });
  it("checks selected account readiness independently", async () => {
    const f = fixture();
    f.f.account.snapshot.state = "disconnected";
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "FQGATE_INCOMPATIBLE",
    });
  });
  it.each(["../escape", "hidden\nvalue", ".", ".."])("denies unsafe source IDs %s", async (id) => {
    const f = fixture();
    f.f.sources[0]!.instanceId = id;
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
  });
  it("denies duplicate inventory identities", async () => {
    const f = fixture();
    f.f.sources.push({ ...source(), session: { state: "disconnected" } });
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
  });
  it.each([
    3001,
    3006,
    4003,
    4005,
    "request_cancelled",
    "request_deadline_exceeded",
    "request_rate_limited",
    "worker_protocol_error",
  ])("classifies upstream error %s with no retry or sensitive message", async (code) => {
    const f = fixture();
    (f.f.result as unknown as Record<string, unknown>).code = code;
    f.f.result.message = "sensitive-account-secret";
    const error = await f.adapter.lookup({ code: "600000" }).catch((e) => e);
    expect(error.code).toBe(
      code === 3001
        ? "LOGIN_REQUIRED"
        : code === 3006
          ? "MARKET_PERMISSION_REQUIRED"
          : "UPSTREAM_UNAVAILABLE",
    );
    expect(JSON.stringify(error)).not.toContain("sensitive-account-secret");
    expect(f.request.mock.calls.filter(([u]) => u.includes("search?")).length).toBe(1);
  });
  it.each([201, 302, 409, 500, 502, 503, 504])("denies non-200 %s", async (status) => {
    const f = fixture();
    f.f.status = status;
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
  it.each(["count", "coverage", "state", "name", "market", "oversize", "json", "items"])(
    "denies malformed/oversized response %s",
    async (kind) => {
      const f = fixture();
      const d = f.f.result.data;
      if (kind === "count") d.row_count = 0;
      if (kind === "coverage") d.coverage.returned_count = 0;
      if (kind === "state") d.data_state = "empty";
      if (kind === "name") d.items[0]!.name = "x".repeat(129);
      if (kind === "market") d.items[0]!.security.market = "unknown";
      if (kind === "oversize") f.f.bytes = new Uint8Array(65537);
      if (kind === "json") f.f.bytes = Buffer.from("{}");
      if (kind === "items") {
        d.items = Array(17).fill(d.items[0]);
        d.row_count = 17;
        d.coverage.returned_count = 17;
      }
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
        code: "UPSTREAM_RESPONSE_INVALID",
      });
    },
  );
  it.each(["market", "coverage", "empty-state"])(
    "rejects coercible array enum %s",
    async (kind) => {
      const f = fixture();
      const d = f.f.result.data;
      if (kind === "market")
        (d.items[0]!.security as unknown as Record<string, unknown>).market = ["XSHG"];
      if (kind === "coverage")
        (d.coverage as unknown as Record<string, unknown>).status = ["complete"];
      if (kind === "empty-state") {
        d.items = [];
        d.row_count = 0;
        d.coverage.returned_count = 0;
        (d as unknown as Record<string, unknown>).data_state = ["empty"];
      }
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
        code: "UPSTREAM_RESPONSE_INVALID",
      });
    },
  );
  it("rejects coercible source session states before querying", async () => {
    const f = fixture();
    (f.f.sources[0]!.session as unknown as Record<string, unknown>).state = ["disconnected"];
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
    expect(f.request.mock.calls.some(([u]) => u.includes("search?"))).toBe(false);
  });
  it("rejects malformed UTF-8 rather than publishing replacement characters", async () => {
    const f = fixture();
    const json = JSON.stringify(f.f.result);
    const [before, after] = json.split("Fixture");
    f.f.bytes = Buffer.concat([
      Buffer.from(before!),
      Buffer.from([0xc3, 0x28]),
      Buffer.from(after!),
    ]);
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
  });
  it("fails before querying on protocol drift", async () => {
    const f = fixture();
    vi.mocked(contract.operationContractFingerprint).mockReturnValue("b".repeat(64));
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "OPENAPI_CONTRACT_MISSING",
    });
    expect(f.request).toHaveBeenCalledTimes(3);
  });
  it("discards results on post-query protocol/version/identity drift", async () => {
    for (const kind of ["contract", "version", "identity"]) {
      const f = fixture();
      if (kind === "contract")
        vi.mocked(contract.operationContractFingerprint)
          .mockReturnValueOnce(V2_LOOKUP_FINGERPRINT)
          .mockReturnValue("b".repeat(64));
      if (kind === "version")
        f.f.mutate = (n) => {
          if (n === 2) f.f.version.version = "2.0.6";
        };
      if (kind === "identity")
        f.identity.mockResolvedValueOnce("a".repeat(64)).mockResolvedValue("b".repeat(64));
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toBeDefined();
      vi.restoreAllMocks();
    }
  });
  it("enforces shared deadline and transport cancellation without retry", async () => {
    const f = fixture();
    f.f.mutate = () => {
      f.f.time = TEST_NOW + 5001;
    };
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(f.request.mock.calls.some(([u]) => u.includes("search?"))).toBe(false);
    const cancelled = fixture();
    cancelled.f.error = true;
    await expect(cancelled.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(cancelled.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    "snapshot.session_kind",
    "snapshot.level2_access",
    "snapshot.session_notice",
    "snapshot.saved_login.available",
    "snapshot.saved_login.account_display",
    "snapshot.saved_login.session_kind",
    "snapshot.saved_login.level2_access",
    "descriptor.session_supported",
    "descriptor.saved_login_supported",
    "descriptor.actions",
  ])("refuses visible account/descriptor drift %s", async (path) => {
    const f = fixture();
    f.f.mutate = (n) => {
      if (n === 2)
        set(
          f.f.account,
          path,
          path.endsWith("actions")
            ? ["logout"]
            : path.endsWith("session_kind")
              ? "guest"
              : path.endsWith("account_display")
                ? "changed-private"
                : path.endsWith("session_notice")
                  ? "level2_replaced_by_remote_login"
                  : false,
        );
    };
    const error = await f.adapter.lookup({ code: "600000" }).catch((e) => e);
    expect(["LOGIN_REQUIRED", "FQGATE_INCOMPATIBLE"]).toContain(error.code);
    expect(error).not.toHaveProperty("items");
    expect(JSON.stringify(error)).not.toContain("private");
  });
  it.each([
    "snapshot",
    "snapshot.saved_login",
    "descriptor",
    "snapshot.observed_at",
    "snapshot.saved_login.available",
    "snapshot.account_display",
    "snapshot.session_kind",
    "snapshot.level2_access",
    "snapshot.session_notice",
    "descriptor.actions",
  ])("refuses missing or malformed required account metadata %s", async (path) => {
    const f = fixture();
    set(
      f.f.account,
      path,
      path.endsWith("account_display")
        ? ""
        : path.endsWith("session_kind")
          ? ["user"]
          : path.endsWith("level2_access")
            ? "true"
            : path.endsWith("session_notice")
              ? "secret"
              : undefined,
    );
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
    expect(f.request.mock.calls.some(([u]) => u.includes("search?"))).toBe(false);
  });
  it.each(["snapshot.account_display", "snapshot.saved_login.account_display"])(
    "bounds private display %s",
    async (path) => {
      for (const value of [" ", "x".repeat(129), "private\nvalue", {}, ["private"]]) {
        const f = fixture();
        set(f.f.account, path, value);
        // Whitespace-only is an unusable display, never silently normalized.
        await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
          code: "UPSTREAM_RESPONSE_INVALID",
        });
      }
    },
  );
  it.each([
    "snapshot.token",
    "snapshot.account_id",
    "snapshot.saved_login.cookie",
    "descriptor.secret",
    "credentials",
  ])("rejects unreviewed/sensitive account fields %s", async (path) => {
    const f = fixture();
    set(f.f.account, path, "private-secret");
    const error = await f.adapter.lookup({ code: "600000" }).catch((e) => e);
    expect(error.code).toBe("UPSTREAM_RESPONSE_INVALID");
    expect(JSON.stringify(error)).not.toMatch(/private-secret|never-return/);
    expect(error).not.toHaveProperty("cause");
  });
  it("accepts schema-reviewed optional nullable account fields without claiming identity", async () => {
    const f = fixture();
    for (const path of [
      "snapshot.account_display",
      "snapshot.session_kind",
      "snapshot.level2_access",
      "snapshot.session_notice",
      "snapshot.saved_login.account_display",
      "snapshot.saved_login.session_kind",
      "snapshot.saved_login.level2_access",
    ])
      set(f.f.account, path, null);
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toHaveProperty("items");
  });
  it.each(["stale", "future", "regressing", "no-zone", "oversize", "invalid"])(
    "denies observation time %s",
    async (kind) => {
      const f = fixture();
      if (kind === "regressing")
        f.f.mutate = (n) => {
          if (n === 2) f.f.account.snapshot.observed_at = new Date(TEST_NOW - 1).toISOString();
        };
      else
        f.f.account.snapshot.observed_at =
          kind === "stale"
            ? new Date(TEST_NOW - 30_001).toISOString()
            : kind === "future"
              ? new Date(TEST_NOW + 2_001).toISOString()
              : kind === "no-zone"
                ? "2026-11-06T00:00:00"
                : kind === "oversize"
                  ? "x".repeat(65)
                  : "invalid";
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
        "code",
        kind === "regressing" ? "FQGATE_INCOMPATIBLE" : "UPSTREAM_RESPONSE_INVALID",
      );
    },
  );
  it("ignores advancing observed_at and inventory/action ordering as identity keys", async () => {
    const f = fixture();
    f.f.sources.push({
      ...source(),
      instanceId: "peer",
      instanceNo: 3,
      pid: 456,
      session: { state: "disconnected" },
    });
    f.f.mutate = (n) => {
      if (n === 2) {
        f.f.sources.reverse();
        f.f.account.descriptor.actions.reverse();
        f.f.account.snapshot.observed_at = new Date(TEST_NOW + 1).toISOString();
      }
    };
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toHaveProperty("items");
    expect(f.request).toHaveBeenCalledTimes(13);
  });
  it.each([
    "pid",
    "instanceNo",
    "restartCount",
    "providerId",
    "workerState",
    "autoLogin",
    "defaultGuest",
    "state",
    "removed",
    "account",
    "saved",
    "l2",
  ])("refuses peer continuity change %s", async (kind) => {
    const f = fixture();
    f.f.sources.push({
      ...source(),
      instanceId: "peer",
      instanceNo: 3,
      pid: 456,
      session: { state: "disconnected" },
    });
    f.f.mutate = (n) => {
      if (n !== 2) return;
      if (kind === "removed") {
        f.f.sources.pop();
        return;
      }
      if (kind === "account") f.f.peerAccount.snapshot.account_display = "private-peer";
      else if (kind === "saved") f.f.peerAccount.snapshot.saved_login.available = false;
      else if (kind === "l2") f.f.peerAccount.snapshot.level2_access = false;
      else if (kind === "state") f.f.sources[1]!.session.state = "connected";
      else
        set(
          f.f.sources[1],
          kind,
          ["pid", "instanceNo", "restartCount"].includes(kind)
            ? 999
            : ["autoLogin", "defaultGuest"].includes(kind)
              ? true
              : "changed",
        );
    };
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "FQGATE_INCOMPATIBLE",
    );
    expect(f.request.mock.calls.filter(([u]) => u.includes("search?"))).toHaveLength(1);
  });
  it.each(["pid", "instanceNo"])("refuses duplicated peer %s before search", async (key) => {
    const f = fixture();
    const peer = {
      ...source(),
      instanceId: "peer",
      instanceNo: 3,
      pid: 456,
      session: { state: "disconnected" },
    };
    set(peer, key, key === "pid" ? 123 : 2);
    f.f.sources.push(peer);
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "UPSTREAM_RESPONSE_INVALID",
    );
    expect(f.request).toHaveBeenCalledTimes(4);
  });
  it("rejects partial coverage instead of publishing a partial result", async () => {
    const f = fixture();
    f.f.result.data.coverage.status = "partial";
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "UPSTREAM_RESPONSE_INVALID",
    );
  });
  it.each(["initial", "final"])(
    "five seconds include %s identity and ignore late completion",
    async (stage) => {
      vi.useFakeTimers();
      try {
        const f = fixture();
        let finish!: (v: string) => void;
        const delayed = () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          });
        if (stage === "initial") f.identity.mockImplementationOnce(delayed);
        else f.identity.mockResolvedValueOnce("a".repeat(64)).mockImplementationOnce(delayed);
        const outcome = f.adapter.lookup({ code: "600000" });
        const assertion = expect(outcome).rejects.toHaveProperty("code", "UPSTREAM_UNAVAILABLE");
        await vi.advanceTimersByTimeAsync(5000);
        await assertion;
        const count = f.request.mock.calls.length;
        expect(count).toBe(stage === "initial" ? 0 : 11);
        finish("a".repeat(64));
        await vi.advanceTimersByTimeAsync(1);
        expect(f.request).toHaveBeenCalledTimes(count);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it.each(["initial", "final"])("deadline counts %s identity elapsed time", async (stage) => {
    const f = fixture();
    const slow = async () => {
      f.f.time += 5000;
      return "a".repeat(64);
    };
    if (stage === "initial") f.identity.mockImplementationOnce(slow);
    else f.identity.mockResolvedValueOnce("a".repeat(64)).mockImplementationOnce(slow);
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "UPSTREAM_UNAVAILABLE",
    );
    expect(f.request).toHaveBeenCalledTimes(stage === "initial" ? 0 : 11);
  });
  it("rejects a late HTTP completion and sends no subsequent requests", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let finish!: (v: {
        status: number;
        headers: Record<string, string>;
        body: Uint8Array;
      }) => void;
      f.request.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const outcome = f.adapter.lookup({ code: "600000" });
      const assertion = expect(outcome).rejects.toHaveProperty("code", "UPSTREAM_UNAVAILABLE");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      finish({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(f.f.version)) });
      await vi.advanceTimersByTimeAsync(1);
      expect(f.request).toHaveBeenCalledTimes(1);
      expect(f.identity).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("counts contract parsing/fingerprinting against the same budget", async () => {
    const f = fixture();
    vi.mocked(contract.operationContractFingerprint).mockImplementation(() => {
      f.f.time += 5000;
      return V2_LOOKUP_FINGERPRINT;
    });
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "UPSTREAM_UNAVAILABLE",
    );
    expect(f.request).toHaveBeenCalledTimes(3);
  });
  it("normalizes identity failures without private causes", async () => {
    const f = fixture();
    f.identity.mockRejectedValueOnce(new Error("private-process-path"));
    const error = await f.adapter.lookup({ code: "600000" }).catch((e) => e);
    expect(error.code).toBe("PROCESS_IDENTITY_MISMATCH");
    expect(JSON.stringify(error)).not.toContain("private");
    expect(error).not.toHaveProperty("cause");
    expect(f.request).not.toHaveBeenCalled();
  });
  it.each(Array.from({ length: 11 }, (_, i) => i + 1))(
    "refuses 503 at GET stage %s without retry or post-failure work",
    async (stage) => {
      const f = fixture();
      const original = f.request.getMockImplementation()!;
      let calls = 0;
      f.request.mockImplementation(async (url, options) => {
        if (++calls === stage)
          return { status: 503, headers: {}, body: Buffer.from('{"message":"private-account"}') };
        return original(url, options);
      });
      const error = await f.adapter.lookup({ code: "600000" }).catch((e) => e);
      expect(error.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(error).not.toHaveProperty("items");
      expect(JSON.stringify(error)).not.toContain("private-account");
      expect(f.request).toHaveBeenCalledTimes(stage);
    },
  );
  it.each(["initial", "final"])("deadline includes %s response decoding", async (phase) => {
    const f = fixture();
    const decoder = TextDecoder.prototype.decode;
    let calls = 0;
    vi.spyOn(TextDecoder.prototype, "decode").mockImplementation(function (
      this: TextDecoder,
      ...args
    ) {
      const result = decoder.apply(this, args);
      if (++calls === (phase === "initial" ? 1 : 11)) f.f.time += 5000;
      return result;
    });
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty(
      "code",
      "UPSTREAM_UNAVAILABLE",
    );
    expect(f.request).toHaveBeenCalledTimes(phase === "initial" ? 1 : 11);
  });
  it("reduces all per-call timeouts after identity consumes part of the budget", async () => {
    const f = fixture();
    f.identity.mockImplementationOnce(async () => {
      f.f.time += 1234;
      return "a".repeat(64);
    });
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toHaveProperty("items");
    for (const [, options] of f.request.mock.calls) expect(options.timeoutMs).toBe(3766);
  });
  it("rejects caller-selected instances before any identity or HTTP work", async () => {
    const f = fixture();
    await expect(f.adapter.lookup({ code: "600000", instanceId: "other" })).rejects.toMatchObject({
      code: "REQUEST_INVALID",
    });
    expect(f.identity).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
  it("selects v2 separately without inheriting v1 qualification", async () => {
    const f = fixture();
    const runtime = vi.fn();
    const router = new FqgateInstrumentLookup({
      http: { request: f.request },
      runtime,
      v2: f.adapter,
      selectV2: async () => true,
    });
    await expect(router.lookup({ code: "600000" })).resolves.toHaveProperty("items");
    expect(runtime).not.toHaveBeenCalled();
  });
  it("preserves local/machine-only authorization before v2 upstream work", async () => {
    for (const [host, status] of [
      ["127.0.0.1:17282", 200],
      ["api.example.com", 200],
      ["human.example.com", 403],
      ["admin.example.com", 403],
      ["unknown.example.com", 421],
    ] as const) {
      const f = fixture();
      const service = new BridgeService({
        instrumentLookup: f.adapter,
        buildInfo: {
          name: "fqgate-remote-bridge",
          version: "0.1.0",
          commit: "fixture",
          node: "v22.0.0",
          platform: "linux",
          architecture: "x64",
        },
        lifecycle: {
          status: async () => {
            throw Error("not used");
          },
        },
        qrAdapter: new FqgateQrAdapter({
          baseUrl: "http://127.0.0.1:17281",
          http: { request: f.request },
        }),
        qrRegistry: new QrFlowRegistry(),
      });
      const handler = createBridgeHttpHandler({
        service,
        requestContext: {
          remoteHostname: "human.example.com",
          adminHostname: "admin.example.com",
          machineHostname: "api.example.com",
          adminVerifier: {
            audience: "admin",
            verify: async () => ({ kind: "human", subject: "operator", audience: "admin" }),
          },
          machineVerifier: {
            audience: "machine",
            verify: async () => ({ kind: "machine", subject: "reader", audience: "machine" }),
          },
        },
      });
      const response = await handler(
        new Request(`http://${host}/api/v1/instruments/lookup`, {
          method: "POST",
          headers: {
            host,
            "cf-access-jwt-assertion": "fixture",
            "content-type": "application/json",
          },
          body: '{"code":"600000"}',
        }),
      );
      expect(response.status, host).toBe(status);
      if (status !== 200) {
        expect(f.identity).not.toHaveBeenCalled();
        expect(f.request).not.toHaveBeenCalled();
      } else {
        const logs = vi.spyOn(console, "error").mockImplementation(() => {});
        f.f.mutate = (n) => {
          if (n === 4) f.f.account.snapshot.account_display = "changed-private-account";
        };
        const drift = await handler(
          new Request(`http://${host}/api/v1/instruments/lookup`, {
            method: "POST",
            headers: {
              host,
              "cf-access-jwt-assertion": "fixture",
              "content-type": "application/json",
            },
            body: '{"code":"600000"}',
          }),
        );
        expect(drift.status).toBeGreaterThanOrEqual(400);
        const body = await drift.text();
        expect(body).toContain("FQGATE_INCOMPATIBLE");
        expect(body).not.toMatch(
          /items|600000|Fixture|never-return|changed-private-account|fixture-source|account_display/,
        );
        expect(JSON.stringify(logs.mock.calls)).not.toMatch(
          /never-return|changed-private-account|fixture-source|account_display/,
        );
        expect(logs).toHaveBeenCalled();
      }
      f.request.mockClear();
      f.identity.mockClear();
      for (const path of ["/api/v1/trading/orders", "/v2/trading/orders"]) {
        const denied = await handler(
          new Request(`http://${host}${path}`, {
            method: "POST",
            headers: {
              host,
              "cf-access-jwt-assertion": "fixture",
              "content-type": "application/json",
            },
            body: "{}",
          }),
        );
        expect(denied.status).toBe(host === "unknown.example.com" ? 421 : 404);
      }
      expect(f.request).not.toHaveBeenCalled();
      expect(f.identity).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });
  it("fingerprints all selected operations and transitive refs without unrelated paths", () => {
    vi.restoreAllMocks();
    const doc = {
      paths: Object.fromEntries(
        V2_LOOKUP_CONTRACTS.map(([p]) => [
          p,
          { get: { responses: { "200": { $ref: "#/components/schemas/Fixture" } } } },
        ]),
      ),
      components: { schemas: { Fixture: { type: "string" } } },
    };
    const baseline = contract.operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS);
    doc.paths["/trading/orders"] = {
      get: { responses: { "200": { $ref: "#/components/schemas/Fixture" } } },
    };
    expect(contract.operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS)).toBe(baseline);
    doc.components.schemas.Fixture.type = "integer";
    expect(contract.operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS)).not.toBe(baseline);
  });
});
