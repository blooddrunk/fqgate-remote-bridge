import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { Redactor } from "../../shared/redaction.js";

export interface FqgateResponseEnvelope<T> {
  readonly code: number;
  readonly message: string;
  readonly data: T;
}

export interface DecodedFqgateResponse<T> {
  readonly code: 0;
  readonly message: string;
  readonly data: T;
}

/**
 * Decode the common JSON response envelope used by FQGate HTTP APIs.
 *
 * Endpoint-specific adapters remain responsible for validating the shape of
 * `data`; this boundary only accepts a successful, structurally valid
 * envelope and never treats an error payload as endpoint data.
 */
export function decodeFqgateResponseEnvelope<T = unknown>(
  value: unknown,
): DecodedFqgateResponse<T> {
  if (!isRecord(value)) {
    throw invalidEnvelope("FQGate HTTP response envelope must be a JSON object");
  }

  const code = value.code;
  if (typeof code !== "number" || !Number.isSafeInteger(code)) {
    throw invalidEnvelope("FQGate HTTP response envelope.code must be a safe integer");
  }

  const message = value.message;
  if (typeof message !== "string") {
    throw invalidEnvelope("FQGate HTTP response envelope.message must be a string");
  }

  const sanitizedMessage = sanitizeUpstreamMessage(message);
  if (code !== 0) {
    throw new BridgeError(
      ERROR_CODES.UPSTREAM_RESPONSE_INVALID,
      `FQGate HTTP response returned non-zero code ${code}${
        sanitizedMessage.length === 0 ? "" : `: ${sanitizedMessage}`
      }`,
      {
        upstreamCode: code,
        upstreamMessage: sanitizedMessage,
      },
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(value, "data") ||
    value.data === null ||
    value.data === undefined
  ) {
    throw invalidEnvelope("FQGate HTTP response envelope.data must be a non-null JSON value");
  }

  return {
    code: 0,
    message: sanitizedMessage,
    data: value.data as T,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidEnvelope(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.UPSTREAM_RESPONSE_INVALID, message);
}

function sanitizeUpstreamMessage(message: string): string {
  const redacted = new Redactor().redact(message.replace(/\s+/g, " ").trim());
  return (typeof redacted === "string" ? redacted : "").slice(0, 512);
}
