import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  CloudflareAccessJwtVerifier,
  CloudflareAccessMachineJwtVerifier,
} from "../src/bridge/auth/cloudflare-access.js";
import { BridgeService } from "../src/bridge/service.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import {
  assertOperationAllowedForContext,
  authenticateRequestContext,
  classifyHost,
  CLOUDFLARE_ACCESS_ASSERTION_HEADER,
  isRegisteredBridgeOperation,
  type MachineAccessVerifier,
} from "../src/bridge/policy/request-context.js";
import { listBridgeOperations } from "../src/bridge/policy/registry.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import { parseConfig } from "../src/config/config.js";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type { BuildInfo } from "../src/shared/build-info.js";
import { ERROR_CODES } from "../src/shared/errors.js";

const nowMs = 1_700_000_000_000;
const nowSeconds = Math.floor(nowMs / 1_000);
const issuer = "https://team.cloudflareaccess.com";
const machineAudience = "machine-audience";
const adminAudience = "admin-audience";

describe("Phase 5-A machine configuration and host isolation", () => {
  it("accepts complete machine metadata without accepting credentials", () => {
    const config = parseConfig({
      remoteAccess: {
        remoteHostname: "human.example.com",
        adminHostname: "admin.example.com",
        machineHostname: "api.example.com",
        adminAccess: { teamDomain: "team.cloudflareaccess.com", audience: adminAudience },
        machineAccess: { teamDomain: "team.cloudflareaccess.com", audience: machineAudience },
      },
    });

    expect(config.remoteAccess).toMatchObject({
      remoteHostname: "human.example.com",
      adminHostname: "admin.example.com",
      machineHostname: "api.example.com",
      machineAccess: { teamDomain: "team.cloudflareaccess.com", audience: machineAudience },
    });
    expect(JSON.stringify(config)).not.toContain("Client-Secret");
  });

  it.each([
    ["human/admin", { remoteHostname: "same.example.com", adminHostname: "same.example.com" }],
    ["human/machine", { remoteHostname: "same.example.com", machineHostname: "same.example.com" }],
    ["admin/machine", { adminHostname: "same.example.com", machineHostname: "same.example.com" }],
  ])("rejects %s hostname collisions", (_name, hostnames) => {
    expect(() => parseConfig({ remoteAccess: hostnames })).toThrowError(/must be distinct/);
  });

  it.each([
    ["machine hostname without access", { machineHostname: "api.example.com" }],
    [
      "machine access without hostname",
      { machineAccess: { teamDomain: "team.cloudflareaccess.com", audience: machineAudience } },
    ],
    [
      "incomplete machine access",
      { machineHostname: "api.example.com", machineAccess: { audience: machineAudience } },
    ],
    [
      "invalid machine team domain",
      {
        machineHostname: "api.example.com",
        machineAccess: { teamDomain: "evil.example.com", audience: machineAudience },
      },
    ],
    [
      "invalid machine audience",
      {
        machineHostname: "api.example.com",
        machineAccess: { teamDomain: "team.cloudflareaccess.com", audience: "bad audience" },
      },
    ],
  ])("rejects %s", (_name, remoteAccess) => {
    expect(() => parseConfig({ remoteAccess })).toThrowError();
  });

  it("rejects a machine audience reused from the administrator application", () => {
    expect(() =>
      parseConfig({
        remoteAccess: {
          adminHostname: "admin.example.com",
          machineHostname: "api.example.com",
          adminAccess: { teamDomain: "team.cloudflareaccess.com", audience: adminAudience },
          machineAccess: { teamDomain: "team.cloudflareaccess.com", audience: adminAudience },
        },
      }),
    ).toThrowError(/audience.*distinct/);
  });

  it("classifies only the exact machine host and ignores forwarding metadata", async () => {
    const options = {
      remoteHostname: "human.example.com",
      adminHostname: "admin.example.com",
      machineHostname: "api.example.com",
    } as const;
    expect(classifyHost("api.example.com", options)).toBe("remote_machine");
    expect(classifyHost("api.example.com:443", options)).toBe("unknown");
    expect(classifyHost("unknown.example.com", options)).toBe("unknown");
    expect(
      classifyHost("same.example.com", {
        remoteHostname: "same.example.com",
        machineHostname: "same.example.com",
      }),
    ).toBe("unknown");

    const request = new Request("https://unknown.example.com/api/v1/version", {
      headers: {
        host: "unknown.example.com",
        "x-forwarded-host": "api.example.com",
        [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "not-used",
      },
    });
    await expect(
      authenticateRequestContext(request, {
        ...options,
        machineVerifier: machineVerifier(),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.HOST_NOT_ALLOWED });
  });
});

describe("Phase 5-A machine service-token JWT profile", () => {
  it("accepts a valid RS256 application token and returns only a machine principal", async () => {
    const key = await makeKey("machine-key");
    const fetcher = keySetFetcher(key.publicJwk);
    const verifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher,
      nowMs: () => nowMs,
    });
    const token = await signMachineToken(key.privateKey, {
      kid: "machine-key",
      commonName: "market-reader",
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      kind: "machine",
      subject: "market-reader",
      audience: machineAudience,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it.each([
    ["malformed", "not-a-jwt"],
    ["missing assertion", ""],
  ])("rejects %s without echoing assertion material", async (_name, token) => {
    const verifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher: async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }),
      nowMs: () => nowMs,
    });
    await expect(verifier.verify(token)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
      message: "The Cloudflare Access assertion could not be validated",
    });
  });

  it("rejects non-RS256, bad signature, issuer, audience, and multiple audience", async () => {
    const key = await makeKey("machine-key");
    const wrongKey = await makeKey("machine-key");
    const verifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher: keySetFetcher(key.publicJwk),
      nowMs: () => nowMs,
    });
    const invalidTokens = [
      await signMachineToken(wrongKey.privateKey, { kid: "machine-key", commonName: "reader" }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        tokenIssuer: "https://other.cloudflareaccess.com",
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        tokenAudience: "wrong-audience",
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        tokenAudience: [machineAudience, "unexpected"],
      }),
    ];
    const nonRs256 = await new SignJWT({ type: "app", common_name: "reader" })
      .setProtectedHeader({ alg: "HS256", kid: "machine-key" })
      .setIssuer(issuer)
      .setAudience(machineAudience)
      .setSubject("")
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .sign(new TextEncoder().encode("test-key"));
    invalidTokens.push(nonRs256);

    for (const token of invalidTokens) {
      await expect(verifier.verify(token)).rejects.toMatchObject({
        code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
      });
    }
  });

  it("rejects temporal, type, sub, and common_name profile violations", async () => {
    const key = await makeKey("machine-key");
    const verifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher: keySetFetcher(key.publicJwk),
      nowMs: () => nowMs,
    });
    const invalidTokens = [
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        expiration: nowSeconds - 1,
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        notBefore: nowSeconds + 30,
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        issuedAt: nowSeconds + 30,
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        type: "human",
      }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "reader",
        subject: "non-empty",
      }),
      await signMachineToken(key.privateKey, { kid: "machine-key", commonName: undefined }),
      await signMachineToken(key.privateKey, { kid: "machine-key", commonName: "" }),
      await signMachineToken(key.privateKey, { kid: "machine-key", commonName: "   " }),
      await signMachineToken(key.privateKey, {
        kid: "machine-key",
        commonName: "x".repeat(257),
      }),
    ];
    for (const token of invalidTokens) {
      await expect(verifier.verify(token)).rejects.toMatchObject({
        code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
      });
    }
  });

  it("supports bounded cache reuse, one key-rotation refresh, and JWK failure denial", async () => {
    const first = await makeKey("first-key");
    const second = await makeKey("second-key");
    let current: JWK = first.publicJwk;
    let clock = nowMs;
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ keys: [current] }), { status: 200 }),
    );
    const verifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher,
      nowMs: () => clock,
      cacheTtlMs: 100,
    });
    const firstToken = await signMachineToken(first.privateKey, {
      kid: "first-key",
      commonName: "reader",
    });
    await verifier.verify(firstToken);
    await verifier.verify(firstToken);
    expect(fetcher).toHaveBeenCalledTimes(1);

    current = second.publicJwk;
    const secondToken = await signMachineToken(second.privateKey, {
      kid: "second-key",
      commonName: "reader",
    });
    await expect(verifier.verify(secondToken)).resolves.toMatchObject({ kind: "machine" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock += 101;
    await verifier.verify(secondToken);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const failed = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher: async () => new Response("unavailable", { status: 503 }),
      nowMs: () => nowMs,
    });
    await expect(failed.verify(firstToken)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
  });

  it("keeps human and machine claim profiles mutually exclusive", async () => {
    const key = await makeKey("shared-key");
    const fetcher = keySetFetcher(key.publicJwk);
    const humanVerifier = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: adminAudience,
      fetcher,
      nowMs: () => nowMs,
    });
    const machineVerifier = new CloudflareAccessMachineJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: machineAudience,
      fetcher,
      nowMs: () => nowMs,
    });
    const humanToken = await signHumanToken(key.privateKey, "operator-1");
    const machineToken = await signMachineToken(key.privateKey, {
      kid: "shared-key",
      commonName: "reader",
    });

    await expect(machineVerifier.verify(humanToken)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
    await expect(humanVerifier.verify(machineToken)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
  });
});

