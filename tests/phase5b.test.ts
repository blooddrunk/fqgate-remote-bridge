import { describe, expect, it, vi } from "vitest";
import {
  FqgateInstrumentLookup,
  LOOKUP_CONTRACT_FINGERPRINT,
  parseInstrumentLookupRequest,
} from "../src/fqgate/market/lookup.js";
import {
  fetchLookupContract,
  lookupContractFingerprint,
  LOOKUP_UPSTREAM_PATH,
} from "../src/fqgate/market/contract.js";
import { FetchHttpTransport, type HttpTransport } from "../src/fqgate/release/http.js";
import { getBridgeOperation, listBridgeOperations } from "../src/bridge/policy/registry.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import { BridgeService } from "../src/bridge/service.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";

const item = {
  code: "600000",
  market: "17",
  name: "Fixture",
  ths_code: "600000.SH",
  ignored: "never-return",
};
const payload = () => ({
  code: 0,
  message: "ok",
  data: { item_count: 1, items: [{ ...item }], records: "never-return" },
});
function fixture(value: unknown = payload(), status = 200) {
  const request = vi.fn(async () => ({
    status,
    headers: {},
    body: Buffer.from(JSON.stringify(value)),
  }));
  const runtime = vi.fn(async () => ({ version: "1.0.1", validated: true, running: true }));
  const contract = vi.fn(async () => LOOKUP_CONTRACT_FINGERPRINT);
  return {
    request,
    runtime,
    contract,
    adapter: new FqgateInstrumentLookup({ http: { request }, runtime, contract }),
  };
}

