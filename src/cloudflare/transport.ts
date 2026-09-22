import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { Redactor } from "../shared/redaction.js";
import {
  CLOUDFLARE_API_BASE_URL,
  type CloudflareApiTokenEnvironment,
  type CloudflareGetResponse,
  type CloudflareGetTransport,
} from "./types.js";

export const CLOUDFLARE_DEFAULT_TIMEOUT_MS = 15_000;
export const CLOUDFLARE_DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

export interface CloudflareGetTransportOptions {
  readonly apiToken: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

export function getCloudflareApiToken(
  environment: CloudflareApiTokenEnvironment = process.env,
): string {
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (
    token === undefined ||
    token.length === 0 ||
    token.length > 4_096 ||
    token.trim() !== token ||
    hasControlCharacter(token)
  ) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_TOKEN_REQUIRED,
      "A short-lived least-privilege Cloudflare read token is required in CLOUDFLARE_API_TOKEN; never use a Global API Key",
    );
  }
  return token;
}

export class FetchCloudflareGetTransport implements CloudflareGetTransport {
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly redactor = new Redactor();

  constructor(options: CloudflareGetTransportOptions) {
    if (
      options.apiToken.length === 0 ||
      options.apiToken.length > 4_096 ||
      options.apiToken.trim() !== options.apiToken ||
      hasControlCharacter(options.apiToken)
    ) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_TOKEN_REQUIRED,
        "The Cloudflare API token is empty or contains surrounding whitespace",
      );
    }
    this.apiToken = options.apiToken;
    this.timeoutMs = options.timeoutMs ?? CLOUDFLARE_DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? CLOUDFLARE_DEFAULT_MAX_RESPONSE_BYTES;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1_000 ||
      this.timeoutMs > 120_000
    ) {
      throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "Cloudflare API timeout is out of bounds");
    }
    if (
      !Number.isSafeInteger(this.maxResponseBytes) ||
      this.maxResponseBytes < 16 * 1024 ||
      this.maxResponseBytes > 8 * 1024 * 1024
    ) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Cloudflare API response limit is out of bounds",
      );
    }
  }

  async get(
    path: string,
    query?: Readonly<Record<string, string>>,
  ): Promise<CloudflareGetResponse> {
    const url = buildCloudflareApiUrl(path, query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiToken}`,
        },
      });
      const body = await readBoundedBody(response, this.maxResponseBytes, controller.signal);
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(body)) as unknown;
      } catch {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID,
          "Cloudflare API returned a non-JSON response",
        );
      }
      return { status: response.status, payload };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
          `Cloudflare API GET timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
        "Cloudflare API GET failed",
        this.redactor.redact({ path }) as Record<string, unknown>,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildCloudflareApiUrl(
  path: string,
  query?: Readonly<Record<string, string>>,
): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\\") ||
    hasControlCharacter(path) ||
    path.split("/").some((segment) => segment === ".." || segment === ".") ||
    !isAllowedCloudflareGetPath(path)
  ) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
      "Cloudflare API path is not an allowlisted Phase 6-A read endpoint",
    );
  }
  const url = new URL(`${CLOUDFLARE_API_BASE_URL}${path}`);
  if (url.origin !== new URL(CLOUDFLARE_API_BASE_URL).origin) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
      "Cloudflare API path escaped the fixed API origin",
    );
  }
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (
        !new Set(["account.id", "name", "page", "per_page"]).has(key) ||
        value.length > 256 ||
        hasControlCharacter(value)
      ) {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
          "Cloudflare API query parameters are invalid",
        );
      }
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function isAllowedCloudflareGetPath(path: string): boolean {
  const id = "[A-Za-z0-9_-]+";
  return [
    /^\/accounts$/,
    new RegExp(`^\\/accounts\\/${id}$`),
    /^\/zones$/,
    new RegExp(`^\\/accounts\\/${id}\\/cfd_tunnel$`),
    new RegExp(`^\\/accounts\\/${id}\\/cfd_tunnel\\/${id}$`),
    new RegExp(`^\\/accounts\\/${id}\\/cfd_tunnel\\/${id}\\/configurations$`),
    new RegExp(`^\\/zones\\/${id}\\/dns_records$`),
    new RegExp(`^\\/accounts\\/${id}\\/access\\/apps$`),
    new RegExp(`^\\/accounts\\/${id}\\/access\\/apps\\/${id}\\/policies$`),
  ].some((pattern) => pattern.test(path));
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Cloudflare API response exceeds the configured limit").catch(() => {
          // The bounded-response failure is the actionable error even if the
          // underlying stream refuses cancellation.
        });
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE,
          "Cloudflare API response exceeds the configured size limit",
        );
      }
      chunks.push(result.value);
      if (signal.aborted) {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_REQUEST_FAILED,
          "Cloudflare API GET timed out",
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
