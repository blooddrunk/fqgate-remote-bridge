import type {
  BridgeCapabilitiesResponse,
  BridgeStatusResponse,
  QrBeginResponse,
  QrPollResponse,
} from "../../bridge/contracts.js";

export class BridgeApiError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly status: number;

  constructor(message: string, code: string, status: number, requestId?: string) {
    super(message);
    this.name = "BridgeApiError";
    this.code = code;
    this.status = status;
    if (requestId !== undefined) this.requestId = requestId;
  }
}

export async function fetchStatus(signal?: AbortSignal): Promise<BridgeStatusResponse> {
  return fetchJson<BridgeStatusResponse>(
    "/api/v1/status",
    signal === undefined ? undefined : { signal },
  );
}

export async function fetchCapabilities(signal?: AbortSignal): Promise<BridgeCapabilitiesResponse> {
  return fetchJson<BridgeCapabilitiesResponse>(
    "/api/v1/capabilities",
    signal === undefined ? undefined : { signal },
  );
}

export async function beginQrLogin(): Promise<QrBeginResponse> {
  return fetchJson<QrBeginResponse>("/api/v1/session/qr/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export async function pollQrLogin(
  sessionId: string,
  signal?: AbortSignal,
): Promise<QrPollResponse> {
  return fetchJson<QrPollResponse>("/api/v1/session/qr/poll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
    ...(signal === undefined ? {} : { signal }),
  });
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, credentials: "same-origin" });
  } catch {
    throw new BridgeApiError(
      "The bridge could not be reached. Check that it is running on this PC.",
      "UPSTREAM_UNAVAILABLE",
      0,
      undefined,
    );
  }

  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new BridgeApiError(
      "The bridge returned an invalid response.",
      "INTERNAL_ERROR",
      response.status,
    );
  }
  if (!response.ok) {
    const error = readError(value);
    throw new BridgeApiError(error.message, error.code, response.status, error.requestId);
  }
  return value as T;
}

function readError(value: unknown): {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
} {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return { code: "INTERNAL_ERROR", message: "The bridge could not complete the request." };
  }
  const error = value.error;
  if (typeof error !== "object" || error === null) {
    return { code: "INTERNAL_ERROR", message: "The bridge could not complete the request." };
  }
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : "INTERNAL_ERROR",
    message:
      typeof record.message === "string"
        ? record.message
        : "The bridge could not complete the request.",
    ...(typeof record.requestId === "string" ? { requestId: record.requestId } : {}),
  };
}
