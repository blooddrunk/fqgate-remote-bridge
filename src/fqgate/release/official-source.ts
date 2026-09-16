import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { decodeResponseText, type HttpTransport } from "./http.js";
import { parseStableManifest } from "./manifest.js";
import type { FqgateRelease, FqgateReleaseSource } from "./types.js";

export class OfficialFqgateReleaseSource implements FqgateReleaseSource {
  private readonly http: HttpTransport;
  private readonly manifestUrl: string;
  private readonly timeoutMs: number;

  constructor(http: HttpTransport, manifestUrl: string, timeoutMs = 15_000) {
    assertOfficialManifestUrl(manifestUrl);
    this.http = http;
    this.manifestUrl = manifestUrl;
    this.timeoutMs = timeoutMs;
  }

  async getStableRelease(): Promise<FqgateRelease> {
    let response;
    try {
      response = await this.http.request(this.manifestUrl, {
        method: "GET",
        timeoutMs: this.timeoutMs,
        maxBytes: 1_048_576,
      });
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.MANIFEST_FETCH_FAILED,
        "Unable to fetch the official FQGate stable manifest",
        undefined,
        { cause: error },
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new BridgeError(
        ERROR_CODES.MANIFEST_FETCH_FAILED,
        `Official FQGate stable manifest returned HTTP ${response.status}`,
      );
    }

    try {
      return parseStableManifest(JSON.parse(decodeResponseText(response)) as unknown);
    } catch (error) {
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new BridgeError(
        ERROR_CODES.MANIFEST_INVALID,
        "Official FQGate stable manifest could not be parsed",
        undefined,
        { cause: error },
      );
    }
  }
}

function assertOfficialManifestUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_FETCH_FAILED,
      "Official FQGate manifest URL is invalid",
      undefined,
      { cause: error },
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "raw.githubusercontent.com" ||
    url.pathname !== "/zhuyifang/fqgate-releases/main/releases/stable.json" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_FETCH_FAILED,
      "FQGate manifest URL is outside the official stable source",
    );
  }
}
