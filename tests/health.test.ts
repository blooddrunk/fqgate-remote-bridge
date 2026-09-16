import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFqgateResponseEnvelope } from "../src/fqgate/http/envelope.js";
import { FqgateHealthProbe, normalizeSessionState } from "../src/fqgate/health/probe.js";
import { BridgeError } from "../src/shared/errors.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";

class HealthHttp implements HttpTransport {
  private readonly next: HttpResponse | Error;

  constructor(next: HttpResponse | Error) {
    this.next = next;
  }

  async request(_url: string, _options: HttpRequestOptions): Promise<HttpResponse> {
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

function fixture(name: string): Uint8Array {
  return Buffer.from(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
}

function fixtureJson(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as unknown;
}

function probeFor(name: string, status = 200): FqgateHealthProbe {
  return new FqgateHealthProbe({
    baseUrl: "http://127.0.0.1:17281",
    http: new HealthHttp({ status, headers: {}, body: fixture(name) }),
    now: () => "2026-09-16T00:00:00.000Z",
    sleep: async () => undefined,
  });
}

describe("FQGate health normalization", () => {
  it("decodes the common FQGate response envelope before endpoint normalization", () => {
    const decoded = decodeFqgateResponseEnvelope<{ status: string }>(
      fixtureJson("health-connected"),
    );

    expect(decoded.code).toBe(0);
    expect(decoded.message).toBe("ok");
    expect(decoded.data).toEqual(expect.objectContaining({ status: "connected" }));
  });

  it("redacts and bounds upstream error messages at the envelope boundary", () => {
    try {
      decodeFqgateResponseEnvelope({
        code: 3014,
        message: "authorization=secret-value",
        data: null,
      });
      throw new Error("expected non-zero upstream code to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeError);
      expect((error as BridgeError).details).toEqual({
        upstreamCode: 3014,
        upstreamMessage: "authorization=[REDACTED]",
      });
      expect((error as BridgeError).message).not.toContain("secret-value");
    }
  });

  it("keeps process, network, and authenticated session concepts distinct", async () => {
    const health = await probeFor("health-connected").probe();
    expect(health.available).toBe(true);
    expect(health.validPayload).toBe(true);
    expect(health.networkReady).toBe(true);
    expect(health.session).toBe("connected");
    expect(health.activeSubscriptions).toBe(1);
  });

  it("normalizes only explicit guest and login-required observations", async () => {
    expect((await probeFor("health-guest").probe()).session).toBe("guest");
    expect((await probeFor("health-login-required").probe()).session).toBe("login_required");
    expect((await probeFor("health-network-not-ready").probe()).session).toBe("unknown");
    expect((await probeFor("health-network-not-ready").probe()).networkReady).toBe(false);
    expect(normalizeSessionState({ connected: false, network_ready: true })).toBe("unknown");
  });

  it("fails closed for malformed envelopes and invalid health data", async () => {
    for (const name of [
      "health-null-data",
      "health-missing-data",
      "health-envelope-malformed",
      "health-error",
      "health-malformed",
    ]) {
      const result = await probeFor(name).probe();
      expect(result.available, name).toBe(true);
      expect(result.validPayload, name).toBe(false);
      expect(result.session, name).toBe("unknown");
    }

    const upstreamError = await probeFor("health-error").probe();
    expect(upstreamError.reason).toContain("3014");
    expect(upstreamError.diagnostics).toMatchObject({
      upstreamCode: 3014,
      upstreamMessage: "login required",
    });
  });

  it("rejects a non-JSON body and treats HTTP errors as unavailable", async () => {
    const nonJson = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: new HealthHttp({ status: 200, headers: {}, body: Buffer.from("not-json") }),
      sleep: async () => undefined,
    });
    const nonJsonResult = await nonJson.probe();
    expect(nonJsonResult.available).toBe(true);
    expect(nonJsonResult.validPayload).toBe(false);
    expect(nonJsonResult.session).toBe("unknown");

    const httpError = await probeFor("health-error", 503).probe();
    expect(httpError.available).toBe(false);
    expect(httpError.validPayload).toBe(false);
    expect(httpError.httpStatus).toBe(503);
    expect(httpError.session).toBe("unknown");
  });

  it("reports an unavailable health endpoint without treating it as login state", async () => {
    const unavailable = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: new HealthHttp(new Error("connection refused")),
      sleep: async () => undefined,
    });
    const unavailableResult = await unavailable.probe();
    expect(unavailableResult.available).toBe(false);
    expect(unavailableResult.session).toBe("unknown");
  });

  it("times out activation readiness when the endpoint never becomes valid", async () => {
    const probe = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: new HealthHttp({ status: 200, headers: {}, body: fixture("health-malformed") }),
      sleep: async () => undefined,
    });
    await expect(probe.waitUntilReady(0, 1)).rejects.toMatchObject({ code: "HEALTH_TIMEOUT" });
  });
});
