import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompatibilityPolicy } from "../src/fqgate/compatibility/policy.js";
import { FqgateHealthProbe } from "../src/fqgate/health/probe.js";
import { createFqgateLayout } from "../src/fqgate/install/layout.js";
import { FqgateLifecycleManager } from "../src/fqgate/install/lifecycle.js";
import { FqgateCandidateValidator } from "../src/fqgate/process/candidate.js";
import { SafeArtifactDownloader } from "../src/fqgate/release/downloader.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type {
  FqgatePackage,
  FqgateRelease,
  FqgateReleaseSource,
} from "../src/fqgate/release/types.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";
import type {
  ManagedProcessController,
  ManagedProcessSnapshot,
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
} from "../src/fqgate/process/types.js";

class MutableReleaseSource implements FqgateReleaseSource {
  constructor(public release: FqgateRelease) {}

  async getStableRelease(): Promise<FqgateRelease> {
    return this.release;
  }
}

class ArtifactHttp implements HttpTransport {
  constructor(private readonly bodies: Map<string, Uint8Array>) {}

  async request(url: string, _options: HttpRequestOptions): Promise<HttpResponse> {
    const version = /fqgate-v([^/]+)/.exec(url)?.[1];
    const body =
      version === undefined
        ? undefined
        : [...this.bodies.values()].find(
            (candidate) => Buffer.from(candidate).toString("utf8") === version,
          );
    if (body === undefined) throw new Error("download body was not registered");
    return { status: 200, headers: {}, body };
  }
}

class SequenceHealthHttp implements HttpTransport {
  constructor(private readonly responses: Array<HttpResponse | Error>) {}

  async request(_url: string, _options: HttpRequestOptions): Promise<HttpResponse> {
    const response = this.responses.length > 1 ? this.responses.shift() : this.responses[0];
    if (response === undefined) throw new Error("health response was not registered");
    if (response instanceof Error) throw response;
    return response;
  }
}

class ContentRunner implements ProcessRunner {
  async run(
    executablePath: string,
    _args: readonly string[],
    _options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    let content: string;
    try {
      content = await readFile(executablePath, "utf8");
    } catch {
      content = "unknown";
    }
    return {
      exitCode: 0,
      stdout: `FQGate ${content}`,
      stderr: "",
      timedOut: false,
      truncated: false,
    };
  }
}

class FakeManagedProcess implements ManagedProcessController {
  running = false;
  starts = 0;
  stops = 0;
  failStarts = 0;

  async status(executablePath: string, _recordPath: string): Promise<ManagedProcessSnapshot> {
    return this.running
      ? { state: "running", pid: 111, expectedPath: executablePath, actualPath: executablePath }
      : { state: "not_running", expectedPath: executablePath };
  }

  async start(
    executablePath: string,
    _recordPath: string,
    _options: { timeoutMs: number },
  ): Promise<ManagedProcessSnapshot> {
    this.starts += 1;
    if (this.failStarts > 0) {
      this.failStarts -= 1;
      throw new BridgeError(ERROR_CODES.PROCESS_START_FAILED, "fake start failure");
    }
    this.running = true;
    return { state: "running", pid: 111, expectedPath: executablePath, actualPath: executablePath };
  }

  async stop(
    executablePath: string,
    _recordPath: string,
    _options: { timeoutMs: number },
  ): Promise<ManagedProcessSnapshot> {
    this.stops += 1;
    this.running = false;
    return { state: "not_running", expectedPath: executablePath };
  }
}

function packageFor(version: string, content: string): FqgatePackage {
  const body = Buffer.from(content, "utf8");
  return {
    platform: "windows",
    architecture: "x86_64",
    installMode: "replaceExecutable",
    fileName: `FQGate-${version}-windows-x64-UNSIGNED.exe`,
    size: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
    assetUrl: `https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v${version}/FQGate-${version}-windows-x64-UNSIGNED.exe`,
  };
}

function releaseFor(pkg: FqgatePackage, version: string): FqgateRelease {
  return {
    schemaVersion: 1,
    component: "fqgate",
    channel: "stable",
    status: "published",
    version,
    publishedAt: "2026-09-16T00:00:00.000Z",
    releaseNotes: [],
    packages: [pkg],
  };
}

function readyHealth(): HttpResponse {
  return {
    status: 200,
    headers: {},
    body: Buffer.from(
      JSON.stringify({ status: "connected", network_ready: true, connected: true }),
    ),
  };
}

