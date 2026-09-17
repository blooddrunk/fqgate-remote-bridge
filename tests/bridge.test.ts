import { describe, expect, it, vi } from "vitest";
import { BridgeService } from "../src/bridge/service.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import {
  assertOperationRegistryInvariants,
  findBridgeOperation,
  listBridgeOperations,
} from "../src/bridge/policy/registry.js";
import { resolveBridgeHost, resolveBridgePort } from "../src/bridge/runtime-config.js";
import { FqgateQrAdapter, QR_MAX_ENCODED_IMAGE_LENGTH } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type { BuildInfo } from "../src/shared/build-info.js";
import { StructuredLogger } from "../src/shared/logger.js";

const buildInfo: BuildInfo = {
  name: "fqgate-remote-bridge",
  version: "0.1.0",
  commit: "test-commit",
  node: "v22.0.0",
  platform: "linux",
  architecture: "x64",
};

describe("Phase 2 operation registry", () => {
  it("contains only explicit, unique local bridge operations", () => {
    assertOperationRegistryInvariants();
    const keys = listBridgeOperations().map((operation) => `${operation.method} ${operation.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((key) => key.includes("/v1/market") || key.includes("*"))).toBe(false);
    expect(findBridgeOperation("GET", "/api/v1/status")?.id).toBe("bridge.status");
    expect(listBridgeOperations().every((operation) => operation.timeoutMs > 0)).toBe(true);
  });

  it("keeps the production listener on IPv4 loopback and validates the port", () => {
    expect(resolveBridgeHost(undefined)).toBe("127.0.0.1");
    expect(resolveBridgeHost("127.0.0.1")).toBe("127.0.0.1");
    expect(() => resolveBridgeHost("0.0.0.0")).toThrow(/fixed to IPv4 loopback/);
    expect(() => resolveBridgeHost("192.168.1.10")).toThrow(/fixed to IPv4 loopback/);
    expect(resolveBridgePort(undefined)).toBe(17282);
    expect(resolveBridgePort("18000")).toBe(18000);
    expect(() => resolveBridgePort("0")).toThrow(/between 1024/);
    expect(() => resolveBridgePort("65536")).toThrow(/between 1024/);
  });
});

describe("FQGate QR compatibility adapter", () => {
  it("sends cache_credentials false and validates the begin payload", async () => {
    const transport = new QueueTransport([
      response({
        code: 0,
        message: "ok",
        data: {
          flow_id: 42,
          qr_image_base64: "aGVsbG8=",
          qr_media_type: "image/png",
          status: "waiting_for_scan",
        },
      }),
    ]);
    const adapter = new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: transport });
    await expect(adapter.begin()).resolves.toMatchObject({ flowId: 42, mediaType: "image/png" });
    expect(transport.requests[0]?.options).toMatchObject({
      method: "POST",
      body: JSON.stringify({ cache_credentials: false }),
    });
  });

  it("normalizes pending and connected poll results", async () => {
    const transport = new QueueTransport([
      response({
        code: 0,
        message: "ok",
        data: { connected: false, status: "waiting_for_confirmation" },
      }),
      response({ code: 0, message: "ok", data: { connected: true, login_method: "formal" } }),
    ]);
    const adapter = new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: transport });
    await expect(adapter.poll(42)).resolves.toEqual({
      status: "waiting_for_confirmation",
      connected: false,
    });
    await expect(adapter.poll(42)).resolves.toEqual({
      status: "connected",
      connected: true,
      loginMethod: "formal",
    });
  });

  it("maps upstream QR expiration and replacement codes", async () => {
    for (const [code, expected] of [
      [1003, "QR_FLOW_EXPIRED"],
      [3014, "QR_FLOW_REPLACED"],
    ] as const) {
      const transport = new QueueTransport([
        response({ code, message: "login required", data: null }),
      ]);
      const adapter = new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: transport });
      await expect(adapter.poll(42)).rejects.toMatchObject({ code: expected });
    }
  });

  it("rejects unsupported media types and oversized QR payloads", async () => {
    const invalidMedia = new QueueTransport([
      response({
        code: 0,
        message: "ok",
        data: {
          flow_id: 42,
          qr_image_base64: "aGVsbG8=",
          qr_media_type: "image/svg+xml",
          status: "waiting_for_scan",
        },
      }),
    ]);
    await expect(
      new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: invalidMedia }).begin(),
    ).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_INVALID" });

    const oversized = "A".repeat(QR_MAX_ENCODED_IMAGE_LENGTH + 1);
    const tooLarge = new QueueTransport([
      response({
        code: 0,
        message: "ok",
        data: {
          flow_id: 42,
          qr_image_base64: oversized,
          qr_media_type: "image/png",
          status: "waiting_for_scan",
        },
      }),
    ]);
    await expect(
      new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: tooLarge }).begin(),
    ).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_INVALID" });
  });
});

describe("ephemeral QR flow registry", () => {
  it("expires, replaces, bounds, and removes flow records", () => {
    let now = 1_000;
    const registry = new QrFlowRegistry({
      ttlMs: 100,
      maxActiveFlows: 2,
      terminalRetentionMs: 50,
      nowMs: () => now,
      idFactory: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
        .mockReturnValueOnce("33333333-3333-4333-8333-333333333333"),
    });
    const first = registry.create(1);
    const second = registry.create(2);
    expect(registry.activeCount).toBe(2);
    expect(() => registry.create(3)).toThrowError("The QR flow limit has been reached");
    registry.terminate(first.sessionId, "replaced");
    expect(registry.resolve(first.sessionId)).toMatchObject({
      kind: "terminal",
      state: "replaced",
    });
    now = 1_101;
    expect(registry.resolve(second.sessionId)).toMatchObject({
      kind: "terminal",
      state: "expired",
    });
    now = 1_152;
    expect(registry.resolve(first.sessionId)).toEqual({ kind: "missing" });
  });

  it("replaces active flows deterministically without exposing upstream identifiers", () => {
    const registry = new QrFlowRegistry({
      idFactory: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
    });
    const first = registry.create(101);
    const second = registry.create(202, { replaceExisting: true });
    expect(registry.resolve(first.sessionId)).toMatchObject({
      kind: "terminal",
      state: "replaced",
    });
    expect(registry.resolve(second.sessionId)).toMatchObject({ kind: "active" });
    expect(JSON.stringify({ sessionId: second.sessionId })).not.toContain("202");
  });

  it("bounds terminal tombstones as well as active flows", () => {
    const registry = new QrFlowRegistry({
      maxTerminalFlows: 1,
      idFactory: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
    });
    const first = registry.create(1);
    const second = registry.create(2);
    registry.terminate(first.sessionId, "replaced");
    registry.terminate(second.sessionId, "expired");
    expect(registry.terminalCount).toBe(1);
    expect(registry.resolve(first.sessionId)).toEqual({ kind: "missing" });
    expect(registry.resolve(second.sessionId)).toMatchObject({
      kind: "terminal",
      state: "expired",
    });
  });
});

describe("bridge service and HTTP policy boundary", () => {
  it("normalizes status while omitting managed filesystem details", async () => {
    const service = new BridgeService({
      buildInfo,
      lifecycle: new FakeLifecycle(),
      qrAdapter: new FqgateQrAdapter({
        baseUrl: "http://127.0.0.1:17281",
        http: new QueueTransport([]),
      }),
      qrRegistry: new QrFlowRegistry(),
    });

    const status = await service.status();
    expect(status.fqgate.process).toMatchObject({ state: "running", running: true, pid: 10 });
    expect(status.fqgate.health).toMatchObject({
      available: true,
      networkReady: true,
      connected: false,
      session: "login_required",
    });
    expect(JSON.stringify(status)).not.toContain("C:\\FQGate\\fqgate.exe");
  });

  it("returns an opaque session and never includes the upstream flow id", async () => {
    const transport = new QueueTransport([
      response({
        code: 0,
        message: "ok",
        data: {
          flow_id: 99,
          qr_image_base64: "aGVsbG8=",
          qr_media_type: "image/png",
          status: "waiting_for_scan",
        },
      }),
      response({ code: 0, message: "ok", data: { connected: true, login_method: "formal" } }),
    ]);
    const service = new BridgeService({
      buildInfo,
      lifecycle: new FakeLifecycle(),
      qrAdapter: new FqgateQrAdapter({ baseUrl: "http://127.0.0.1:17281", http: transport }),
      qrRegistry: new QrFlowRegistry({ idFactory: () => "11111111-1111-4111-8111-111111111111" }),
    });
    const began = await service.beginQr();
    expect(JSON.stringify(began)).not.toContain("99");
    expect(began.qr.imageBase64).toBe("aGVsbG8=");
    await expect(service.pollQr(began.sessionId)).resolves.toMatchObject({
      status: "connected",
      connected: true,
    });
    await expect(service.pollQr(began.sessionId)).rejects.toMatchObject({
      code: "QR_FLOW_INVALID",
    });
  });

  it("allows exact routes, rejects unknown/raw paths, enforces body limits, and emits safe headers", async () => {
    const logs: string[] = [];
    const service = new BridgeService({
      buildInfo,
      lifecycle: new FakeLifecycle(),
      qrAdapter: new FqgateQrAdapter({
        baseUrl: "http://127.0.0.1:17281",
        http: new QueueTransport([]),
      }),
      qrRegistry: new QrFlowRegistry(),
    });
    const handler = createBridgeHttpHandler({
      service,
      logger: new StructuredLogger({ level: "warn", sink: (line) => logs.push(line) }),
      requestIdFactory: () => "request-test-id",
    });
    const version = await handler(new Request("http://127.0.0.1/api/v1/version"));
    expect(version.status).toBe(200);
    expect(version.headers.get("x-content-type-options")).toBe("nosniff");
    expect(version.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(version.headers.get("access-control-allow-origin")).toBeNull();

    const unknown = await handler(new Request("http://127.0.0.1/api/v1/unknown"));
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The bridge route was not found.",
        requestId: "request-test-id",
      },
    });

    const raw = await handler(new Request("http://127.0.0.1/v1/market/health"));
    expect(raw.status).toBe(404);
    const discoveredButUnregistered = await handler(
      new Request("http://127.0.0.1/v1/new/unregistered"),
    );
    expect(discoveredButUnregistered.status).toBe(404);
    const wrongMethod = await handler(
      new Request("http://127.0.0.1/api/v1/status", { method: "POST" }),
    );
    expect(wrongMethod.status).toBe(405);

    const tooLarge = await handler(
      new Request("http://127.0.0.1/api/v1/session/qr/poll", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "5000" },
        body: "{}",
      }),
    );
    expect(tooLarge.status).toBe(413);
    await expect(tooLarge.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });

    await handler(
      new Request("http://127.0.0.1/api/v1/session/qr/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "11111111-1111-4111-8111-111111111111" }),
      }),
    );
    expect(logs.join("\n")).not.toContain("11111111-1111-4111-8111-111111111111");
  });
});

class QueueTransport implements HttpTransport {
  readonly requests: Array<{ readonly url: string; readonly options: HttpRequestOptions }> = [];
  private readonly queue: Array<HttpResponse | Error>;

  constructor(queue: Array<HttpResponse | Error>) {
    this.queue = queue;
  }

  async request(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    this.requests.push({ url, options });
    const next = this.queue.shift();
    if (next === undefined) throw new Error("fake HTTP queue exhausted");
    if (next instanceof Error) throw next;
    return next;
  }
}

class FakeLifecycle {
  readonly status = vi.fn(async (): Promise<FqgateStatus> => ({
    lifecycle: "ready",
    process: { state: "running", pid: 10, expectedPath: "C:\\FQGate\\fqgate.exe" },
    installed: {
      path: "C:\\FQGate\\fqgate.exe",
      size: 1,
      sha256: "a".repeat(64),
      version: "1.0.0",
      compatibility: {
        version: "1.0.0",
        status: "validated",
        supported: true,
        validated: true,
        reason: "test",
      },
    },
    compatibility: {
      version: "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "test",
    },
    health: {
      endpoint: "http://127.0.0.1:17281/v1/market/health",
      checkedAt: "2026-09-16T00:00:00.000Z",
      available: true,
      validPayload: true,
      httpStatus: 200,
      networkReady: true,
      connected: false,
      session: "login_required",
      level2Permission: null,
      diagnostics: {},
    },
  }));
}

function response(value: unknown, status = 200): HttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(value)),
  };
}
