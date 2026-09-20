import { BridgeError, ERROR_CODES } from "../../shared/errors.js";

export interface HttpRequestOptions {
  readonly method?: "GET" | "POST";
  readonly redirect?: "error" | "manual";
  readonly timeoutMs: number;
  readonly maxBytes?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface HttpTransport {
  request(url: string, options: HttpRequestOptions): Promise<HttpResponse>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function assertAllowedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "HTTP request URL is invalid", undefined, {
      cause: error,
    });
  }

  const isLoopback = LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  if ((url.protocol !== "https:" && !isLoopback) || url.username || url.password) {
    throw new BridgeError(
      ERROR_CODES.DOWNLOAD_FAILED,
      "HTTP requests must use HTTPS or an authenticated-free loopback URL",
    );
  }
  return url;
}

export class FetchHttpTransport implements HttpTransport {
  async request(urlValue: string, options: HttpRequestOptions): Promise<HttpResponse> {
    const url = assertAllowedUrl(urlValue);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: options.method ?? "GET",
        signal: controller.signal,
        ...(options.redirect === undefined ? {} : { redirect: options.redirect }),
      };
      if (options.body !== undefined) {
        requestInit.body = options.body;
      }
      if (options.headers !== undefined) {
        requestInit.headers = options.headers;
      }
      const response = await fetch(url, requestInit);
      const body = await readResponseBody(response, options.maxBytes, controller.signal);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: response.status, headers, body };
    } catch (error) {
      if (error instanceof BridgeError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new BridgeError(
          ERROR_CODES.DOWNLOAD_FAILED,
          `HTTP request timed out after ${options.timeoutMs}ms`,
        );
      }
      throw new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "HTTP request failed", undefined, {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readResponseBody(
  response: Response,
  maxBytes: number | undefined,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      total += result.value.byteLength;
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel("response exceeds configured limit");
        throw new BridgeError(
          ERROR_CODES.DOWNLOAD_FAILED,
          "HTTP response exceeds the configured size limit",
        );
      }
      chunks.push(result.value);
      if (signal.aborted) {
        throw new BridgeError(ERROR_CODES.DOWNLOAD_FAILED, "HTTP request timed out");
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

export function decodeResponseText(response: HttpResponse): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(response.body);
}
