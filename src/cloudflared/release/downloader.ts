import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { DownloadOptions } from "../../fqgate/release/downloader.js";
import type { HttpTransport } from "../../fqgate/release/http.js";
import { assertOfficialCloudflaredAssetUrl } from "./source.js";
import type { CloudflaredRelease } from "./types.js";

export interface CloudflaredStagedArtifact {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface CloudflaredArtifactDownloader {
  stage(
    release: CloudflaredRelease,
    directory: string,
    options: DownloadOptions,
  ): Promise<CloudflaredStagedArtifact>;
}

export class SafeCloudflaredArtifactDownloader implements CloudflaredArtifactDownloader {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  async stage(
    release: CloudflaredRelease,
    directory: string,
    options: DownloadOptions,
  ): Promise<CloudflaredStagedArtifact> {
    assertOfficialCloudflaredAssetUrl(release.asset.url, release.tag);
    await mkdir(directory, { recursive: true });
    const temporaryPath = join(directory, `${release.asset.name}.${randomUUID()}.part`);
    try {
      const response = await this.http.request(release.asset.url, {
        method: "GET",
        timeoutMs: options.timeoutMs,
        maxBytes: release.asset.size + 1,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new BridgeError(
          ERROR_CODES.DOWNLOAD_FAILED,
          `The official cloudflared asset returned HTTP ${response.status}`,
        );
      }
      const handle = await open(temporaryPath, "wx");
      try {
        await handle.write(response.body, 0, response.body.byteLength, 0);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const actual = await verifyFile(temporaryPath, release.asset.size, release.asset.sha256);
      const candidatePath = temporaryPath.replace(/\.part$/, ".candidate");
      await rename(temporaryPath, candidatePath);
      return { path: candidatePath, ...actual };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        ERROR_CODES.DOWNLOAD_FAILED,
        "The cloudflared release asset could not be staged",
        undefined,
        { cause: error },
      );
    }
  }
}

async function verifyFile(
  filePath: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<{ readonly size: number; readonly sha256: string }> {
  const contents = await readFile(filePath);
  const size = (await stat(filePath)).size;
  if (size !== expectedSize || contents.byteLength !== expectedSize) {
    throw new BridgeError(
      ERROR_CODES.SIZE_MISMATCH,
      "The cloudflared release asset size does not match official metadata",
      { expectedSize, actualSize: size },
    );
  }
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (sha256 !== expectedSha256) {
    throw new BridgeError(
      ERROR_CODES.CHECKSUM_MISMATCH,
      "The cloudflared release asset SHA-256 does not match official metadata",
      { expectedSha256, actualSha256: sha256 },
    );
  }
  return { size, sha256 };
}