describe("Phase 5-A zero-privilege server policy", () => {
  it("preserves the old zero-privilege matrix alongside the sole Phase 5-B grant", () => {
    const expected: Record<string, Set<string>> = {
      local: new Set(listBridgeOperations().map((operation) => operation.id)),
      remote_human: new Set([
        "bridge.version",
        "bridge.capabilities",
        "bridge.status",
        "session.qr.begin",
        "session.qr.poll",
        "updates.status",
        "openapi.catalog",
      ]),
      remote_admin: new Set(
        listBridgeOperations()
          .filter((operation) => operation.id !== "market.instruments.lookup")
          .map((operation) => operation.id),
      ),
      remote_machine: new Set(["market.instruments.lookup"]),
    };

    for (const context of ["local", "remote_human", "remote_admin", "remote_machine"] as const) {
      for (const operation of listBridgeOperations()) {
        if (expected[context]?.has(operation.id) === true) {
          expect(() => assertOperationAllowedForContext(operation, context)).not.toThrow();
        } else {
          expect(() => assertOperationAllowedForContext(operation, context)).toThrowError(
            expect.objectContaining({ code: ERROR_CODES.OPERATION_FORBIDDEN }),
          );
        }
      }
    }
    expect(
      listBridgeOperations()
        .filter((operation) => operation.id !== "market.instruments.lookup")
        .every((operation) => !operation.allowedContexts.includes("remote_machine")),
    ).toBe(true);
  });

  it("authenticates machine context but forbids safe operations and non-operation routes", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: {
        machineHostname: "api.example.com",
        machineVerifier: machineVerifier(),
      },
    });
    const version = await handler(
      new Request("https://api.example.com/api/v1/version", {
        headers: {
          host: "api.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-machine-assertion",
        },
      }),
    );
    expect(version.status).toBe(403);
    await expect(version.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.OPERATION_FORBIDDEN },
    });

    const raw = await handler(
      new Request("https://api.example.com/v1/market/health", {
        headers: {
          host: "api.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-machine-assertion",
        },
      }),
    );
    expect(raw.status).toBe(404);
    await expect(raw.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.ROUTE_NOT_FOUND },
    });

    expect(isRegisteredBridgeOperation(new Request("https://api.example.com/"))).toBe(false);
    expect(isRegisteredBridgeOperation(new Request("https://api.example.com/assets/app.js"))).toBe(
      false,
    );
    expect(
      isRegisteredBridgeOperation(new Request("https://api.example.com/v1/market/health")),
    ).toBe(false);
  });

  it("denies a valid machine identity for every Phase 5-A operation at the HTTP policy boundary", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: {
        machineHostname: "api.example.com",
        machineVerifier: machineVerifier(),
      },
    });

    for (const operation of listBridgeOperations().filter(
      (operation) => operation.id !== "market.instruments.lookup",
    )) {
      const response = await handler(
        new Request(`https://api.example.com${operation.path}`, {
          method: operation.method,
          headers: {
            host: "api.example.com",
            [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-machine-assertion",
          },
        }),
      );
      expect(response.status, operation.id).toBe(403);
      await expect(response.json(), operation.id).resolves.toMatchObject({
        error: { code: ERROR_CODES.OPERATION_FORBIDDEN },
      });
    }
  });

  it("requires a machine assertion before a machine request can reach policy", async () => {
    await expect(
      authenticateRequestContext(
        new Request("https://api.example.com/api/v1/version", {
          headers: { host: "api.example.com" },
        }),
        { machineHostname: "api.example.com", machineVerifier: machineVerifier() },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACCESS_ASSERTION_REQUIRED });
  });
});

