import type {
  BridgeOpenApiCatalogResponse,
  BridgeCapabilitiesResponse,
  BridgeStatusResponse,
  BridgeUpdateStatusResponse,
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

export async function fetchUpdateStatus(signal?: AbortSignal): Promise<BridgeUpdateStatusResponse> {
  return fetchJson<BridgeUpdateStatusResponse>(
    "/api/v1/updates/status",
    signal === undefined ? undefined : { signal },
  );
}

export async function checkForUpdate(): Promise<BridgeUpdateStatusResponse> {
  return postEmpty<BridgeUpdateStatusResponse>("/api/v1/updates/check");
}

export async function planInstallOrUpdate(): Promise<BridgeUpdateStatusResponse> {
  return postEmpty<BridgeUpdateStatusResponse>("/api/v1/updates/plan");
}

export async function applyUpdate(planId: string): Promise<BridgeUpdateStatusResponse> {
  return fetchJson<BridgeUpdateStatusResponse>("/api/v1/updates/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
}

export async function fetchOpenApiCatalog(
  signal?: AbortSignal,
): Promise<BridgeOpenApiCatalogResponse> {
  return fetchJson<BridgeOpenApiCatalogResponse>(
    "/api/v1/openapi/catalog",
    signal === undefined ? undefined : { signal },
  );
}

export async function refreshOpenApiCatalog(): Promise<BridgeOpenApiCatalogResponse> {
  return postEmpty<BridgeOpenApiCatalogResponse>("/api/v1/openapi/refresh");
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

async function postEmpty<T>(input: RequestInfo | URL): Promise<T> {
  return fetchJson<T>(input, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
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
    OPENAPI_FETCH_FAILED: "无法读取 FQGate 当前 API 文档，请确认 FQGate 正在运行。",
    OPENAPI_RESPONSE_TOO_LARGE: "FQGate API 文档超过安全大小限制。",
    OPENAPI_INVALID: "FQGate 当前 API 文档无效。",
    OPENAPI_CONTRACT_MISSING: "FQGate 当前版本缺少桥接所需接口契约。",
    UPDATE_CONFIRMATION_STALE: "安装计划已过期，请重新检查并预览。",
    UPDATE_IN_PROGRESS: "已有 FQGate 更新事务正在执行，请稍候。",
    MANIFEST_FETCH_FAILED: "无法读取固定可信源的 FQGate 发布清单。",
    MANIFEST_INVALID: "可信源返回的 FQGate 发布清单无效。",
    DOWNLOAD_FAILED: "FQGate 下载失败。",
    SIZE_MISMATCH: "FQGate 下载大小与清单不一致。",
    CHECKSUM_MISMATCH: "FQGate 下载校验和与清单不一致。",
    CANDIDATE_INVALID: "FQGate 候选程序未通过版本校验。",
    VERSION_INCOMPATIBLE: "候选 FQGate 版本未通过兼容性策略。",
    HEALTH_TIMEOUT: "候选 FQGate 健康检查超时，已拒绝激活。",
    ROLLBACK_FAILED: "FQGate 激活失败且回滚未完成，请使用 CLI 诊断。",
    INTERNAL_ERROR: "桥接暂时无法完成请求，请稍后重试。",
  };
  return messages[code] ?? (fallback.length > 0 ? fallback : "桥接暂时无法完成请求。");
}
