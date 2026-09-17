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
      "无法连接本机桥接，请确认本机操作台正在运行。",
      "UPSTREAM_UNAVAILABLE",
      0,
      undefined,
    );
  }

  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new BridgeApiError("桥接返回了无法识别的响应。", "INTERNAL_ERROR", response.status);
  }
  if (!response.ok) {
    const error = readError(value);
    throw new BridgeApiError(
      localizedMessage(error.code, error.message),
      error.code,
      response.status,
      error.requestId,
    );
  }
  return value as T;
}

function readError(value: unknown): {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
} {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return { code: "INTERNAL_ERROR", message: "桥接暂时无法完成请求。" };
  }
  const error = value.error;
  if (typeof error !== "object" || error === null) {
    return { code: "INTERNAL_ERROR", message: "桥接暂时无法完成请求。" };
  }
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : "INTERNAL_ERROR",
    message: typeof record.message === "string" ? record.message : "桥接暂时无法完成请求。",
    ...(typeof record.requestId === "string" ? { requestId: record.requestId } : {}),
  };
}

function localizedMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    FQGATE_NOT_INSTALLED: "尚未安装 FQGate，请先完成安装。",
    FQGATE_NOT_RUNNING: "FQGate 尚未运行，请先启动 FQGate。",
    FQGATE_INCOMPATIBLE: "当前 FQGate 版本未通过兼容性验证。",
    FQGATE_UNHEALTHY: "FQGate 健康检查未通过。",
    UPSTREAM_UNAVAILABLE: "暂时无法连接 FQGate，请检查它是否正在运行。",
    QR_FLOW_EXPIRED: "二维码已过期，请重新生成。",
    QR_FLOW_REPLACED: "二维码已被替换，请重新生成。",
    QR_FLOW_INVALID: "扫码流程已失效，请重新生成二维码。",
    INTERNAL_ERROR: "桥接暂时无法完成请求，请稍后重试。",
  };
  return messages[code] ?? (fallback.length > 0 ? fallback : "桥接暂时无法完成请求。");
}
