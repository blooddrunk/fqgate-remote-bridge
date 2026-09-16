export const ERROR_CODES = {
  CONFIG_INVALID: "CONFIG_INVALID",
  MANIFEST_FETCH_FAILED: "MANIFEST_FETCH_FAILED",
  MANIFEST_INVALID: "MANIFEST_INVALID",
  PACKAGE_NOT_FOUND: "PACKAGE_NOT_FOUND",
  PACKAGE_AMBIGUOUS: "PACKAGE_AMBIGUOUS",
  DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
  SIZE_MISMATCH: "SIZE_MISMATCH",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  CANDIDATE_INVALID: "CANDIDATE_INVALID",
  VERSION_INCOMPATIBLE: "VERSION_INCOMPATIBLE",
  PROCESS_START_FAILED: "PROCESS_START_FAILED",
  PROCESS_STOP_FAILED: "PROCESS_STOP_FAILED",
  PROCESS_IDENTITY_MISMATCH: "PROCESS_IDENTITY_MISMATCH",
  HEALTH_TIMEOUT: "HEALTH_TIMEOUT",
  HEALTH_INVALID: "HEALTH_INVALID",
  UPSTREAM_RESPONSE_INVALID: "UPSTREAM_RESPONSE_INVALID",
  BRIDGE_NOT_READY: "BRIDGE_NOT_READY",
  FQGATE_NOT_INSTALLED: "FQGATE_NOT_INSTALLED",
  FQGATE_NOT_RUNNING: "FQGATE_NOT_RUNNING",
  FQGATE_INCOMPATIBLE: "FQGATE_INCOMPATIBLE",
  FQGATE_UNHEALTHY: "FQGATE_UNHEALTHY",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  QR_FLOW_INVALID: "QR_FLOW_INVALID",
  QR_FLOW_LIMIT: "QR_FLOW_LIMIT",
  QR_FLOW_EXPIRED: "QR_FLOW_EXPIRED",
  QR_FLOW_REPLACED: "QR_FLOW_REPLACED",
  REQUEST_INVALID: "REQUEST_INVALID",
  REQUEST_TOO_LARGE: "REQUEST_TOO_LARGE",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  ACTIVATION_FAILED: "ACTIVATION_FAILED",
  ROLLBACK_FAILED: "ROLLBACK_FAILED",
  STATE_INVALID: "STATE_INVALID",
  NOT_INSTALLED: "NOT_INSTALLED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type BridgeErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: BridgeErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BridgeError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isBridgeError(error: unknown): error is BridgeError {
  return error instanceof BridgeError;
}

export function toBridgeError(
  error: unknown,
  fallbackCode: BridgeErrorCode,
  fallbackMessage: string,
): BridgeError {
  if (isBridgeError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new BridgeError(fallbackCode, error.message, undefined, { cause: error });
  }

  return new BridgeError(fallbackCode, fallbackMessage, { cause: String(error) });
}
