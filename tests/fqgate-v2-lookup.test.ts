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
  session: { state: "connected" },
});
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
    account: {
      descriptor: { session_supported: true },
      snapshot: { state: "connected", account_display: "never-return" },
    },
    result: result(),
    health: { status: "ready" },
    mutate: (_count: number) => {},
    status: 200,
    bytes: undefined as Uint8Array | undefined,
    time: 0,
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
  it.each(["2.0.4", "2.0.6", "1.0.5", "unknown"])("denies wrong version %s", async (version) => {
    const f = fixture();
    f.f.version.version = version;
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "FQGATE_INCOMPATIBLE",
    });
    expect(f.request).toHaveBeenCalledTimes(1);
  });
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
    f.f.sources.push({ ...source(), instanceId: "other" });
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
  it("checks selected account readiness independently", async () => {
    const f = fixture();
    f.f.account.snapshot.state = "disconnected";
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "LOGIN_REQUIRED",
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
  it.each([201, 302, 409, 500, 502, 504])("denies non-200 %s", async (status) => {
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
      f.f.time = 5001;
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
      }
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
    doc.paths["/unrelated"] = {
      get: { responses: { "200": { $ref: "#/components/schemas/Fixture" } } },
    };
    expect(contract.operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS)).toBe(baseline);
    doc.components.schemas.Fixture.type = "integer";
    expect(contract.operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS)).not.toBe(baseline);
  });
});