function unavailableHealth(): HttpResponse {
  return { status: 503, headers: {}, body: Buffer.from("unavailable") };
}

async function createManager(options: {
  readonly root: string;
  readonly source: MutableReleaseSource;
  readonly bodies: Map<string, Uint8Array>;
  readonly process: FakeManagedProcess;
  readonly healthResponses: Array<HttpResponse | Error>;
  readonly validatedVersions?: readonly string[];
}): Promise<FqgateLifecycleManager> {
  const downloadHttp = new ArtifactHttp(options.bodies);
  const policy = new CompatibilityPolicy({
    supportedRange: ">=1.0.0 <2.0.0",
    validatedVersions: options.validatedVersions ?? ["1.0.0", "1.0.1", "1.0.2"],
  });
  const runner = new ContentRunner();
  const healthProbe = new FqgateHealthProbe({
    baseUrl: "http://127.0.0.1:17281",
    http: new SequenceHealthHttp(options.healthResponses),
    timeoutMs: 100,
    sleep: async () => undefined,
  });
  return new FqgateLifecycleManager({
    layout: createFqgateLayout(options.root),
    releaseSource: options.source,
    downloader: new SafeArtifactDownloader({
      http: downloadHttp,
      id: (() => {
        let count = 0;
        return () => String(count++);
      })(),
      sleep: async () => undefined,
    }),
    candidateValidator: new FqgateCandidateValidator({ runner, policy }),
    processController: options.process,
    healthProbe,
    policy,
    downloadOptions: { timeoutMs: 100, maxRetries: 0, retryDelayMs: 0 },
    activationHealthTimeoutMs: 0,
    activationHealthPollIntervalMs: 1,
    processTimeoutMs: 100,
    now: () => "2026-09-16T00:00:00.000Z",
  });
}

