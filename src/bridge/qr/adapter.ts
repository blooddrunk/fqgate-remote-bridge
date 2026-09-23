import { Buffer } from "node:buffer";
import { BridgeError, ERROR_CODES, isBridgeError } from "../../shared/errors.js";
import {
  decodeResponseText,
  type HttpResponse,
  type HttpTransport,
} from "../../fqgate/release/http.js";
import { decodeFqgateResponseEnvelope } from "../../fqgate/http/envelope.js";
import { validateLoopbackBaseUrl } from "../../config/config.js";

export const QR_FLOW_TTL_MS = 2 * 60 * 1_000;
export const QR_MAX_IMAGE_BYTES = 512 * 1_024;
export const QR_MAX_ENCODED_IMAGE_LENGTH = Math.ceil((QR_MAX_IMAGE_BYTES * 4) / 3) + 4;
export const QR_MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;

export type QrPendingStatus = "waiting_for_scan" | "waiting_for_confirmation";

export interface QrBeginUpstreamResult {
  readonly flowId: number;
  readonly imageBase64: string;
  readonly mediaType: QrMediaType;
  readonly status: QrPendingStatus;
}

export interface QrPollUpstreamResult {
  readonly status: QrPendingStatus | "connected";
  readonly connected: boolean;
  readonly loginMethod?: string;
}

export type QrMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface FqgateQrAdapterOptions {
  readonly baseUrl: string;
  readonly http: HttpTransport;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

const VALID_MEDIA_TYPES = new Set<QrMediaType>(["image/png", "image/jpeg", "image/webp"]);
const VALID_PENDING_STATUSES = new Set<QrPendingStatus>([
  "waiting_for_scan",
  "waiting_for_confirmation",
]);

export class FqgateQrAdapter {
  private readonly beginEndpoint: string;
  private readonly pollEndpoint: string;
  private readonly http: HttpTransport;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: FqgateQrAdapterOptions) {
    const base = new URL(validateLoopbackBaseUrl(options.baseUrl));
    this.beginEndpoint = `${base.origin}/v1/market/session/qr/begin`;
    this.pollEndpoint = `${base.origin}/v1/market/session/qr/poll`;
    this.http = options.http;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxResponseBytes = options.maxResponseBytes ?? QR_MAX_RESPONSE_BYTES;
  }

  async begin(): Promise<QrBeginUpstreamResult> {
    const response = await this.request(this.beginEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ cache_credentials: false }),
    });
    const data = this.decodeData(response);
    return decodeBeginData(data);
  }

  async poll(flowId: number): Promise<QrPollUpstreamResult> {
    if (!Number.isSafeInteger(flowId) || flowId <= 0) {
      throw new BridgeError(ERROR_CODES.QR_FLOW_INVALID, "The upstream QR flow is invalid");
    }
    const response = await this.request(this.pollEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ flow_id: flowId }),
    });
    const data = this.decodeData(response);
    return decodePollData(data);
  }

  private async request(
    endpoint: string,
    options: {
      readonly method: "POST";
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
    },
  ) {
    try {
      const response = await this.http.request(endpoint, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxResponseBytes,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new BridgeError(
          ERROR_CODES.UPSTREAM_UNAVAILABLE,
          "FQGate QR endpoint returned an HTTP error",
        );
      }
      return response;
    } catch (error) {
      if (isBridgeError(error) && error.code === ERROR_CODES.UPSTREAM_RESPONSE_INVALID) {
        throw normalizeUpstreamError(error);
      }
      if (isBridgeError(error) && error.code === ERROR_CODES.QR_FLOW_EXPIRED) {
        throw error;
      }
      if (isBridgeError(error) && error.code === ERROR_CODES.QR_FLOW_REPLACED) {
        throw error;
      }
      throw new BridgeError(
        ERROR_CODES.UPSTREAM_UNAVAILABLE,
        "FQGate QR endpoint is unavailable",
        undefined,
        {
          cause: error,
        },
      );
    }
  }

  private decodeData(response: HttpResponse): unknown {
    let value: unknown;
    try {
      value = JSON.parse(decodeResponseText(response));
    } catch (error) {
      throw new BridgeError(
        ERROR_CODES.UPSTREAM_RESPONSE_INVALID,
        "FQGate QR response is not valid JSON",
        undefined,
        {
          cause: error,
        },
      );
    }

    try {
      return decodeFqgateResponseEnvelope(value).data;
    } catch (error) {
      throw normalizeUpstreamError(error);
    }
  }
}

