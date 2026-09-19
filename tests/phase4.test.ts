import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BridgeService } from "../src/bridge/service.js";
import { createBridgeHttpHandler } from "../src/bridge/transport/http.js";
import {
  classifyHost,
  CLOUDFLARE_ACCESS_ASSERTION_HEADER,
} from "../src/bridge/policy/request-context.js";
import { listBridgeOperations } from "../src/bridge/policy/registry.js";
import { FqgateQrAdapter } from "../src/bridge/qr/adapter.js";
import { QrFlowRegistry } from "../src/bridge/qr/registry.js";
import { CLOUDFLARED_RELEASE_ASSET_NAME } from "../src/cloudflared/release/types.js";
import {
  assertOfficialCloudflaredAssetUrl,
  parseOfficialCloudflaredRelease,
} from "../src/cloudflared/release/source.js";
import {
  buildCloudflaredInvocation,
  WindowsCloudflaredServiceController,
} from "../src/cloudflared/windows/service.js";
import { PosixTokenFileAcl, ProtectedTokenFileStore } from "../src/cloudflared/token-file.js";
import { REDACTED, Redactor } from "../src/shared/redaction.js";
import type { FqgateStatus } from "../src/fqgate/install/lifecycle.js";
import type { FqgateOpenApiServicePort } from "../src/fqgate/openapi/service.js";
import type { OpenApiCatalog, OpenApiSnapshot } from "../src/fqgate/openapi/types.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type {
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
} from "../src/fqgate/process/types.js";
import type { BuildInfo } from "../src/shared/build-info.js";
import { StructuredLogger } from "../src/shared/logger.js";
import type { FqgateUpdateServicePort, UpdateStatusView } from "../src/fqgate/update/service.js";

const buildInfo: BuildInfo = {
  name: "fqgate-remote-bridge",
  version: "0.1.0",
  commit: "phase4-test",
  node: "v22.0.0",
  platform: "linux",
  architecture: "x64",
};

