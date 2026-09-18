import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import { CloudflareAccessJwtVerifier } from "../src/bridge/auth/cloudflare-access.js";
import {
  AdminConfirmationService,
  type AdminConfirmationBinding,
} from "../src/bridge/admin/confirmation.js";
import { BridgeService } from "../src/bridge/service.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import {
  authenticateRequestContext,
  assertOperationAllowedForContext,
  BRIDGE_ADMIN_INTENT_HEADER,
  BRIDGE_ADMIN_INTENT_VALUE,
  classifyHost,
  CLOUDFLARE_ACCESS_ASSERTION_HEADER,
  type AdminAccessVerifier,
} from "../src/bridge/policy/request-context.js";
import { listBridgeOperations } from "../src/bridge/policy/registry.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import { parseConfig } from "../src/config/config.js";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";
import type { FqgateOpenApiServicePort } from "../src/fqgate/openapi/service.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type { BuildInfo } from "../src/shared/build-info.js";
import { ERROR_CODES } from "../src/shared/errors.js";
import { StructuredLogger } from "../src/shared/logger.js";
import type { FqgateUpdateServicePort, UpdateStatusView } from "../src/fqgate/update/service.js";
import type { UpdateApplyConfirmationResponse } from "../src/bridge/contracts.js";

const buildInfo: BuildInfo = {
  name: "fqgate-remote-bridge",
  version: "0.1.0",
  commit: "phase45-test",
  node: "v22.0.0",
  platform: "linux",
  architecture: "x64",
};