const buildInfo: BuildInfo = {
  name: "fqgate-remote-bridge",
  version: "0.1.0",
  commit: "phase5a-test",
  node: "v22.0.0",
  platform: "linux",
  architecture: "x64",
};

function machineVerifier(): MachineAccessVerifier {
  return {
    audience: machineAudience,
    verify: async () => ({ kind: "machine", subject: "reader", audience: machineAudience }),
  };
}

function createService(): BridgeService {
  return new BridgeService({
    buildInfo,
    lifecycle: new FakeLifecycle(),
    qrAdapter: new FqgateQrAdapter({
      baseUrl: "http://127.0.0.1:17281",
      http: new EmptyTransport(),
    }),
    qrRegistry: new QrFlowRegistry(),
  });
}

class EmptyTransport implements HttpTransport {
  async request(_url: string, _options: HttpRequestOptions): Promise<HttpResponse> {
    throw new Error("fixture transport was not expected to receive a request");
  }
}

class FakeLifecycle {
  readonly status = vi.fn(async (): Promise<FqgateStatus> => ({
    lifecycle: "ready",
    process: { state: "running", pid: 1, expectedPath: "C:\\FQGate\\fqgate.exe" },
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
      checkedAt: "2026-09-19T00:00:00.000Z",
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

async function makeKey(kid: string) {
  const pair = await generateKeyPair("RS256");
  const publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid,
    alg: "RS256",
    use: "sig",
  } as JWK;
  return { privateKey: pair.privateKey, publicJwk };
}

function keySetFetcher(key: JWK) {
  return vi.fn(async () => new Response(JSON.stringify({ keys: [key] }), { status: 200 }));
}

async function signHumanToken(privateKey: Parameters<SignJWT["sign"]>[0], subject: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "shared-key", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(adminAudience)
    .setSubject(subject)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 60)
    .sign(privateKey);
}

async function signMachineToken(
  privateKey: Parameters<SignJWT["sign"]>[0],
  options: {
    readonly kid: string;
    readonly commonName: string | undefined;
    readonly tokenIssuer?: string;
    readonly tokenAudience?: string | string[];
    readonly type?: string;
    readonly subject?: string;
    readonly expiration?: number;
    readonly notBefore?: number;
    readonly issuedAt?: number;
  },
) {
  const claims: Record<string, unknown> = { type: options.type ?? "app" };
  if (options.commonName !== undefined) claims.common_name = options.commonName;
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.kid, typ: "JWT" })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? machineAudience)
    .setSubject(options.subject ?? "")
    .setIssuedAt(options.issuedAt ?? nowSeconds)
    .setExpirationTime(options.expiration ?? nowSeconds + 60);
  if (options.notBefore !== undefined) builder = builder.setNotBefore(options.notBefore);
  return builder.sign(privateKey);
}
