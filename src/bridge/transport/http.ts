import { randomUUID } from "node:crypto";
import type { BridgeService } from "../service.js";
import {
  type BridgeOperationId,
  type BridgeOperationPolicy,
  findBridgeOperation,
  findBridgeOperationsForPath,
  getBridgeOperation,
} from "../policy/registry.js";
import { BridgeError, ERROR_CODES, toBridgeError } from "../../shared/errors.js";
import { StructuredLogger } from "../../shared/logger.js";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "no-store",
};

export interface BridgeHttpHandlerOptions {
  readonly service: BridgeService;
  readonly logger?: StructuredLogger;
  readonly requestIdFactory?: () => string;
}

export type BridgeHttpHandler = (
  request: Request,
  expectedOperation?: BridgeOperationId,
) => Promise<Response>;

export function createBridgeHttpHandler(options: BridgeHttpHandlerOptions): BridgeHttpHandler {
  const logger = options.logger ?? new StructuredLogger({ level: "warn" });
  const requestIdFactory = options.requestIdFactory ?? randomUUID;

  return async (request, expectedOperation) => {
    const requestId = requestIdFactory();
    let operation: BridgeOperationPolicy | undefined;
    try {
      operation = resolveOperation(request, expectedOperation);
      const payload = await dispatchRequest(request, operation, options.service);
      return jsonResponse(payload, 200);
    } catch (error) {
      const bridgeError = toBridgeError(
        error,
        ERROR_CODES.INTERNAL_ERROR,
        "The bridge could not complete the request",
      );
      logger.warn("Bridge request failed", {
        operationId: operation?.id ?? "unregistered",
        requestId: requestId.slice(0, 12),
        code: bridgeError.code,
      });
      const response = errorResponse(bridgeError, requestId);
      if (bridgeError.code === ERROR_CODES.METHOD_NOT_ALLOWED) {
        const path = safePath(request);
        const allow = findBridgeOperationsForPath(path)
          .map((candidate) => candidate.method)
          .join(", ");
        if (allow.length > 0) response.headers.set("allow", allow);
      }
      return response;
    }
  };
}

export function createBridgeErrorResponse(error: unknown, requestId = randomUUID()): Response {
  return errorResponse(
    toBridgeError(error, ERROR_CODES.BRIDGE_NOT_READY, "The bridge is not ready"),
    requestId,
  );
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveOperation(
  request: Request,
  expectedOperation: BridgeOperationId | undefined,
): BridgeOperationPolicy {
  const path = safePath(request);
  if (new URL(request.url).search.length > 0) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      "Query parameters are not accepted on bridge API routes",
    );
  }

  if (expectedOperation !== undefined) {
    const expected = getBridgeOperation(expectedOperation);
    if (expected.path !== path) {
      throw new BridgeError(ERROR_CODES.ROUTE_NOT_FOUND, "Bridge route was not found");
    }
    if (expected.method !== request.method.toUpperCase()) {
      throw new BridgeError(
        ERROR_CODES.METHOD_NOT_ALLOWED,
        "HTTP method is not allowed for this route",
      );
    }
    return expected;
  }

  const operation = findBridgeOperation(request.method, path);
  if (operation !== undefined) {
    return operation;
  }
  if (findBridgeOperationsForPath(path).length > 0) {
    throw new BridgeError(
      ERROR_CODES.METHOD_NOT_ALLOWED,
      "HTTP method is not allowed for this route",
    );
  }
  throw new BridgeError(ERROR_CODES.ROUTE_NOT_FOUND, "Bridge route was not found");
}

async function dispatchRequest(
  request: Request,
  operation: BridgeOperationPolicy,
  service: BridgeService,
): Promise<unknown> {
  switch (operation.id) {
    case "bridge.version":
      rejectUnexpectedGetBody(request);
      return service.version();
    case "bridge.capabilities":
      rejectUnexpectedGetBody(request);
      return service.capabilities();
    case "bridge.status":
      rejectUnexpectedGetBody(request);
      return service.status();
    case "session.qr.begin":
      rejectBeginBody(await readJsonBody(request, operation.maxBodyBytes, "begin"));
      return service.beginQr();
    case "session.qr.poll": {
      const body = await readJsonBody(request, operation.maxBodyBytes, "poll");
      return service.pollQr(readSessionId(body));
    }
  }
}

function rejectBeginBody(body: Record<string, unknown>): void {
  if (Object.keys(body).length > 0) {
    throw new BridgeError(ERROR_CODES.REQUEST_INVALID, "The begin body must be empty");
  }
}

function rejectUnexpectedGetBody(request: Request): void {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && parseContentLength(contentLength) > 0) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      "GET bridge routes do not accept a request body",
    );
  }
}