describe("Phase 4.5A request contexts and orthogonal operation policy", () => {
  it("classifies a distinct admin hostname and rejects forwarding-header privilege spoofing", () => {
    const options = {
      remoteHostname: "human.example.com",
      adminHostname: "admin.example.com",
    } as const;
    expect(classifyHost("human.example.com", options)).toBe("remote_human");
    expect(classifyHost("admin.example.com", options)).toBe("remote_admin");
    expect(classifyHost("unknown.example.com", options)).toBe("unknown");
    expect(classifyHost("admin.example.com:443", options)).toBe("unknown");
    expect(classifyHost("127.0.0.1:17282", options)).toBe("local");
    expect(
      classifyHost("same.example.com", {
        remoteHostname: "same.example.com",
        adminHostname: "same.example.com",
      }),
    ).toBe("unknown");
  });

  it("requires cryptographic admin authentication before recognizing remote_admin", async () => {
    const verifier: AdminAccessVerifier = {
      audience: "admin-audience",
      verify: vi.fn(async (assertion: string) => ({
        kind: "human" as const,
        subject: `subject-for-${assertion}`,
        audience: "admin-audience",
      })),
    };
    const request = new Request("https://admin.example.com/api/v1/capabilities", {
      headers: {
        host: "admin.example.com",
        [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-admin-assertion",
      },
    });
    await expect(
      authenticateRequestContext(request, {
        adminHostname: "admin.example.com",
        adminVerifier: verifier,
      }),
    ).resolves.toMatchObject({
      context: "remote_admin",
      principal: { kind: "human", subject: "subject-for-valid-admin-assertion" },
    });
    expect(verifier.verify).toHaveBeenCalledWith("valid-admin-assertion");

    await expect(
      authenticateRequestContext(
        new Request("https://admin.example.com/api/v1/capabilities", {
          headers: { host: "admin.example.com" },
        }),
        { adminHostname: "admin.example.com", adminVerifier: verifier },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACCESS_ASSERTION_REQUIRED });
  });

  it("keeps the admin context on the Phase 4 safe surface plus the exact 4.5C controls", () => {
    const remoteAdminOperations = listBridgeOperations()
      .filter((operation) => operation.allowedContexts.includes("remote_admin"))
      .map((operation) => operation.id);
    expect(remoteAdminOperations).toEqual([
      "bridge.version",
      "bridge.capabilities",
      "bridge.status",
      "session.qr.begin",
      "session.qr.poll",
      "updates.status",
      "updates.check",
      "updates.plan",
      "updates.apply",
      "openapi.catalog",
      "openapi.refresh",
    ]);
    expect(
      listBridgeOperations().find((operation) => operation.id === "updates.apply")
        ?.requiresConfirmation,
    ).toBe(true);
    expect(
      listBridgeOperations().filter((operation) =>
        operation.allowedContexts.includes("remote_human"),
      ),
    ).toHaveLength(7);
  });

  it("covers the complete context by operation authorization matrix without a future machine context", () => {
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
      remote_admin: new Set(listBridgeOperations().map((operation) => operation.id)),
    };
    for (const context of ["local", "remote_human", "remote_admin"] as const) {
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
    expect(classifyHost("machine.example.com", { remoteHostname: "human.example.com" })).toBe(
      "unknown",
    );
  });

  it("rejects duplicate human/admin host configuration", () => {
    expect(() =>
      parseConfig({
        remoteAccess: {
          remoteHostname: "same.example.com",
          adminHostname: "same.example.com",
          adminAccess: {
            teamDomain: "team.cloudflareaccess.com",
            audience: "admin-audience",
          },
        },
      }),
    ).toThrowError(/must be distinct/);
    expect(() =>
      parseConfig({
        remoteAccess: {
          adminHostname: "admin.example.com",
        },
      }),
    ).toThrowError(/configured together/);
    expect(() =>
      parseConfig({
        remoteAccess: {
          adminHostname: "admin.example.com",
          adminAccess: { teamDomain: "evil.example.com", audience: "admin-audience" },
        },
      }),
    ).toThrowError(/Cloudflare Access team hostname/);
  });

  it("does not let an unknown Host or forwarding headers select admin context", async () => {
    const request = new Request("https://unknown.example.com/api/v1/version", {
      headers: {
        host: "unknown.example.com",
        "x-forwarded-host": "admin.example.com",
        [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-admin-assertion",
      },
    });
    await expect(
      authenticateRequestContext(request, {
        remoteHostname: "human.example.com",
        adminHostname: "admin.example.com",
        adminVerifier: {
          audience: "admin-audience",
          verify: async () => ({
            kind: "human",
            subject: "operator-1",
            audience: "admin-audience",
          }),
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.HOST_NOT_ALLOWED });
  });

  it("enforces Origin and bridge intent for admin controls while preserving local maintenance", async () => {
    const status = makeAdminUpdateStatus();
    const checkForUpdate = vi.fn(async () => status);
    const planInstallOrUpdate = vi.fn(async () => status);
    const applyConfirmed = vi.fn(async () => status);
    const refreshOpenApi = vi.fn(async () => ({
      endpoint: "http://127.0.0.1:17281/openapi.json" as const,
      openapiVersion: "3.1.0" as const,
      info: { title: "FQGate", version: "1.0.0" },
      fetchedAt: "2026-09-17T00:00:00.000Z",
      byteLength: 0,
      fingerprint: "a".repeat(64),
      operations: [],
      changes: { added: [], removed: [], changed: [] },
      cacheHit: false,
    }));
    const lines: string[] = [];
    const handler = createBridgeHttpHandler({
      service: createService({
        updateService: {
          getStatus: async () => status,
          checkForUpdate,
          planInstallOrUpdate,
          applyConfirmed,
        },
        openApiService: {
          refresh: refreshOpenApi,
          catalog: async () => ({
            source: "runtime_fqgate_openapi",
            snapshot: {
              endpoint: "http://127.0.0.1:17281/openapi.json",
              openapiVersion: "3.1.0",
              info: { title: "FQGate", version: "1.0.0" },
              fetchedAt: "2026-09-17T00:00:00.000Z",
              byteLength: 0,
              fingerprint: "a".repeat(64),
              operations: [],
              changes: { added: [], removed: [], changed: [] },
              cacheHit: false,
            },
            bridgeOperations: [],
            upstreamOnlyOperations: [],
            contractCoverage: { required: [], missing: [] },
            note: "test",
          }),
        },
      }),
      requestContext: adminRequestContextOptions(),
      logger: new StructuredLogger({ level: "warn", sink: (line) => lines.push(line) }),
    });

    const missingOrigin = await adminPost(handler, "/api/v1/updates/check", {});
    expect(missingOrigin.status).toBe(403);
    await expect(missingOrigin.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.CSRF_ORIGIN_INVALID },
    });

    const wrongOrigin = await adminPost(
      handler,
      "/api/v1/updates/check",
      {},
      {
        origin: "https://evil.example.com",
        [BRIDGE_ADMIN_INTENT_HEADER]: BRIDGE_ADMIN_INTENT_VALUE,
      },
    );
    expect(wrongOrigin.status).toBe(403);

    const missingIntent = await adminPost(
      handler,
      "/api/v1/updates/check",
      {},
      { origin: "https://admin.example.com" },
    );
    expect(missingIntent.status).toBe(403);
    await expect(missingIntent.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.CSRF_INTENT_REQUIRED },
    });

    for (const path of [
      "/api/v1/updates/check",
      "/api/v1/updates/plan",
      "/api/v1/openapi/refresh",
    ]) {
      const response = await adminPost(handler, path, {}, adminControlHeaders());
      expect(response.status).toBe(200);
    }
    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(planInstallOrUpdate).toHaveBeenCalledOnce();
    expect(refreshOpenApi).toHaveBeenCalledOnce();

    const noConfirmation = await adminPost(
      handler,
      "/api/v1/updates/apply",
      { planId: status.plan?.planId },
      adminControlHeaders(),
    );
    expect(noConfirmation.status).toBe(400);
    await expect(noConfirmation.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.ADMIN_CONFIRMATION_REQUIRED },
    });

    const prepareResponse = await adminPost(
      handler,
      "/api/v1/updates/apply",
      { planId: status.plan?.planId, phase: "prepare" },
      adminControlHeaders(),
    );
    expect(prepareResponse.status).toBe(200);
    const confirmation = (await prepareResponse.json()) as UpdateApplyConfirmationResponse;
    expect(confirmation).toMatchObject({
      operationId: "updates.apply",
      planId: status.plan?.planId,
      candidateId: status.plan?.candidateId,
    });
    expect(confirmation.confirmationGrant).not.toHaveLength(0);

    const blockedByOrigin = await adminPost(
      handler,
      "/api/v1/updates/apply",
      {
        planId: confirmation.planId,
        phase: "execute",
        confirmationGrant: confirmation.confirmationGrant,
      },
      {
        [BRIDGE_ADMIN_INTENT_HEADER]: BRIDGE_ADMIN_INTENT_VALUE,
        origin: "https://evil.example.com",
      },
    );
    expect(blockedByOrigin.status).toBe(403);

    const applied = await adminPost(
      handler,
      "/api/v1/updates/apply",
      {
        planId: confirmation.planId,
        phase: "execute",
        confirmationGrant: confirmation.confirmationGrant,
      },
      adminControlHeaders(),
    );
    expect(applied.status).toBe(200);
    expect(applyConfirmed).toHaveBeenCalledOnce();

    const replay = await adminPost(
      handler,
      "/api/v1/updates/apply",
      {
        planId: confirmation.planId,
        phase: "execute",
        confirmationGrant: confirmation.confirmationGrant,
      },
      adminControlHeaders(),
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.ADMIN_CONFIRMATION_INVALID },
    });
    expect(lines.join("\n")).not.toContain("valid-admin-assertion");
    expect(applied.headers.get("access-control-allow-origin")).toBeNull();

    const local = await handler(
      new Request("http://127.0.0.1:17282/api/v1/updates/check", {
        method: "POST",
        headers: { host: "127.0.0.1:17282", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(local.status).toBe(200);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("also protects remote-admin QR POSTs with the same browser intent boundary", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: adminRequestContextOptions(),
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });
    const response = await handler(
      new Request("https://admin.example.com/api/v1/session/qr/begin", {
        method: "POST",
        headers: {
          host: "admin.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-admin-assertion",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.CSRF_ORIGIN_INVALID },
    });
  });

  it("denies every maintenance control to ordinary remote humans even with admin-shaped headers", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: {
        remoteHostname: "human.example.com",
        adminHostname: "admin.example.com",
        adminVerifier: {
          audience: "admin-audience",
          verify: async () => ({
            kind: "human",
            subject: "operator-1",
            audience: "admin-audience",
          }),
        },
      },
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });
    for (const path of [
      "/api/v1/updates/check",
      "/api/v1/updates/plan",
      "/api/v1/updates/apply",
      "/api/v1/openapi/refresh",
    ]) {
      const response = await handler(
        new Request(`https://human.example.com${path}`, {
          method: "POST",
          headers: {
            host: "human.example.com",
            origin: "https://admin.example.com",
            [BRIDGE_ADMIN_INTENT_HEADER]: BRIDGE_ADMIN_INTENT_VALUE,
            [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "human-assertion",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: ERROR_CODES.OPERATION_FORBIDDEN },
      });
    }
  });

  function createService(
    options: {
      readonly updateService?: FqgateUpdateServicePort;
      readonly openApiService?: FqgateOpenApiServicePort;
      readonly adminConfirmations?: AdminConfirmationService;
    } = {},
  ): BridgeService {
    return new BridgeService({
      buildInfo,
      lifecycle: new FakeLifecycle(),
      qrAdapter: new FqgateQrAdapter({
        baseUrl: "http://127.0.0.1:17281",
        http: new QueueTransport([]),
      }),
      qrRegistry: new QrFlowRegistry(),
      ...(options.updateService === undefined ? {} : { updateService: options.updateService }),
      ...(options.openApiService === undefined ? {} : { openApiService: options.openApiService }),
      ...(options.adminConfirmations === undefined
        ? {}
        : { adminConfirmations: options.adminConfirmations }),
    });
  }
});