function normalizeUpstreamError(error: unknown): BridgeError {
  if (isBridgeError(error)) {
    const upstreamCode = error.details?.upstreamCode;
    if (upstreamCode === 1003) {
      return new BridgeError(ERROR_CODES.QR_FLOW_EXPIRED, "The FQGate QR flow expired", undefined, {
        cause: error,
      });
    }
    if (upstreamCode === 3014) {
      return new BridgeError(
        ERROR_CODES.QR_FLOW_REPLACED,
        "The FQGate QR flow was replaced",
        undefined,
        {
          cause: error,
        },
      );
    }
    return error;
  }
  return new BridgeError(
    ERROR_CODES.UPSTREAM_RESPONSE_INVALID,
    "FQGate QR response is invalid",
    undefined,
    {
      cause: error,
    },
  );
}

function decodeBeginData(value: unknown): QrBeginUpstreamResult {
  const record = requireRecord(value, "begin");
  const flowId = record.flow_id;
  if (typeof flowId !== "number" || !Number.isSafeInteger(flowId) || flowId <= 0) {
    throw invalidQrResponse("FQGate QR begin flow_id is invalid");
  }

  const imageBase64 = record.qr_image_base64;
  if (typeof imageBase64 !== "string" || !isValidBase64Image(imageBase64)) {
    throw invalidQrResponse("FQGate QR begin image payload is invalid or too large");
  }

  const mediaType = readMediaType(record.qr_media_type);
  const status = readPendingStatus(record.status);
  return { flowId, imageBase64, mediaType, status };
}

function decodePollData(value: unknown): QrPollUpstreamResult {
  const record = requireRecord(value, "poll");
  const connected = record.connected;
  if (connected !== undefined && typeof connected !== "boolean") {
    throw invalidQrResponse("FQGate QR poll connected must be a boolean when present");
  }

  const loginMethod = readOptionalText(record.login_method, "login_method");
  if (connected) {
    return {
      status: "connected",
      connected: true,
      ...(loginMethod === undefined ? {} : { loginMethod }),
    };
  }

  return {
    status: readPendingStatus(record.status),
    connected: false,
  };
}

function requireRecord(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidQrResponse(`FQGate QR ${operation} data must be an object`);
  }
  return value as Record<string, unknown>;
}

function readMediaType(value: unknown): QrMediaType {
  if (typeof value !== "string" || !VALID_MEDIA_TYPES.has(value as QrMediaType)) {
    throw invalidQrResponse("FQGate QR image media type is not supported");
  }
  return value as QrMediaType;
}

function readPendingStatus(value: unknown): QrPendingStatus {
  if (typeof value !== "string" || !VALID_PENDING_STATUSES.has(value as QrPendingStatus)) {
    throw invalidQrResponse("FQGate QR status is not a supported pending state");
  }
  return value as QrPendingStatus;
}

function readOptionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > 128) {
    throw invalidQrResponse(`FQGate QR ${field} is invalid`);
  }
  return value.length === 0 ? undefined : value;
}

function isValidBase64Image(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > QR_MAX_ENCODED_IMAGE_LENGTH ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 === 1
  ) {
    return false;
  }
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength > 0 && bytes.byteLength <= QR_MAX_IMAGE_BYTES;
}

function invalidQrResponse(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.UPSTREAM_RESPONSE_INVALID, message);
}
