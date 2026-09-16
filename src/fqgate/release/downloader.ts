import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { BridgeError, ERROR_CODES, isBridgeError } from "../../shared/errors.js";
import type { FqgatePackage } from "./types.js";
import type { HttpTransport } from "./http.js";

export interface DownloadOptions {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

export interface StagedArtifact {
  readonly path: string;
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
  readonly sourceUrl: string;
}

export interface ArtifactDownloader {
  stage(pkg: FqgatePackage, directory: string, options: DownloadOptions): Promise<StagedArtifact>;
}

export interface DownloaderDependencies {
  readonly http: HttpTransport;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly id?: () => string;
}

export class SafeArtifactDownloader implements ArtifactDownloader {
  private readonly http: HttpTransport;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly id: () => string;

  constructor(dependencies: DownloaderDependencies) {
    this.http = dependencies.http;
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.id = dependencies.id ?? (() => cryptoRandomId());
  }

  async stage(
    pkg: FqgatePackage,
    directory: string,
    options: DownloadOptions,
  ): Promise<StagedArtifact> {
    assertOfficialAssetUrl(pkg.assetUrl, pkg.fileName);
    await mkdir(directory, { recursive: true });

    let lastError: unknown;
    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      const temporaryPath = join(directory, `${pkg.fileName}.${this.id()}.part`);
      try {
        const response = await this.http.request(pkg.assetUrl, {
          method: "GET",
          timeoutMs: options.timeoutMs,
          maxBytes: pkg.size < Number.MAX_SAFE_INTEGER ? pkg.size + 1 : pkg.size,
        });
        if (response.status < 200 || response.status >= 300) {
          throw new BridgeError(
            ERROR_CODES.DOWNLOAD_FAILED,
            `FQGate release asset returned HTTP ${response.status}`,
            {
              status: response.status,
              retryable: isTransientStatus(response.status),
            },
          );
        }

        await writeCandidate(temporaryPath, response.body);
        const verified = await verifyFile(temporaryPath, pkg.size, pkg.sha256);
        const candidatePath = temporaryPath.replace(/\.part$/, ".candidate");
        await rename(temporaryPath, candidatePath);
        return {
          path: candidatePath,
          fileName: pkg.fileName,
          size: verified.size,
          sha256: verified.sha256,
          sourceUrl: pkg.assetUrl,
        };
      } catch (error) {
        lastError = error;
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        if (isRetryableDownloadError(error) && attempt < options.maxRetries) {
          await this.sleep(options.retryDelayMs);
          continue;
        }
        throw normalizeDownloadError(error);
      }
    }

    throw normalizeDownloadError(lastError);
  }
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function writeCandidate(filePath: string, body: Uint8Array): Promise<void> {
  const handle = await open(filePath, "wx");
  try {
    await handle.write(body, 0, body.byteLength, 0);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verifyFile(
  filePath: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<{ size: number; sha256: string }> {
  const file = await readFile(filePath);
  const actualSize = (await stat(filePath)).size;
  if (actualSize !== expectedSize || file.byteLength !== expectedSize) {
    throw new BridgeError(
      ERROR_CODES.SIZE_MISMATCH,
      `FQGate release asset size mismatch: expected ${expectedSize}, received ${actualSize}`,
      {
        expectedSize,
        actualSize,
      },
    );
  }

  const actualSha256 = createHash("sha256").update(file).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new BridgeError(
      ERROR_CODES.CHECKSUM_MISMATCH,
      "FQGate release asset SHA-256 does not match the official manifest",
      {
        expectedSha256,
        actualSha256,
      },
    );
  }
  return { size: actualSize, sha256: actualSha256 };
}

function isTransientStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function isRetryableDownloadError(error: unknown): boolean {
  return (
    isBridgeError(error) &&
    error.code === ERROR_CODES.DOWNLOAD_FAILED &&
    error.details?.retryable !== false
  );
}

function normalizeDownloadError(error: unknown): BridgeError {
  if (isBridgeError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new BridgeError(
      ERROR_CODES.DOWNLOAD_FAILED,
      `FQGate release download failed: ${error.message}`,
      undefined,
      { cause: error },
    );
  }
  return new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "FQGate release download failed");
}

function assertOfficialAssetUrl(value: string, fileName: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.DOWNLOAD_FAILED,
      "FQGate release asset URL is invalid",
      undefined,
      { cause: error },
    );
  }

  const expectedSuffix = `/${encodeURIComponent(fileName)}`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith("/zhuyifang/fqgate-releases/releases/download/fqgate-v") ||
    !url.pathname.endsWith(expectedSuffix) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BridgeError(
      ERROR_CODES.DOWNLOAD_FAILED,
      "FQGate release asset is outside the official HTTPS release source",
    );
  }
}