describe("Cloudflare Access admin JWT verification", () => {
  const nowMs = 1_700_000_000_000;
  const nowSeconds = Math.floor(nowMs / 1_000);

  it("validates RS256, exact issuer/audience, subject, and temporal claims", async () => {
    const key = await makeKey("admin-key");
    const fetcher = keySetFetcher(key.publicJwk);
    const verifier = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: "admin-audience",
      fetcher,
      nowMs: () => nowMs,
    });
    const token = await signToken(key.privateKey, {
      kid: "admin-key",
      issuer: "https://team.cloudflareaccess.com",
      audience: "admin-audience",
      subject: "operator-1",
      expiration: nowSeconds + 60,
      notBefore: nowSeconds - 1,
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      kind: "human",
      subject: "operator-1",
      audience: "admin-audience",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );

    for (const invalid of [
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://other.cloudflareaccess.com",
        audience: "admin-audience",
        subject: "operator-1",
        expiration: nowSeconds + 60,
      }),
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://team.cloudflareaccess.com",
        audience: "other-admin-audience",
        subject: "operator-1",
        expiration: nowSeconds + 60,
      }),
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://team.cloudflareaccess.com",
        audience: ["admin-audience", "other-audience"],
        subject: "operator-1",
        expiration: nowSeconds + 60,
      }),
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://team.cloudflareaccess.com",
        audience: "admin-audience",
        subject: "operator-1",
        expiration: nowSeconds - 1,
      }),
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://team.cloudflareaccess.com",
        audience: "admin-audience",
        subject: "operator-1",
        expiration: nowSeconds + 60,
        notBefore: nowSeconds + 30,
      }),
      await signToken(key.privateKey, {
        kid: "admin-key",
        issuer: "https://team.cloudflareaccess.com",
        audience: "admin-audience",
        subject: "operator-1",
        expiration: nowSeconds + 60,
        notBefore: nowSeconds - 1,
        issuedAt: nowSeconds + 30,
      }),
    ]) {
      await expect(verifier.verify(invalid)).rejects.toMatchObject({
        code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
      });
    }
  });

  it("rejects bad signatures, unknown kids, malformed keys, and arbitrary team domains", async () => {
    const key = await makeKey("admin-key");
    const wrongKey = await makeKey("admin-key");
    const fetcher = keySetFetcher(key.publicJwk);
    const verifier = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: "admin-audience",
      fetcher,
      nowMs: () => nowMs,
    });
    const badSignature = await signToken(wrongKey.privateKey, {
      kid: "admin-key",
      issuer: "https://team.cloudflareaccess.com",
      audience: "admin-audience",
      subject: "operator-1",
      expiration: nowSeconds + 60,
    });
    await expect(verifier.verify(badSignature)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });

    const unknownKid = await signToken(key.privateKey, {
      kid: "unknown-key",
      issuer: "https://team.cloudflareaccess.com",
      audience: "admin-audience",
      subject: "operator-1",
      expiration: nowSeconds + 60,
    });
    await expect(verifier.verify(unknownKid)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    expect(
      () =>
        new CloudflareAccessJwtVerifier({
          teamDomain: "https://evil.example.com/jwks",
          audience: "admin-audience",
        }),
    ).toThrowError(/Cloudflare Access team hostname/);
    const malformed = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: "admin-audience",
      fetcher: async () =>
        new Response(JSON.stringify({ keys: [{ kty: "oct", kid: "wrong" }] }), { status: 200 }),
      nowMs: () => nowMs,
    });
    await expect(malformed.verify(unknownKid)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
  });

  it("bounds cache lifetime, refreshes once on key rotation, and fails closed on fetch errors", async () => {
    const first = await makeKey("first-key");
    const second = await makeKey("second-key");
    let current = first.publicJwk;
    let clock = nowMs;
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ keys: [current] }), { status: 200 }),
    );
    const verifier = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: "admin-audience",
      fetcher,
      nowMs: () => clock,
      cacheTtlMs: 100,
    });
    const firstToken = await signToken(first.privateKey, {
      kid: "first-key",
      issuer: "https://team.cloudflareaccess.com",
      audience: "admin-audience",
      subject: "operator-1",
      expiration: nowSeconds + 60,
    });
    await verifier.verify(firstToken);
    await verifier.verify(firstToken);
    expect(fetcher).toHaveBeenCalledTimes(1);

    current = second.publicJwk;
    const secondToken = await signToken(second.privateKey, {
      kid: "second-key",
      issuer: "https://team.cloudflareaccess.com",
      audience: "admin-audience",
      subject: "operator-1",
      expiration: nowSeconds + 60,
    });
    await expect(verifier.verify(secondToken)).resolves.toMatchObject({ subject: "operator-1" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    clock += 101;
    await verifier.verify(secondToken);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const failed = new CloudflareAccessJwtVerifier({
      teamDomain: "team.cloudflareaccess.com",
      audience: "admin-audience",
      fetcher: async () => new Response("unavailable", { status: 503 }),
      nowMs: () => nowMs,
    });
    await expect(failed.verify(firstToken)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_ASSERTION_INVALID,
    });
  });

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

  async function signToken(
    privateKey: Parameters<SignJWT["sign"]>[0],
    options: {
      readonly kid: string;
      readonly issuer: string;
      readonly audience: string | string[];
      readonly subject: string;
      readonly expiration: number;
      readonly notBefore?: number;
      readonly issuedAt?: number;
    },
  ): Promise<string> {
    let builder = new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: options.kid, typ: "JWT" })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setSubject(options.subject)
      .setIssuedAt(options.issuedAt ?? nowSeconds)
      .setExpirationTime(options.expiration);
    if (options.notBefore !== undefined) builder = builder.setNotBefore(options.notBefore);
    return builder.sign(privateKey);
  }
});