async function readJsonBody(
  request: Request,
  maxBytes: number,
  operation: "begin" | "poll",
): Promise<Record<string, unknown>> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null && parseContentLength(contentLengthHeader) > maxBytes) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_TOO_LARGE,
      "The request body exceeds the configured limit",
    );
  }

  const contentType = request.headers.get("content-type");
  if (contentType !== null && !contentType.toLowerCase().startsWith("application/json")) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      "Bridge POST routes require application/json",
    );
  }

  const body = request.body;
  if (body === null) {
    return {};
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request exceeds configured limit");
        throw new BridgeError(
          ERROR_CODES.REQUEST_TOO_LARGE,
          "The request body exceeds the configured limit",
        );
      }
      chunks.push(new Uint8Array(result.value));
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return {};
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      `The ${operation} request body is not valid JSON`,
    );
  }
  if (!isRecord(value)) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      `The ${operation} request body must be a JSON object`,
    );
  }
  return value;
}

function readSessionId(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "sessionId") {
    throw new BridgeError(ERROR_CODES.REQUEST_INVALID, "The poll body must contain only sessionId");
  }
  const sessionId = value.sessionId;
  if (typeof sessionId !== "string" || sessionId.length > 128) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_INVALID,
      "sessionId must be a valid opaque identifier",
    );
  }
  return sessionId;
}

function parseContentLength(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new BridgeError(ERROR_CODES.REQUEST_INVALID, "content-length is invalid");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new BridgeError(
      ERROR_CODES.REQUEST_TOO_LARGE,
      "The request body exceeds the configured limit",
    );
  }
  return length;
}

function jsonResponse(payload: unknown, status: number): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(error: BridgeError, requestId: string): Response {
  const status = httpStatusFor(error.code);
  const payload = {
    error: {
      code: error.code,
      message: publicMessageFor(error.code),
      requestId,
    },
  };
  const response = jsonResponse(payload, status);
  return response;
}

function httpStatusFor(code: string): number {
  switch (code) {
    case ERROR_CODES.REQUEST_INVALID:
      return 400;
    case ERROR_CODES.QR_FLOW_INVALID:
    case ERROR_CODES.ROUTE_NOT_FOUND:
      return 404;
    case ERROR_CODES.METHOD_NOT_ALLOWED:
      return 405;
    case ERROR_CODES.REQUEST_TOO_LARGE:
      return 413;
    case ERROR_CODES.QR_FLOW_EXPIRED:
    case ERROR_CODES.QR_FLOW_REPLACED:
      return 409;
    case ERROR_CODES.FQGATE_NOT_INSTALLED:
    case ERROR_CODES.FQGATE_NOT_RUNNING:
    case ERROR_CODES.FQGATE_INCOMPATIBLE:
    case ERROR_CODES.FQGATE_UNHEALTHY:
    case ERROR_CODES.UPSTREAM_UNAVAILABLE:
    case ERROR_CODES.QR_FLOW_LIMIT:
      return 503;
    case ERROR_CODES.UPSTREAM_RESPONSE_INVALID:
      return 502;
    case ERROR_CODES.BRIDGE_NOT_READY:
    case ERROR_CODES.CONFIG_INVALID:
      return 503;
    default:
      return 500;
  }
}

function publicMessageFor(code: string): string {
  switch (code) {
    case ERROR_CODES.REQUEST_INVALID:
      return "The request is invalid.";
    case ERROR_CODES.REQUEST_TOO_LARGE:
      return "The request body is too large.";
    case ERROR_CODES.ROUTE_NOT_FOUND:
      return "The bridge route was not found.";
    case ERROR_CODES.METHOD_NOT_ALLOWED:
      return "The HTTP method is not allowed for this route.";
    case ERROR_CODES.FQGATE_NOT_INSTALLED:
      return "FQGate is not installed.";
    case ERROR_CODES.FQGATE_NOT_RUNNING:
      return "FQGate is not running.";
    case ERROR_CODES.FQGATE_INCOMPATIBLE:
      return "The active FQGate version is not validated for this operation.";
    case ERROR_CODES.FQGATE_UNHEALTHY:
      return "FQGate health is not ready for this operation.";
    case ERROR_CODES.UPSTREAM_UNAVAILABLE:
      return "FQGate is temporarily unavailable.";
    case ERROR_CODES.UPSTREAM_RESPONSE_INVALID:
      return "FQGate returned an invalid response.";
    case ERROR_CODES.QR_FLOW_INVALID:
      return "The QR login flow is invalid or no longer available.";
    case ERROR_CODES.QR_FLOW_EXPIRED:
      return "The QR login flow expired. Start a new flow.";
    case ERROR_CODES.QR_FLOW_REPLACED:
      return "The QR login flow was replaced. Start a new flow.";
    case ERROR_CODES.QR_FLOW_LIMIT:
      return "Too many QR login flows are active.";
    case ERROR_CODES.BRIDGE_NOT_READY:
      return "The bridge is not ready.";
    default:
      return "The bridge could not complete the request.";
  }
}

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    throw new BridgeError(ERROR_CODES.REQUEST_INVALID, "The request URL is invalid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
