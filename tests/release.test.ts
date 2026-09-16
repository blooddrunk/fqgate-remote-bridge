import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MANIFEST_URL } from "../src/config/config.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";
import { SafeArtifactDownloader } from "../src/fqgate/release/downloader.js";
import { OfficialFqgateReleaseSource } from "../src/fqgate/release/official-source.js";
import {
  parseStableManifest,
  parseStableManifestJson,
  selectWindowsX64Package,
} from "../src/fqgate/release/manifest.js";
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from "../src/fqgate/release/http.js";
import type { FqgatePackage } from "../src/fqgate/release/types.js";

class FakeHttp implements HttpTransport {
  readonly calls: string[] = [];
  private readonly responses: Array<HttpResponse | Error>;

  constructor(responses: Array<HttpResponse | Error>) {
    this.responses = [...responses];
  }

  async request(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    this.calls.push(`${options.method ?? "GET"} ${url}`);
    const next = this.responses.shift();
    if (next === undefined) throw new Error("no fake response remaining");
    if (next instanceof Error) throw next;
    return next;
  }
}

function response(body: Uint8Array, status = 200): HttpResponse {
  return { status, headers: {}, body };
}

function manifestFixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL("./fixtures/stable-manifest.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function firstPackage(manifest: Record<string, unknown>): Record<string, unknown> {
  const packages = manifest.packages;
  if (
    !Array.isArray(packages) ||
    packages[0] === undefined ||
    typeof packages[0] !== "object" ||
    packages[0] === null
  ) {
    throw new Error("fixture package missing");
  }
  return packages[0] as Record<string, unknown>;
}