describe("Phase 5-B instrument adapter", () => {
  it("forms the fixed request and returns only normalized exact matches", async () => {
    const f = fixture();
    await expect(f.adapter.lookup({ code: "600000" })).resolves.toEqual({
      items: [{ code: "600000", market: "17", name: "Fixture", instrumentId: "600000.SH" }],
    });
    expect(f.request).toHaveBeenCalledWith(`http://127.0.0.1:17281${LOOKUP_UPSTREAM_PATH}`, {
      method: "POST",
      redirect: "error",
      timeoutMs: 5000,
      maxBytes: 65536,
      headers: { "content-type": "application/json" },
      body: '{"pattern":"600000"}',
    });
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { code: 600000 },
    { code: "60000" },
    { code: "6000000" },
    { code: "６０００００" },
    { code: "600000 " },
    { code: "600000\n" },
    { code: ".*" },
    { code: "600000", path: "/arbitrary" },
    { code: "600000", limit: 1 },
  ])("rejects malformed input before any upstream work %#", async (input) => {
    const f = fixture();
    await expect(f.adapter.lookup(input)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
  it("accepts every six-digit boundary without trimming or coercion", () => {
    expect(parseInstrumentLookupRequest({ code: "000000" })).toEqual({ code: "000000" });
    expect(parseInstrumentLookupRequest({ code: "999999" })).toEqual({ code: "999999" });
  });
  it.each([
    { code: 1, message: "secret-session", data: {} },
    { code: 0, message: 5, data: {} },
    { code: 0, message: "ok" },
    { code: 0, message: "ok", data: null },
    { code: 0, message: "ok", data: { items: [], item_count: 1 } },
    { code: 0, message: "ok", data: { items: Array(17).fill(item), item_count: 17 } },
    {
      code: 0,
      message: "ok",
      data: { items: [{ ...item, name: "x".repeat(129) }], item_count: 1 },
    },
    { code: 0, message: "ok", data: { items: [{ ...item, name: "hidden\nline" }], item_count: 1 } },
    {
      code: 0,
      message: "ok",
      data: { items: [{ ...item, market: "x".repeat(17) }], item_count: 1 },
    },
    {
      code: 0,
      message: "ok",
      data: { items: [{ ...item, ths_code: "x".repeat(33) }], item_count: 1 },
    },
    { code: 0, message: "ok", data: { items: [{ ...item, code: 5 }], item_count: 1 } },
  ])("fails closed on malformed envelope/results without raw leakage %#", async (value) => {
    const f = fixture(value);
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toHaveProperty("details", undefined);
    await expect(f.adapter.lookup({ code: "600000" })).rejects.not.toHaveProperty(
      "message",
      "secret-session",
    );
  });
  it("accepts zero and maximum counts and string lengths, excluding related codes", async () => {
    const f = fixture({
      code: 0,
      message: "ok",
      data: {
        item_count: 16,
        items: Array.from({ length: 16 }, (_, i) => ({
          ...item,
          code: i === 0 ? "600000" : "600001",
          name: "x".repeat(128),
          market: "a".repeat(16),
          ths_code: "a".repeat(32),
        })),
      },
    });
    expect((await f.adapter.lookup({ code: "600000" })).items).toHaveLength(1);
    await expect(
      fixture({ code: 0, message: "ok", data: { item_count: 0, items: [] } }).adapter.lookup({
        code: "000000",
      }),
    ).resolves.toEqual({ items: [] });
  });
  it.each([
    [1001, "login required", "LOGIN_REQUIRED"],
    [3006, "permission", "MARKET_PERMISSION_REQUIRED"],
    [7000, "private diagnostic", "UPSTREAM_UNAVAILABLE"],
  ])("normalizes upstream error %s", async (code, message, expected) => {
    await expect(
      fixture({ code, message, data: null }).adapter.lookup({ code: "600000" }),
    ).rejects.toMatchObject({ code: expected });
  });
  it("rejects oversized bytes independently of envelope validity", async () => {
    const f = fixture({ ...payload(), padding: "x".repeat(65536) });
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_INVALID",
    });
  });
  it("normalizes timeout/network/redirect errors without causes or bodies", async () => {
    const f = fixture();
    f.request.mockRejectedValue(new Error("private network body"));
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: "Instrument lookup is unavailable",
    });
  });
  it("rejects HTTP failure even with a success envelope", async () => {
    await expect(fixture(payload(), 503).adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
  it("rejects unknown version, unvalidated runtime, stopped process, and contract drift before query", async () => {
    for (const runtime of [
      { version: "1.0.2", validated: true, running: true },
      { version: "1.0.1", validated: false, running: true },
      { version: "1.0.1", validated: true, running: false },
    ]) {
      const f = fixture();
      f.runtime.mockResolvedValue(runtime);
      await expect(f.adapter.lookup({ code: "600000" })).rejects.toThrow();
      expect(f.request).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.contract.mockResolvedValue("drift");
    await expect(f.adapter.lookup({ code: "600000" })).rejects.toMatchObject({
      code: "OPENAPI_CONTRACT_MISSING",
    });
    expect(f.request).not.toHaveBeenCalled();
  });
});

const document = () => ({
  openapi: "3.1.0",
  info: { title: "fixture", version: "1" },
  paths: {
    [LOOKUP_UPSTREAM_PATH]: {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Input" } } },
        },
      },
    },
  },
  components: { schemas: { Input: { type: "object", properties: { code: { type: "string" } } } } },
});
describe("scoped live compatibility", () => {
  it("detects transitive schema drift but ignores unrelated added endpoints", () => {
    const original = document();
    const fingerprint = lookupContractFingerprint(original);
    expect(
      lookupContractFingerprint({
        ...original,
        paths: { ...original.paths, "/unrelated": { get: {} } },
      }),
    ).toBe(fingerprint);
    original.components.schemas.Input.properties.code.type = "number";
    expect(lookupContractFingerprint(original)).not.toBe(fingerprint);
  });
  it("denies absent contracts, dangling and remote references", () => {
    expect(() => lookupContractFingerprint({})).toThrow();
    for (const ref of ["https://evil.example/schema", "#/components/schemas/Missing"]) {
      const value = document();
      value.paths[LOOKUP_UPSTREAM_PATH]!.post.requestBody.content["application/json"].schema.$ref =
        ref;
      expect(() => lookupContractFingerprint(value)).toThrow();
    }
  });
  it("uses fixed bounded OpenAPI fetch with redirects disabled", async () => {
    const request = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: Buffer.from(JSON.stringify(document())),
    }));
    expect(await fetchLookupContract({ request })).toBe(lookupContractFingerprint(document()));
    expect(request).toHaveBeenCalledWith("http://127.0.0.1:17281/openapi.json", {
      method: "GET",
      timeoutMs: 3000,
      maxBytes: 4194304,
      redirect: "error",
    });
    request.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("not JSON") });
    await expect(fetchLookupContract({ request })).rejects.toMatchObject({
      code: "OPENAPI_CONTRACT_MISSING",
    });
  });
  it("native HTTP enforces size and timeout and does not follow redirects", async () => {
    const { createServer } = await import("node:http");
    let targetCalls = 0;
    const server = createServer((req, res) => {
      if (req.url === "/large") res.end("x".repeat(100));
      else if (req.url === "/redirect") {
        res.writeHead(302, { location: "/target" });
        res.end();
      } else if (req.url === "/target") {
        targetCalls++;
        res.end();
      }
      // /slow intentionally never responds.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("address");
    const http = new FetchHttpTransport();
    try {
      for (const path of ["large", "redirect", "slow"])
        await expect(
          http.request(`http://127.0.0.1:${address.port}/${path}`, {
            timeoutMs: 50,
            maxBytes: 10,
            redirect: "error",
          }),
        ).rejects.toThrow();
      expect(targetCalls).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function handlerFixture() {
  const lookup = fixture();
  const service = new BridgeService({
    buildInfo: {
      name: "fqgate-remote-bridge",
      version: "0.1.0",
      commit: "test",
      node: "v22.0.0",
      platform: "linux",
      architecture: "x64",
    },
    lifecycle: {
      status: async () => {
        throw new Error("old operation must not dispatch");
      },
    },
    qrAdapter: new FqgateQrAdapter({
      baseUrl: "http://127.0.0.1:17281",
      http: { request: lookup.request } as HttpTransport,
    }),
    qrRegistry: new QrFlowRegistry(),
    instrumentLookup: lookup.adapter,
  });
  return {
    lookup,
    handler: createBridgeHttpHandler({
      service,
      requestContext: {
        remoteHostname: "human.example.com",
        adminHostname: "admin.example.com",
        machineHostname: "api.example.com",
        adminVerifier: {
          audience: "admin",
          verify: async () => ({ kind: "human", subject: "human", audience: "admin" }),
        },
        machineVerifier: {
          audience: "machine",
          verify: async () => ({ kind: "machine", subject: "machine", audience: "machine" }),
        },
      },
    }),
  };
}
describe("Phase 5-B HTTP policy", () => {
  it("keeps lookup as the sole machine market operation", async () => {
    expect(
      listBridgeOperations()
        .filter(
          (o) => o.allowedContexts.includes("remote_machine") && o.classification === "market_read",
        )
        .map((o) => o.id),
    ).toEqual(["market.instruments.lookup"]);
    expect(getBridgeOperation("market.instruments.lookup").allowedContexts).toEqual([
      "local",
      "remote_machine",
    ]);
    for (const [host, status] of [
      ["127.0.0.1:17282", 200],
      ["api.example.com", 200],
      ["human.example.com", 403],
      ["admin.example.com", 403],
      ["unknown.example.com", 421],
    ] as const) {
      const f = handlerFixture();
      const response = await f.handler(
        new Request(`http://${host}/api/v1/instruments/lookup`, {
          method: "POST",
          headers: {
            host,
            "content-type": "application/json",
            "cf-access-jwt-assertion": "fixture",
          },
          body: JSON.stringify({ code: "600000" }),
        }),
      );
      expect(response.status, host).toBe(status);
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
      if (status !== 200) expect(f.lookup.request).not.toHaveBeenCalled();
    }
  });
  it("rejects malformed and oversized inputs without upstream access", async () => {
    const f = handlerFixture();
    for (const [body, status] of [
      [JSON.stringify({ code: "600000", path: "/raw" }), 400],
      [" ".repeat(257), 413],
      ["not json", 400],
    ] as const) {
      const response = await f.handler(
        new Request("http://127.0.0.1:17282/api/v1/instruments/lookup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      );
      expect(response.status).toBe(status);
    }
    expect(f.lookup.request).not.toHaveBeenCalled();
  });

  it("keeps local diagnostics and machine docs available when lookup compatibility drifts", async () => {
    const f = handlerFixture();
    f.lookup.contract.mockResolvedValue("drift");
    const lookup = await f.handler(
      new Request("http://127.0.0.1:17282/api/v1/instruments/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"code":"600000"}',
      }),
    );
    expect(lookup.status).toBe(502);
    await expect(lookup.json()).resolves.toMatchObject({
      error: { code: "OPENAPI_CONTRACT_MISSING" },
    });

    const version = await f.handler(new Request("http://127.0.0.1:17282/api/v1/version"));
    expect(version.status).toBe(200);
    const machineDocument = await f.handler(
      new Request("http://127.0.0.1:17282/api/v1/openapi/machine"),
    );
    expect(machineDocument.status).toBe(200);
  });
});
