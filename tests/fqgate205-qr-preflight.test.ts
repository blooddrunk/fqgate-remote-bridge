import { describe, expect, it } from "vitest";
import {
  inspectQrPrerequisites,
  QR_CENSUS_CONTRACTS,
} from "../src/fqgate/diagnostics/qr-preflight.js";
import type { HttpTransport } from "../src/fqgate/release/http.js";

// Minimal synthetic census shapes, never evidence of successful QR begin/poll.
function fixture(
  options: {
    count?: number;
    connected?: number;
    mutate?: string;
    invalid?: unknown;
    badBody?: Uint8Array;
    oversized?: boolean;
    timeout?: boolean;
    failPath?: string;
  } = {},
) {
  const calls: { url: string; method: string | undefined }[] = [];
  let inventoryReads = 0,
    contractReads = 0,
    versionReads = 0;
  const document = {
    paths: Object.fromEntries(
      QR_CENSUS_CONTRACTS.map(([path]) => [
        path,
        Object.fromEntries(
          QR_CENSUS_CONTRACTS.filter(([p]) => p === path).map(([, method]) => [
            method,
            {
              requestBody: { schema: { $ref: "#/components/schemas/AuthenticationRequest" } },
              responses: {
                "200": { schema: { $ref: "#/components/schemas/AuthenticationResult" } },
                "400": { example: { code: 1003 } },
              },
            },
          ]),
        ),
      ]),
    ),
    components: {
      schemas: {
        AuthenticationRequest: {
          oneOf: ["app_qr_begin", "app_qr_poll"].map((action) => ({
            properties: { action: { const: action } },
          })),
        },
        AuthenticationResult: {
          properties: { data: { properties: { status: { type: "string" } } } },
        },
      },
    },
  };
  const http: HttpTransport = {
    async request(url, request) {
      calls.push({ url, method: request.method });
      expect(request.method).toBe("GET");
      expect(request.body).toBeUndefined();
      expect(request.redirect).toBe("error");
      expect(request.timeoutMs).toBeGreaterThan(0);
      expect(request.timeoutMs).toBeLessThanOrEqual(5000);
      const path = new URL(url).pathname;
      if (options.timeout || path === options.failPath) throw Error("sensitive upstream error");
      let value: unknown;
      if (path === "/v2/system/version") {
        versionReads++;
        value = {
          version: versionReads > 1 && options.mutate === "version" ? "2.0.6" : "2.0.5",
          product: "FQGate",
          api_version: "2.0",
          platform: "windows",
          architecture: "x86_64",
        };
      } else if (path === "/v2/system/health") value = { status: "ready" };
      else if (path === "/openapi.json") {
        contractReads++;
        value =
          contractReads > 1 && options.mutate === "contract"
            ? { ...document, components: { schemas: {} } }
            : document;
      } else if (path === "/v2/source-instances") {
        inventoryReads++;
        value = {
          instances: Array.from({ length: options.count ?? 2 }, (_, i) => ({
            instanceId: `private-instance-${i}`,
            instanceNo: i,
            providerId: "tonghuashun",
            workerState: "ready",
            pid: inventoryReads > 1 && options.mutate === "pid" ? 999 : i + 1,
            restartCount: inventoryReads > 1 && options.mutate === "restart" ? 1 : 0,
            session: {
              state: Object.hasOwn(options, "invalid")
                ? options.invalid
                : i < (options.connected ?? 1)
                  ? "connected"
                  : "disconnected",
            },
          })),
        };
      } else if (path.endsWith("/account")) {
        const i = Number(path.split("/")[3]!.split("-").at(-1));
        value = {
          descriptor: { session_supported: true },
          snapshot: {
            state: i < (options.connected ?? 1) ? "connected" : "disconnected",
            account_display:
              inventoryReads > 1 && options.mutate === "account"
                ? "changed-private-account"
                : "private-account",
            observed_at: inventoryReads,
          },
        };
      } else if (path.endsWith("/authentication")) value = { modes: ["app_qr"] };
      else throw Error("Unexpected request");
      return {
        status: 200,
        headers: {},
        body:
          options.badBody ??
          (options.oversized
            ? new Uint8Array(4 * 1024 * 1024 + 1)
            : new TextEncoder().encode(JSON.stringify(value))),
      };
    },
  };
  return { http, calls };
}
async function run(options: Parameters<typeof fixture>[0] = {}) {
  const f = fixture(options);
  const gates = await inspectQrPrerequisites({ http: f.http });
  expect(JSON.stringify(gates)).not.toMatch(/private-instance|private-account|sensitive upstream/);
  expect(gates.find((g) => g.id === "QR_CONTRACT")?.status).toBe("BLOCKED");
  expect(gates.find((g) => g.id === "LIVE_QR")?.status).toBe("NOT_EXECUTED");
  return { gates, calls: f.calls };
}
describe("2.0.5 read-only QR preflight", () => {
  it("reports two QR-capable sources as ambiguous even if only one is connected", async () => {
    const { gates, calls } = await run();
    expect(gates.find((g) => g.id === "QR_SOURCE_SELECTION")?.reason).toBe(
      "AMBIGUOUS_ELIGIBLE_SOURCES",
    );
    expect(gates.find((g) => g.id === "QR_CONTRACT")?.evidence).toMatchObject({
      statusEnumDeclared: false,
      expiredErrorDeclared: false,
      replacedErrorDeclared: false,
      adapterImplemented: true,
      staticClientVerified: false,
    });
    expect(gates.find((g) => g.id === "SOURCE_ACCOUNT_CONTINUITY")?.status).toBe("PASS");
    expect(
      calls.every((c) => c.method === "GET" && c.url.startsWith("http://127.0.0.1:17281/")),
    ).toBe(true);
  });
  it("accepts a uniquely eligible disconnected source only as observation, never QR readiness", async () => {
    const { gates } = await run({ count: 1, connected: 0 });
    expect(gates.find((g) => g.id === "QR_SOURCE_SELECTION")?.status).toBe("PASS");
  });
  it("reports absent sources", async () => {
    const { gates } = await run({ count: 0 });
    expect(gates.find((g) => g.id === "QR_SOURCE_SELECTION")?.reason).toBe("NO_ELIGIBLE_SOURCE");
  });
  it.each(["pid", "restart", "account"])("detects %s drift", async (mutate) => {
    const { gates } = await run({ mutate });
    expect(gates.find((g) => g.id === "SOURCE_ACCOUNT_CONTINUITY")?.status).toBe("BLOCKED");
  });
  it.each(["version", "contract"])("detects %s drift", async (mutate) => {
    const { gates } = await run({ mutate });
    expect(gates.find((g) => g.id === "PROTOCOL_CONTINUITY")?.status).toBe("BLOCKED");
  });
  it.each([
    { invalid: ["connected"] },
    { invalid: 1 },
    { invalid: "unexpected" },
    { invalid: null },
  ])("rejects invalid state %j", async ({ invalid }) => {
    const { gates } = await run({ invalid });
    expect(gates.find((g) => g.id === "SOURCE_ACCOUNT_CONTINUITY")?.status).toBe("BLOCKED");
  });
  it.each([
    new Uint8Array([0xc3, 0x28]),
    new TextEncoder().encode("{bad"),
    new TextEncoder().encode("[]"),
    new TextEncoder().encode("null"),
  ])("rejects invalid UTF8/JSON/type", async (badBody) => {
    const { gates } = await run({ badBody });
    expect(gates.some((g) => g.status === "PASS")).toBe(false);
  });
  it("rejects oversized responses", async () => {
    const { gates } = await run({ oversized: true });
    expect(gates.some((g) => g.status === "PASS")).toBe(false);
  });
  it("does not retry or mutate on timeout", async () => {
    const { gates, calls } = await run({ timeout: true });
    expect(gates.some((g) => g.status === "PASS")).toBe(false);
    expect(calls.length).toBeLessThanOrEqual(4);
  });
  it("rejects excessive inventory before making account requests", async () => {
    const { calls } = await run({ count: 17 });
    expect(calls.some((c) => c.url.endsWith("/account"))).toBe(false);
  });
});
