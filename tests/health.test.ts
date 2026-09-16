import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FqgateHealthProbe, normalizeSessionState } from "../src/fqgate/health/probe.js";
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

function probeFor(name: string): FqgateHealthProbe {
  return new FqgateHealthProbe({
    baseUrl: "http://127.0.0.1:17281",
    http: new HealthHttp({ status: 200, headers: {}, body: fixture(name) }),
    now: () => "2026-09-16T00:00:00.000Z",
    sleep: async () => undefined,
  });
}

describe("FQGate health normalization", () => {
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

  it("reports unavailable and malformed health responses without treating them as login state", async () => {
    const unavailable = new FqgateHealthProbe({
      baseUrl: "http://127.0.0.1:17281",
      http: new HealthHttp(new Error("connection refused")),
      sleep: async () => undefined,
    });
    const unavailableResult = await unavailable.probe();
    expect(unavailableResult.available).toBe(false);
    expect(unavailableResult.session).toBe("unknown");

    const malformed = await probeFor("health-malformed").probe();
    expect(malformed.available).toBe(true);
    expect(malformed.validPayload).toBe(false);
    expect(malformed.session).toBe("unknown");
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