describe("FQGate lifecycle transaction", () => {
  it("fails clearly on first activation when no rollback executable exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const pkg = packageFor("1.0.0", "1.0.0");
    const source = new MutableReleaseSource(releaseFor(pkg, "1.0.0"));
    const process = new FakeManagedProcess();
    process.failStarts = 1;
    const manager = await createManager({
      root,
      source,
      bodies: new Map([[pkg.sha256, Buffer.from("1.0.0")]]),
      process,
      healthResponses: [readyHealth()],
    });

    await expect(manager.install()).rejects.toMatchObject({
      code: ERROR_CODES.PROCESS_START_FAILED,
    });
    expect(await readFile(join(root, "fqgate", "current", "fqgate.exe"), "utf8")).toBe("1.0.0");
    await expect(
      readFile(join(root, "fqgate", "previous", "fqgate.exe"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const state = JSON.parse(await readFile(join(root, "fqgate", "state.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(state.lastActivation).toBe("failed");
    expect(process.running).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("performs a clean install and makes a matching reinstall a no-op", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const body = Buffer.from("1.0.0", "utf8");
    const pkg = packageFor("1.0.0", "1.0.0");
    const source = new MutableReleaseSource(releaseFor(pkg, "1.0.0"));
    const bodies = new Map([[pkg.sha256, body as Uint8Array]]);
    const process = new FakeManagedProcess();
    const manager = await createManager({
      root,
      source,
      bodies,
      process,
      healthResponses: [readyHealth()],
    });

    const installed = await manager.install();
    expect(installed.action).toBe("installed");
    expect(installed.status?.lifecycle).toBe("ready");
    expect(await readFile(join(root, "fqgate", "current", "fqgate.exe"), "utf8")).toBe("1.0.0");
    expect(await readdir(join(root, "fqgate", "previous"))).toEqual([]);

    const startsBeforeNoop = process.starts;
    const second = await manager.install();
    expect(second.action).toBe("noop");
    expect(process.starts).toBe(startsBeforeNoop);
    await rm(root, { recursive: true, force: true });
  });

  it("updates transactionally and preserves the previous known-good executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const oldPkg = packageFor("1.0.0", "1.0.0");
    const newPkg = packageFor("1.0.1", "1.0.1");
    const bodies = new Map<string, Uint8Array>([
      [oldPkg.sha256, Buffer.from("1.0.0")],
      [newPkg.sha256, Buffer.from("1.0.1")],
    ]);
    const source = new MutableReleaseSource(releaseFor(oldPkg, "1.0.0"));
    const process = new FakeManagedProcess();
    const manager = await createManager({
      root,
      source,
      bodies,
      process,
      healthResponses: [readyHealth(), readyHealth()],
    });
    await manager.install();

    source.release = releaseFor(newPkg, "1.0.1");
    const result = await manager.install();
    expect(result.action).toBe("updated");
    expect(await readFile(join(root, "fqgate", "current", "fqgate.exe"), "utf8")).toBe("1.0.1");
    expect(await readFile(join(root, "fqgate", "previous", "fqgate.exe"), "utf8")).toBe("1.0.0");
    await rm(root, { recursive: true, force: true });
  });

  it("rolls back after a candidate start failure without retry loops", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const oldPkg = packageFor("1.0.0", "1.0.0");
    const newPkg = packageFor("1.0.1", "1.0.1");
    const bodies = new Map<string, Uint8Array>([
      [oldPkg.sha256, Buffer.from("1.0.0")],
      [newPkg.sha256, Buffer.from("1.0.1")],
    ]);
    const source = new MutableReleaseSource(releaseFor(oldPkg, "1.0.0"));
    const process = new FakeManagedProcess();
    const manager = await createManager({
      root,
      source,
      bodies,
      process,
      healthResponses: [readyHealth(), readyHealth()],
    });
    await manager.install();
    source.release = releaseFor(newPkg, "1.0.1");
    process.failStarts = 1;

    await expect(manager.install()).rejects.toMatchObject({
      code: ERROR_CODES.PROCESS_START_FAILED,
    });
    expect(await readFile(join(root, "fqgate", "current", "fqgate.exe"), "utf8")).toBe("1.0.0");
    await expect(
      readFile(join(root, "fqgate", "previous", "fqgate.exe"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(process.starts).toBe(3);
    const state = JSON.parse(await readFile(join(root, "fqgate", "state.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(state.lastActivation).toBe("rolled_back");
    await rm(root, { recursive: true, force: true });
  });

  it("reports rollback failure and leaves explicit recovery diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const oldPkg = packageFor("1.0.0", "1.0.0");
    const newPkg = packageFor("1.0.1", "1.0.1");
    const bodies = new Map<string, Uint8Array>([
      [oldPkg.sha256, Buffer.from("1.0.0")],
      [newPkg.sha256, Buffer.from("1.0.1")],
    ]);
    const source = new MutableReleaseSource(releaseFor(oldPkg, "1.0.0"));
    const process = new FakeManagedProcess();
    const manager = await createManager({
      root,
      source,
      bodies,
      process,
      healthResponses: [readyHealth(), readyHealth()],
    });
    await manager.install();
    source.release = releaseFor(newPkg, "1.0.1");
    process.failStarts = 2;

    await expect(manager.install()).rejects.toMatchObject({ code: ERROR_CODES.ROLLBACK_FAILED });
    const state = JSON.parse(await readFile(join(root, "fqgate", "state.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(state.lastActivation).toBe("rollback_failed");
    await rm(root, { recursive: true, force: true });
  });

  it("times out activation health and cleans stale staging artifacts before an update", async () => {
    const root = await mkdtemp(join(tmpdir(), "fqgate-lifecycle-"));
    const oldPkg = packageFor("1.0.0", "1.0.0");
    const newPkg = packageFor("1.0.1", "1.0.1");
    const bodies = new Map<string, Uint8Array>([
      [oldPkg.sha256, Buffer.from("1.0.0")],
      [newPkg.sha256, Buffer.from("1.0.1")],
    ]);
    const source = new MutableReleaseSource(releaseFor(oldPkg, "1.0.0"));
    const process = new FakeManagedProcess();
    const manager = await createManager({
      root,
      source,
      bodies,
      process,
      healthResponses: [readyHealth(), readyHealth(), unavailableHealth(), readyHealth()],
    });
    await manager.install();
    const layout = createFqgateLayout(root);
    await writeFile(join(layout.downloadsDirectory, "stale.part"), "stale");
    await writeFile(join(layout.downloadsDirectory, "stale.candidate"), "stale");
    source.release = releaseFor(newPkg, "1.0.1");

    await expect(manager.install()).rejects.toMatchObject({ code: ERROR_CODES.HEALTH_TIMEOUT });
    expect(await readFile(join(root, "fqgate", "current", "fqgate.exe"), "utf8")).toBe("1.0.0");
    expect(await readdir(layout.downloadsDirectory)).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});