describe("official release manifest", () => {
  it("parses the current stable fixture and selects Windows x64 deterministically", () => {
    const release = parseStableManifest(manifestFixture());
    const selected = selectWindowsX64Package(release);

    expect(release.version).toBe("1.0.0");
    expect(selected.platform).toBe("windows");
    expect(selected.architecture).toBe("x86_64");
    expect(selected.assetUrl).toBe(
      "https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v1.0.0/FQGate-1.0.0-windows-x64-UNSIGNED.exe",
    );
  });

  it("fetches only the official raw stable manifest through the source adapter", async () => {
    const http = new FakeHttp([response(Buffer.from(JSON.stringify(manifestFixture()), "utf8"))]);
    const source = new OfficialFqgateReleaseSource(http, DEFAULT_MANIFEST_URL);
    const release = await source.getStableRelease();

    expect(release.version).toBe("1.0.0");
    expect(http.calls).toEqual([`GET ${DEFAULT_MANIFEST_URL}`]);
  });

  it("rejects a configured manifest source outside the official repository", () => {
    expect(
      () => new OfficialFqgateReleaseSource(new FakeHttp([]), "https://example.com/stable.json"),
    ).toThrowError(/outside the official stable source/);
  });

  it.each([
    [
      "unpublished status",
      (manifest: Record<string, unknown>) => {
        manifest.status = "draft";
      },
    ],
    [
      "wrong channel",
      (manifest: Record<string, unknown>) => {
        manifest.channel = "beta";
      },
    ],
    [
      "missing required field",
      (manifest: Record<string, unknown>) => {
        delete firstPackage(manifest).sha256;
      },
    ],
    [
      "invalid size",
      (manifest: Record<string, unknown>) => {
        firstPackage(manifest).size = 0;
      },
    ],
    [
      "invalid hash",
      (manifest: Record<string, unknown>) => {
        firstPackage(manifest).sha256 = "not-a-hash";
      },
    ],
    [
      "invalid version",
      (manifest: Record<string, unknown>) => {
        manifest.version = "latest";
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const manifest = manifestFixture();
    mutate(manifest);

    expect(() => parseStableManifest(manifest)).toThrowError(BridgeError);
    try {
      parseStableManifest(manifest);
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeError);
      expect((error as BridgeError).code).toBe(ERROR_CODES.MANIFEST_INVALID);
    }
  });

  it("rejects an unsupported architecture and ambiguous Windows matches", () => {
    const unsupported = manifestFixture();
    const packageValue = firstPackage(unsupported);
    packageValue.architecture = "arm64";
    const release = parseStableManifest(unsupported);
    expect(() => selectWindowsX64Package(release)).toThrowError(BridgeError);
    expect(() => selectWindowsX64Package(release)).toThrowError(/no Windows x86_64/);

    const ambiguous = manifestFixture();
    const packages = ambiguous.packages;
    if (!Array.isArray(packages)) throw new Error("fixture packages missing");
    packages.push({ ...firstPackage(ambiguous) });
    const ambiguousRelease = parseStableManifest(ambiguous);
    expect(() => selectWindowsX64Package(ambiguousRelease)).toThrowError(/multiple Windows x86_64/);
  });

  it("rejects a package that is not a replaceable Windows executable", () => {
    const manifest = manifestFixture();
    const packageValue = firstPackage(manifest);
    packageValue.installMode = "openPackage";
    const release = parseStableManifest(manifest);
    expect(() => selectWindowsX64Package(release)).toThrowError(/replaceable executable/);
  });

  it("rejects unsafe package filenames before constructing an asset URL", () => {
    const manifest = manifestFixture();
    firstPackage(manifest).fileName = "..\\fqgate.exe";
    expect(() => parseStableManifest(manifest)).toThrowError(/plain file name/);
  });

  it("rejects an invalid JSON manifest", () => {
    expect(() => parseStableManifestJson("not-json")).toThrowError(/not valid JSON/);
  });
});

describe("safe artifact downloader", () => {
  const packageFor = (body: Uint8Array): FqgatePackage => ({
    platform: "windows",
    architecture: "x86_64",
    installMode: "replaceExecutable",
    fileName: "FQGate-1.0.0-windows-x64-UNSIGNED.exe",
    size: body.byteLength,
    sha256: createSha256(body),
    assetUrl:
      "https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v1.0.0/FQGate-1.0.0-windows-x64-UNSIGNED.exe",
  });

  it("stages, verifies, and returns a candidate path", async () => {
    const body = Buffer.from("fake-fqgate-binary");
    const http = new FakeHttp([response(body)]);
    const downloader = new SafeArtifactDownloader({
      http,
      id: () => "fixed",
      sleep: async () => undefined,
    });
    const directory = await mkdtemp(join(tmpdir(), "fqgate-release-"));

    const staged = await downloader.stage(packageFor(body), directory, {
      timeoutMs: 1_000,
      maxRetries: 0,
      retryDelayMs: 0,
    });
    expect(staged.path.endsWith(".candidate")).toBe(true);
    expect(await readFile(staged.path)).toEqual(body);
    await rm(directory, { recursive: true, force: true });
  });

  it("retries transient HTTP failures and network failures within the bound", async () => {
    const body = Buffer.from("retryable");
    const http = new FakeHttp([
      response(Buffer.from("busy"), 503),
      new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "temporary network failure", {
        retryable: true,
      }),
      response(body),
    ]);
    const downloader = new SafeArtifactDownloader({
      http,
      sleep: async () => undefined,
      id: (() => {
        let count = 0;
        return () => String(count++);
      })(),
    });
    const directory = await mkdtemp(join(tmpdir(), "fqgate-retry-"));

    const staged = await downloader.stage(packageFor(body), directory, {
      timeoutMs: 1_000,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    expect(staged.sha256).toBe(createSha256(body));
    expect(http.calls).toHaveLength(3);
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    ["truncated file", Buffer.from("short")],
    ["checksum mismatch", Buffer.from("mismatch")],
  ])("rejects and cleans up a %s", async (_name, body) => {
    const expected = packageFor(Buffer.from("expected"));
    const http = new FakeHttp([response(body)]);
    const downloader = new SafeArtifactDownloader({
      http,
      sleep: async () => undefined,
      id: () => "fixed",
    });
    const directory = await mkdtemp(join(tmpdir(), "fqgate-integrity-"));

    await expect(
      downloader.stage(expected, directory, { timeoutMs: 1_000, maxRetries: 0, retryDelayMs: 0 }),
    ).rejects.toBeInstanceOf(BridgeError);
    expect(await readdir(directory)).toEqual([]);
    await rm(directory, { recursive: true, force: true });
  });
});

function createSha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}
