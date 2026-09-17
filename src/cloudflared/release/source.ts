import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { decodeResponseText, type HttpTransport } from "../../fqgate/release/http.js";
import {
  CLOUDFLARED_RELEASE_API_BASE,
  CLOUDFLARED_RELEASE_ASSET_NAME,
  CLOUDFLARED_RELEASE_REPOSITORY,
  type CloudflaredRelease,
  type CloudflaredReleaseSource,
} from "./types.js";

const RELEASE_VERSION_PATTERN = /^\d{4}\.\d+\.\d+$/;

export class OfficialCloudflaredReleaseSource implements CloudflaredReleaseSource {
  private readonly http: HttpTransport;
  private readonly version: string;
  private readonly timeoutMs: number;

  constructor(http: HttpTransport, version: string, timeoutMs = 15_000) {
    assertCloudflaredVersion(version);
    this.http = http;
    this.version = version;
    this.timeoutMs = timeoutMs;
  }

  async getRelease(): Promise<CloudflaredRelease> {
    const url = `${CLOUDFLARED_RELEASE_API_BASE}${encodeURIComponent(this.version)}`;
    let response;
    try {
      response = await this.http.request(url, {
        method: "GET",
        timeoutMs: this.timeoutMs,
        maxBytes: 2 * 1024 * 1024,
        headers: { accept: "application/vnd.github+json" },
      });
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_RELEASE_FETCH_FAILED,
        "Unable to fetch the fixed official cloudflared release metadata",
        undefined,
        { cause: error },
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_RELEASE_FETCH_FAILED,
        `The official cloudflared release metadata returned HTTP ${response.status}`,
      );
    }
    try {
      return parseOfficialCloudflaredRelease(
        JSON.parse(decodeResponseText(response)) as unknown,
        this.version,
      );
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
        "The official cloudflared release metadata is not valid JSON",
        undefined,
        { cause: error },
      );
    }
  }
}

export function parseOfficialCloudflaredRelease(
  value: unknown,
  expectedVersion: string,
): CloudflaredRelease {
  assertCloudflaredVersion(expectedVersion);
  if (!isRecord(value)) invalidRelease("release metadata must be an object");

  const tag = readString(value, "tag_name");
  if (tag !== expectedVersion || !RELEASE_VERSION_PATTERN.test(tag)) {
    invalidRelease("release identity does not match the selected official version");
  }
  const assets = value.assets;
  if (!Array.isArray(assets)) invalidRelease("release assets are missing");
  const asset = assets.find(
    (candidate) => isRecord(candidate) && candidate.name === CLOUDFLARED_RELEASE_ASSET_NAME,
  );
  if (!isRecord(asset)) invalidRelease("the official Windows x64 asset is missing");

  const assetUrl = readString(asset, "browser_download_url");
  assertOfficialCloudflaredAssetUrl(assetUrl, tag);
  const size = asset.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    invalidRelease("the official Windows x64 asset size is invalid");
  }

  const body = typeof value.body === "string" ? value.body : "";
  const bodySha256 = readBodySha256(body);
  const digestSha256 = readDigestSha256(asset.digest);
  if (bodySha256 !== undefined && digestSha256 !== undefined && bodySha256 !== digestSha256) {
    invalidRelease("the official release integrity values disagree");
  }
  const sha256 = digestSha256 ?? bodySha256;
  if (sha256 === undefined) {
    invalidRelease("the official release does not publish a SHA-256 value for the asset");
  }

  const releasePageUrl = `https://github.com/${CLOUDFLARED_RELEASE_REPOSITORY}/releases/tag/${tag}`;
  if (value.html_url !== undefined && value.html_url !== releasePageUrl) {
    invalidRelease("the release page identity is outside the fixed official repository");
  }

  return {
    source: "cloudflare-github",
    version: tag,
    tag,
    publishedAt: typeof value.published_at === "string" ? value.published_at : null,
    releasePageUrl,
    asset: {
      name: CLOUDFLARED_RELEASE_ASSET_NAME,
      url: assetUrl,
      size,
      sha256,
    },
  };
}

export function assertCloudflaredVersion(value: string): void {
  if (!RELEASE_VERSION_PATTERN.test(value)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
      "cloudflared version must use the official YYYY.M.patch format",
    );
  }
}

export function assertOfficialCloudflaredAssetUrl(value: string, tag: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
      "The cloudflared release asset URL is invalid",
      undefined,
      { cause: error },
    );
  }
  const expectedPath = `/cloudflare/cloudflared/releases/download/${tag}/${CLOUDFLARED_RELEASE_ASSET_NAME}`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.pathname !== expectedPath ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_RELEASE_INVALID,
      "The cloudflared release asset is outside the fixed official Cloudflare repository",
    );
  }
}

function readBodySha256(body: string): string | undefined {
  const expression = new RegExp(
    `${escapeRegExp(CLOUDFLARED_RELEASE_ASSET_NAME)}\\s*:\\s*([a-f0-9]{64})(?:\\s|$)`,
    "im",
  );
  const match = expression.exec(body);
  return match?.[1]?.toLowerCase();
}

function readDigestSha256(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value)) {
    invalidRelease("the official asset digest is invalid");
  }
  return value.slice("sha256:".length).toLowerCase();
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    invalidRelease(`release metadata field ${key} is invalid`);
  }
  return value;
}

function invalidRelease(message: string): never {
  throw new BridgeError(ERROR_CODES.CLOUDFLARED_RELEASE_INVALID, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