describe("Phase 4 request context and operation exposure", () => {
  it("classifies only explicit loopback and configured remote Host values", () => {
    expect(classifyHost("127.0.0.1:17282", { remoteHostname: "dashboard.example.com" })).toBe(
      "local",
    );
    expect(classifyHost("localhost", { remoteHostname: "dashboard.example.com" })).toBe("local");
    expect(
      classifyHost("dashboard.example.com", {
        bridgePort: 17282,
        remoteHostname: "dashboard.example.com",
      }),
    ).toBe("remote_human");
    expect(classifyHost("unknown.example.com", { remoteHostname: "dashboard.example.com" })).toBe(
      "unknown",
    );
    expect(
      classifyHost("dashboard.example.com:443", { remoteHostname: "dashboard.example.com" }),
    ).toBe("unknown");
  });

  it("requires Access assertion presence only for the configured remote Host", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: { bridgePort: 17282, remoteHostname: "dashboard.example.com" },
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });

    const missingAssertion = await handler(
      new Request("https://dashboard.example.com/api/v1/version", {
        headers: { host: "dashboard.example.com" },
      }),
    );
    expect(missingAssertion.status).toBe(403);
    await expect(missingAssertion.json()).resolves.toMatchObject({
      error: { code: "ACCESS_ASSERTION_REQUIRED" },
    });

    const remote = await handler(
      new Request("https://dashboard.example.com/api/v1/capabilities", {
        headers: {
          host: "dashboard.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "test-access-assertion",
        },
      }),
    );
    expect(remote.status).toBe(200);
    await expect(remote.json()).resolves.toMatchObject({ requestContext: "remote_human" });

    const unknown = await handler(
      new Request("https://unknown.example.com/api/v1/version", {
        headers: {
          host: "unknown.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "test-access-assertion",
        },
      }),
    );
    expect(unknown.status).toBe(421);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: "HOST_NOT_ALLOWED" } });
  });

  it("does not let X-Forwarded-Host spoof the local context", async () => {
    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: { bridgePort: 17282, remoteHostname: "dashboard.example.com" },
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });
    const response = await handler(
      new Request("http://127.0.0.1:17282/api/v1/capabilities", {
        headers: {
          host: "127.0.0.1:17282",
          "x-forwarded-host": "dashboard.example.com",
        },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestContext: "local" });
  });

  it("keeps the complete Phase 4 operation matrix explicit", async () => {
    const remoteAllowed = listBridgeOperations()
      .filter((operation) => operation.allowedContexts.includes("remote_human"))
      .map((operation) => operation.id);
    const localOnly = listBridgeOperations()
      .filter(
        (operation) =>
          operation.allowedContexts.includes("local") &&
          !operation.allowedContexts.includes("remote_human"),
      )
      .map((operation) => operation.id);
    expect(remoteAllowed).toEqual([
      "bridge.version",
      "bridge.capabilities",
      "bridge.status",
      "session.qr.begin",
      "session.qr.poll",
      "updates.status",
      "openapi.catalog",
    ]);
    expect(localOnly).toEqual([
      "updates.check",
      "updates.plan",
      "updates.apply",
      "openapi.refresh",
    ]);

    const handler = createBridgeHttpHandler({
      service: createService(),
      requestContext: { remoteHostname: "dashboard.example.com" },
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });
    for (const path of [
      "/api/v1/updates/check",
      "/api/v1/updates/plan",
      "/api/v1/openapi/refresh",
    ]) {
      const response = await handler(
        new Request(`https://dashboard.example.com${path}`, {
          method: "POST",
          headers: {
            host: "dashboard.example.com",
            [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "test-access-assertion",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "OPERATION_FORBIDDEN" },
      });
    }

    const raw = await handler(
      new Request("https://dashboard.example.com/v1/market/health", {
        headers: {
          host: "dashboard.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "test-access-assertion",
        },
      }),
    );
    expect(raw.status).toBe(404);
    const unregistered = await handler(
      new Request("https://dashboard.example.com/v1/new/unregistered", {
        headers: {
          host: "dashboard.example.com",
          [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: "test-access-assertion",
        },
      }),
    );
    expect(unregistered.status).toBe(404);
  });

  it("continues to allow local maintenance operations through loopback", async () => {
    const updateStatus = makeUpdateStatus();
    const checkForUpdate = vi.fn(async () => updateStatus);
    const refresh = vi.fn(async () => makeOpenApiSnapshot());
    const handler = createBridgeHttpHandler({
      service: createService({
        updateService: {
          getStatus: async () => updateStatus,
          checkForUpdate,
          planInstallOrUpdate: async () => updateStatus,
          applyConfirmed: async () => updateStatus,
        },
        openApiService: {
          refresh,
          catalog: async () => makeOpenApiCatalog(),
        },
      }),
      requestContext: { remoteHostname: "dashboard.example.com" },
      logger: new StructuredLogger({ level: "warn", sink: () => undefined }),
    });

    const updateResponse = await handler(
      new Request("http://127.0.0.1:17282/api/v1/updates/check", {
        method: "POST",
        headers: { host: "127.0.0.1:17282", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(updateResponse.status).toBe(200);
    expect(checkForUpdate).toHaveBeenCalledOnce();

    const refreshResponse = await handler(
      new Request("http://127.0.0.1:17282/api/v1/openapi/refresh", {
        method: "POST",
        headers: { host: "127.0.0.1:17282", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(refreshResponse.status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not expose Access assertions in redacted output", () => {
    const assertion = "test-access-assertion-value";
    const redacted = new Redactor().redact({
      [CLOUDFLARE_ACCESS_ASSERTION_HEADER]: assertion,
    }) as Record<string, unknown>;
    expect(redacted[CLOUDFLARE_ACCESS_ASSERTION_HEADER]).toBe(REDACTED);
  });

  function createService(
    options: {
      readonly updateService?: FqgateUpdateServicePort;
      readonly openApiService?: FqgateOpenApiServicePort;
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
    });
  }
});

describe("Phase 4 cloudflared release and secret boundaries", () => {
  it("accepts only the fixed official Cloudflare Windows x64 asset and SHA-256", () => {
    const sha256 = "a".repeat(64);
    const metadata = officialReleaseMetadata(sha256);
    expect(parseOfficialCloudflaredRelease(metadata, "2026.9.0")).toMatchObject({
      source: "cloudflare-github",
      version: "2026.9.0",
      asset: { name: CLOUDFLARED_RELEASE_ASSET_NAME, sha256 },
    });
    expect(() =>
      parseOfficialCloudflaredRelease(
        {
          ...metadata,
          assets: [
            {
              ...(metadata.assets as Array<Record<string, unknown>>)[0],
              browser_download_url: "https://example.com/cloudflared.exe",
            },
          ],
        },
        "2026.9.0",
      ),
    ).toThrowError(/outside the fixed official Cloudflare repository/);
    expect(() =>
      assertOfficialCloudflaredAssetUrl(
        "https://github.com/cloudflare/cloudflared/releases/download/2026.9.0/other.exe",
        "2026.9.0",
      ),
    ).toThrowError();
  });

  it("rejects integrity mismatches and preserves raw token-free service invocation", () => {
    const metadata = officialReleaseMetadata("a".repeat(64));
    expect(() =>
      parseOfficialCloudflaredRelease(
        {
          ...metadata,
          assets: [
            {
              ...(metadata.assets as Array<Record<string, unknown>>)[0],
              digest: `sha256:${"b".repeat(64)}`,
            },
          ],
        },
        "2026.9.0",
      ),
    ).toThrowError(/integrity values disagree/);

    const tokenPath = "C:\\ProgramData\\FQGateRemoteBridge\\secrets\\tunnel-token";
    const invocation = buildCloudflaredInvocation(
      "C:\\Program Files\\FQGateRemoteBridge\\cloudflared\\cloudflared.exe",
      tokenPath,
    );
    const serialized = JSON.stringify(invocation);
    expect(serialized).toContain("--token-file");
    expect(invocation.tokenFilePath).toBe(tokenPath);
    expect(invocation.serviceBinPath).toContain(tokenPath);
    expect(serialized).not.toContain("eyJ");
  });

  it("enforces protected token-file state without returning its contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fqgate-phase4-token-"));
    const tokenPath = join(directory, "tunnel-token");
    const token = ["generated", "test", "value"].join("-");
    try {
      const store = new ProtectedTokenFileStore({
        platform: process.platform,
        acl: new RecordingTokenFileAcl(),
      });
      await expect(store.write(tokenPath, token, "test-service")).resolves.toMatchObject({
        state: "secure",
        path: tokenPath,
      });
      await expect(store.assertUsable(tokenPath, "test-service")).resolves.toBeUndefined();
      expect(JSON.stringify(await store.inspect(tokenPath, "test-service"))).not.toContain(token);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("enforces POSIX token-file mode with the real POSIX ACL on POSIX hosts", async () => {
    if (process.platform === "win32") return;

    const directory = await mkdtemp(join(tmpdir(), "fqgate-phase4-posix-token-"));
    const tokenPath = join(directory, "tunnel-token");
    try {
      const store = new ProtectedTokenFileStore({
        platform: "linux",
        acl: new PosixTokenFileAcl(),
      });
      await expect(
        store.write(tokenPath, "generated-posix-test-value", "test-service"),
      ).resolves.toMatchObject({
        state: "secure",
        path: tokenPath,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps cloudflared service operations deterministic with a fake runner", async () => {
    const calls: Array<{ readonly file: string; readonly args: readonly string[] }> = [];
    const runner = new RecordingRunner(calls);
    const directory = await mkdtemp(join(tmpdir(), "fqgate-phase4-service-"));
    const tokenPath = join(directory, "tunnel-token");
    const token = ["generated", "tunnel", "token"].join("-");
    try {
      const tokenFiles = new ProtectedTokenFileStore({
        platform: process.platform,
        acl: new RecordingTokenFileAcl(),
      });
      await tokenFiles.write(tokenPath, token, "LocalSystem");
      const controller = new WindowsCloudflaredServiceController({
        runner,
        tokenFiles,
        serviceName: "FQGateRemoteBridgeCloudflared",
      });
      await controller.install("C:\\Program Files\\cloudflared.exe", tokenPath, "LocalSystem");
      await expect(controller.status()).resolves.toEqual({ installed: true, running: true });
      await controller.restart();
      expect(calls.some((call) => call.args[0] === "create")).toBe(true);
      expect(JSON.stringify(calls)).not.toContain(token);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function officialReleaseMetadata(sha256: string): Record<string, unknown> {
  return {
    tag_name: "2026.9.0",
    html_url: "https://github.com/cloudflare/cloudflared/releases/tag/2026.9.0",
    body: `cloudflared-windows-amd64.exe: ${sha256}`,
    assets: [
      {
        name: CLOUDFLARED_RELEASE_ASSET_NAME,
        browser_download_url:
          "https://github.com/cloudflare/cloudflared/releases/download/2026.9.0/cloudflared-windows-amd64.exe",
        size: 4,
        digest: null,
      },
    ],
  };
}

class RecordingTokenFileAcl {
  private readonly securePaths = new Set<string>();

  async secure(path: string): Promise<void> {
    this.securePaths.add(path);
  }

  async isSecure(path: string): Promise<boolean> {
    return this.securePaths.has(path);
  }
}

class RecordingRunner implements ProcessRunner {
  constructor(
    private readonly calls: Array<{ readonly file: string; readonly args: readonly string[] }>,
  ) {}

  async run(
    file: string,
    args: readonly string[],
    _options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    this.calls.push({ file, args });
    return {
      exitCode: 0,
      stdout: "STATE              : 4  RUNNING",
      stderr: "",
      timedOut: false,
      truncated: false,
    };
  }
}

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

function makeUpdateStatus(): UpdateStatusView {
  return {
    releaseSource: { id: "github", label: "test" },
    lifecycle: "ready",
    installedVersion: "1.0.0",
    compatibility: undefined,
    transaction: { state: "idle" },
  };
}

function makeOpenApiSnapshot(): OpenApiSnapshot {
  return {
    endpoint: "http://127.0.0.1:17281/openapi.json",
    openapiVersion: "3.1.0",
    info: { title: "FQGate", version: "1.0.0" },
    fetchedAt: "2026-09-17T00:00:00.000Z",
    byteLength: 0,
    fingerprint: "a".repeat(64),
    operations: [],
    changes: { added: [], removed: [], changed: [] },
    cacheHit: false,
  };
}

function makeOpenApiCatalog(): OpenApiCatalog {
  return {
    source: "runtime_fqgate_openapi",
    snapshot: makeOpenApiSnapshot(),
    bridgeOperations: [],
    upstreamOnlyOperations: [],
    contractCoverage: { required: [], missing: [] },
    note: "test",
  };
}
