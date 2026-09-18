import { describe, expect, it } from "vitest";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";
import { FqgateOpenApiService } from "../src/fqgate/openapi/service.js";
import { fingerprintJson } from "../src/fqgate/openapi/catalog.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type { RequiredOpenApiContract } from "../src/fqgate/openapi/types.js";

const requiredContracts: readonly RequiredOpenApiContract[] = [
  { id: "health", method: "GET", path: "/v1/market/health", description: "health" },
  { id: "qr-begin", method: "POST", path: "/v1/market/session/qr/begin", description: "begin" },
  { id: "qr-poll", method: "POST", path: "/v1/market/session/qr/poll", description: "poll" },
];

function document(extraPath = "/v1/unrelated") {
  return {
    openapi: "3.0.3",
    info: { title: "FQGate API", version: "1.0.0" },
    paths: {
      "/v1/market/health": {
        get: {
          operationId: "health",
          summary: "Health",
          responses: { "200": { description: "ok" } },
        },
      },
      "/v1/market/session/qr/begin": {
        post: { operationId: "qrBegin", responses: { "200": { description: "ok" } } },
      },
      "/v1/market/session/qr/poll": {
        post: { operationId: "qrPoll", responses: { "200": { description: "ok" } } },
      },
      [extraPath]: {
        get: {
          operationId: "unrelated",
          tags: ["new"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
}

class QueueTransport implements HttpTransport {
  readonly requests: Array<{ readonly url: string; readonly options: HttpRequestOptions }> = [];

  constructor(private readonly responses: Array<HttpResponse | Error>) {}

  async request(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    this.requests.push({ url, options });
    const response = this.responses.shift();
    if (response === undefined) throw new Error("HTTP queue exhausted");
    if (response instanceof Error) throw response;
    return response;
  }
}

function response(value: unknown): HttpResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(value)),
  };
}

describe("runtime FQGate OpenAPI service", () => {
  it("fetches only the fixed loopback endpoint, validates, fingerprints, and caches", async () => {
    let nowMs = 1_000;
    const transport = new QueueTransport([response(document())]);
    const service = new FqgateOpenApiService({
      http: transport,
      ttlMs: 100,
      now: () => new Date(nowMs).toISOString(),
      nowMs: () => nowMs,
    });

    const first = await service.getSnapshot();
    const second = await service.getSnapshot();
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toBe("http://127.0.0.1:17281/openapi.json");
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.cacheHit).toBe(true);
    nowMs += 101;
    await expect(service.getSnapshot()).rejects.toMatchObject({
      code: ERROR_CODES.OPENAPI_FETCH_FAILED,
    });
  });

  it("keeps fingerprints deterministic when JSON object key order changes", () => {
    expect(fingerprintJson({ b: 2, a: { d: true, c: 1 } })).toBe(
      fingerprintJson({ a: { c: 1, d: true }, b: 2 }),
    );
  });

  it("reports added, removed, and changed operations without treating unrelated additions as incompatible", async () => {
    const changed = document("/v1/new");
    changed.paths["/v1/market/health"].get.summary = "Changed health";
    const transport = new QueueTransport([
      response(document()),
      response(changed),
      response(changed),
    ]);
    const service = new FqgateOpenApiService({ http: transport, ttlMs: 0 });
    await service.getSnapshot();
    const snapshot = await service.refresh();
    expect(snapshot.changes.added.map((operation) => operation.key)).toContain("GET /v1/new");
    expect(snapshot.changes.removed.map((operation) => operation.key)).toContain(
      "GET /v1/unrelated",
    );
    expect(snapshot.changes.changed.map((operation) => operation.key)).toContain(
      "GET /v1/market/health",
    );
    await expect(service.assertRequiredContracts(requiredContracts)).resolves.toBeDefined();
  });

  it("fails closed for malformed, oversized, timed-out, and missing-contract responses", async () => {
    const malformed = new QueueTransport([
      { status: 200, headers: {}, body: Buffer.from("not json") },
    ]);
    await expect(new FqgateOpenApiService({ http: malformed }).getSnapshot()).rejects.toMatchObject(
      {
        code: ERROR_CODES.OPENAPI_INVALID,
      },
    );

    const unsupported = new QueueTransport([
      response({ ...document(), openapi: "2.0", paths: {} }),
    ]);
    await expect(
      new FqgateOpenApiService({ http: unsupported }).getSnapshot(),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPENAPI_INVALID,
    });

    const oversized = new QueueTransport([
      new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "HTTP response exceeds configured size limit"),
    ]);
    await expect(new FqgateOpenApiService({ http: oversized }).getSnapshot()).rejects.toMatchObject(
      {
        code: ERROR_CODES.OPENAPI_RESPONSE_TOO_LARGE,
      },
    );

    const oversizedBody = new QueueTransport([
      { status: 200, headers: {}, body: Buffer.alloc(32, 65) },
    ]);
    await expect(
      new FqgateOpenApiService({ http: oversizedBody, maxBytes: 16 }).getSnapshot(),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPENAPI_RESPONSE_TOO_LARGE });

    const timedOut = new QueueTransport([
      new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "HTTP request timed out"),
    ]);
    await expect(new FqgateOpenApiService({ http: timedOut }).getSnapshot()).rejects.toMatchObject({
      code: ERROR_CODES.OPENAPI_FETCH_FAILED,
    });

    const delayed: HttpTransport = {
      async request() {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return response(document());
      },
    };
    await expect(
      new FqgateOpenApiService({ http: delayed, timeoutMs: 5 }).getSnapshot(),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPENAPI_FETCH_FAILED });

    const missing = new QueueTransport([
      response({ ...document(), paths: { "/v1/unrelated": document().paths["/v1/unrelated"] } }),
    ]);
    const service = new FqgateOpenApiService({ http: missing });
    await expect(service.assertRequiredContracts(requiredContracts)).rejects.toMatchObject({
      code: ERROR_CODES.OPENAPI_CONTRACT_MISSING,
    });
  });

  it("keeps upstream-only operations separate from explicit bridge operations", async () => {
    const service = new FqgateOpenApiService({ http: new QueueTransport([response(document())]) });
    const catalog = await service.catalog(
      [
        {
          id: "session.qr.begin",
          method: "POST",
          path: "/api/v1/session/qr/begin",
          classification: "session_maintenance",
          intent: "session_maintenance",
          allowedContexts: ["local"],
          requiresConfirmation: false,
          requiredCompatibility: "validated",
          documentationVisible: true,
          upstream: { method: "POST", path: "/v1/market/session/qr/begin" },
        },
      ],
      requiredContracts,
    );
    expect(catalog.bridgeOperations).toHaveLength(1);
    expect(catalog.upstreamOnlyOperations.map((operation) => operation.key)).toContain(
      "GET /v1/market/health",
    );
    expect(catalog.upstreamOnlyOperations.map((operation) => operation.key)).toContain(
      "GET /v1/unrelated",
    );
  });

  it("invalidates the cache explicitly without accepting a caller-selected endpoint", async () => {
    const transport = new QueueTransport([response(document()), response(document())]);
    const service = new FqgateOpenApiService({ http: transport, ttlMs: 60_000 });
    await service.getSnapshot();
    service.invalidate();
    await service.getSnapshot();
    expect(transport.requests).toHaveLength(2);
    expect(
      transport.requests.every((request) => request.url === "http://127.0.0.1:17281/openapi.json"),
    ).toBe(true);
  });
});