function adminRequestContextOptions() {
  return {
    remoteHostname: "human.example.com",
    adminHostname: "admin.example.com",
    adminVerifier: {
      audience: "admin-audience",
      verify: async () => ({
        kind: "human" as const,
        subject: "operator-1",
        audience: "admin-audience",
      }),
    },
  };
}

function adminControlHeaders(): Record<string, string> {
  return {
    origin: "https://admin.example.com",
    [BRIDGE_ADMIN_INTENT_HEADER]: BRIDGE_ADMIN_INTENT_VALUE,
  };
}

async function adminPost(
  handler: ReturnType<typeof createBridgeHttpHandler>,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new Request(`https://admin.example.com${path}`, {
      method: "POST",
      headers: {
        host: "admin.example.com",
        [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "valid-admin-assertion",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

function makeAdminUpdateStatus(): UpdateStatusView {
  return {
    releaseSource: { id: "github", label: "GitHub · fixed official source" },
    lifecycle: "ready",
    installedVersion: "1.0.0",
    compatibility: {
      version: "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "validated",
    },
    plan: {
      planId: "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateId: "candidate-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt: "2026-09-17T00:00:00.000Z",
      source: "github",
      installedVersion: "1.0.0",
      targetVersion: "1.0.1",
      action: "update",
      reason: "selected release differs",
      compatibility: {
        version: "1.0.1",
        status: "validated",
        supported: true,
        validated: true,
        reason: "validated",
      },
      package: {
        fileName: "FQGate-1.0.1-windows-x64.exe",
        size: 1024,
        sha256: "c".repeat(64),
      },
      releaseNotes: [],
      restartRequired: true,
    },
    transaction: { state: "idle" },
  };
}

describe("Phase 4.5C one-time administrator confirmation", () => {
  const binding: AdminConfirmationBinding = {
    principalSubject: "operator-1",
    adminAudience: "admin-audience",
    operationId: "updates.apply",
    planId: "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidateId: "candidate-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source: "github",
    targetVersion: "1.0.1",
    packageSize: 1024,
    packageSha256: "c".repeat(64),
  };

  it("is bounded, memory-only, atomically single-use, and binds all identities", () => {
    let now = 1_700_000_000_000;
    let sequence = 0;
    const service = new AdminConfirmationService({
      nowMs: () => now,
      idFactory: () => `grant-${"a".repeat(31)}${sequence++}`,
      ttlMs: 10_000,
      maxEntries: 2,
    });
    const first = service.issue(binding);
    expect(first).toMatchObject({ operationId: "updates.apply", planId: binding.planId });
    expect(service.size).toBe(1);
    expect(() =>
      service.consume(first.confirmationGrant, { ...binding, planId: "plan-wrong" }),
    ).toThrowError(expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_MISMATCH }));
    expect(() => service.consume(first.confirmationGrant, binding)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_INVALID }),
    );

    for (const mismatch of [
      { principalSubject: "other-operator" },
      { adminAudience: "other-admin-audience" },
      { candidateId: "candidate-wrong" },
      { source: "other-source" },
      { targetVersion: "1.0.2" },
      { packageSize: 2048 },
      { packageSha256: "d".repeat(64) },
    ]) {
      const mismatchService = new AdminConfirmationService({
        idFactory: () => `grant-${"m".repeat(32)}`,
      });
      const mismatchGrant = mismatchService.issue(binding);
      expect(() =>
        mismatchService.consume(mismatchGrant.confirmationGrant, { ...binding, ...mismatch }),
      ).toThrowError(expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_MISMATCH }));
    }
    const operationMismatchService = new AdminConfirmationService({
      idFactory: () => `grant-${"o".repeat(32)}`,
    });
    const operationGrant = operationMismatchService.issue(binding);
    const wrongOperationBinding = {
      ...binding,
      operationId: "updates.plan",
    } as unknown as AdminConfirmationBinding;
    expect(() =>
      operationMismatchService.consume(operationGrant.confirmationGrant, wrongOperationBinding),
    ).toThrowError(expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_MISMATCH }));
    expect(() => service.consume("too-short", binding)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_INVALID }),
    );

    const second = service.issue(binding);
    now += 10_001;
    expect(() => service.consume(second.confirmationGrant, binding)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_EXPIRED }),
    );
    expect(service.size).toBe(0);

    expect(JSON.stringify(service)).not.toContain(second.confirmationGrant);
    const restarted = new AdminConfirmationService({ idFactory: () => `grant-${"b".repeat(32)}` });
    expect(() => restarted.consume(second.confirmationGrant, binding)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_INVALID }),
    );
  });

  it("rejects capacity exhaustion and concurrent double use", async () => {
    const service = new AdminConfirmationService({
      idFactory: () => `grant-${"c".repeat(32)}`,
      maxEntries: 1,
    });
    const grant = service.issue(binding);
    expect(() => service.issue(binding)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.ADMIN_CONFIRMATION_LIMIT }),
    );

    const results = await Promise.allSettled([
      Promise.resolve().then(() => service.consume(grant.confirmationGrant, binding)),
      Promise.resolve().then(() => service.consume(grant.confirmationGrant, binding)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});

class QueueTransport implements HttpTransport {
  constructor(private readonly queue: Array<HttpResponse | Error>) {}

  async request(_url: string, _options: HttpRequestOptions): Promise<HttpResponse> {
    const next = this.queue.shift();
    if (next === undefined) throw new Error("fake HTTP queue exhausted");
    if (next instanceof Error) throw next;
    return next;
  }
}

class FakeLifecycle {
  async status(): Promise<FqgateStatus> {
    return {
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
    };
  }
}
