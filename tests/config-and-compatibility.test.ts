import { describe, expect, it } from "vitest";
import {
  DEFAULT_FQGATE_BASE_URL,
  parseConfig,
  validateLoopbackBaseUrl,
} from "../src/config/config.js";
import { CompatibilityPolicy } from "../src/fqgate/compatibility/policy.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";
import { StructuredLogger } from "../src/shared/logger.js";
import { REDACTED, Redactor } from "../src/shared/redaction.js";

describe("configuration", () => {
  it("retains safe loopback and per-user defaults", () => {
    const config = parseConfig({}, { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" }, "win32");

    expect(config.fqgateBaseUrl).toBe(DEFAULT_FQGATE_BASE_URL);
    expect(config.installDirectory).toBe("C:\\Users\\tester\\AppData\\Local\\FQGateRemoteBridge");
    expect(config.manifestUrl).toContain("raw.githubusercontent.com/zhuyifang/fqgate-releases");
  });

  it.each([
    ["remote base URL", { fqgateBaseUrl: "http://192.168.1.10:17281" }],
    ["credentials in base URL", { fqgateBaseUrl: "http://user:pass@127.0.0.1:17281" }],
    ["remote manifest", { manifestUrl: "https://example.com/stable.json" }],
    ["bad compatibility range", { compatibility: { supportedRange: "latest" } }],
    ["bad download timeout", { download: { timeoutMs: 10 } }],
    ["unknown key", { futureFeature: true }],
  ])("rejects %s", (_name, input) => {
    expect(() => parseConfig(input)).toThrowError(BridgeError);
    try {
      parseConfig(input);
    } catch (error) {
      expect((error as BridgeError).code).toBe(ERROR_CODES.CONFIG_INVALID);
    }
  });

  it("accepts only literal loopback hosts for the local health boundary", () => {
    expect(validateLoopbackBaseUrl("http://127.0.0.1:17281")).toBe(DEFAULT_FQGATE_BASE_URL);
    expect(validateLoopbackBaseUrl("http://localhost:17281")).toBe("http://localhost:17281");
    expect(() => validateLoopbackBaseUrl("http://10.0.0.5:17281")).toThrowError(BridgeError);
  });
});

describe("compatibility policy", () => {
  const policy = new CompatibilityPolicy({
    supportedRange: ">=1.0.0 <2.0.0",
    validatedVersions: ["1.0.0"],
  });

  it("marks the validated baseline as activatable", () => {
    const result = policy.evaluate("1.0.0");
    expect(result.status).toBe("validated");
    expect(policy.assertActivatable("1.0.0").validated).toBe(true);
  });

  it("distinguishes a supported but unvalidated release", () => {
    const result = policy.evaluate("1.1.0");
    expect(result.status).toBe("supported_unvalidated");
    expect(result.supported).toBe(true);
    expect(() => policy.assertActivatable("1.1.0")).toThrowError(/not approved/);
  });

  it("fails closed for unsupported and pinned-mismatch versions", () => {
    expect(policy.evaluate("2.0.0").status).toBe("unsupported");
    expect(policy.evaluate("not-a-version").status).toBe("unsupported");

    const pinned = new CompatibilityPolicy({
      supportedRange: ">=1.0.0 <2.0.0",
      validatedVersions: ["1.0.0", "1.1.0"],
      pinnedVersion: "1.0.0",
    });
    expect(pinned.evaluate("1.1.0").status).toBe("pinned_mismatch");
    expect(() => pinned.assertActivatable("1.1.0")).toThrowError(BridgeError);
  });
});

describe("redaction and structured logging", () => {
  it("redacts sensitive keys, bearer values, and configured keys", () => {
    const redactor = new Redactor({ sensitiveKeys: ["privateValue"] });
    const result = redactor.redact({
      authorization: "Bearer very-secret",
      privateValue: "custom-secret",
      nested: { password: "pw", status: "ready" },
      message: "authorization=also-secret",
    }) as Record<string, unknown>;

    expect(result.authorization).toBe(REDACTED);
    expect(result.privateValue).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>).password).toBe(REDACTED);
    expect(result.message).toContain(REDACTED);
  });

  it("emits redacted JSON structured records", () => {
    const lines: string[] = [];
    const logger = new StructuredLogger({
      level: "debug",
      sink: (line) => lines.push(line),
      now: () => "2026-09-16T00:00:00.000Z",
    });
    logger.info("test", { authorization: "Bearer secret", component: "fqgate" });

    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      timestamp: "2026-09-16T00:00:00.000Z",
      level: "info",
      message: "test",
      context: { authorization: REDACTED, component: "fqgate" },
    });
  });
});
