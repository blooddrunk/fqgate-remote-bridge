import { validateLoopbackBaseUrl } from "../../config/config.js";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { decodeFqgateResponseEnvelope } from "../http/envelope.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import type { HealthObservation, SessionState } from "./types.js";

export interface HealthProbeOptions {
  readonly baseUrl: string;
  readonly http: HttpTransport;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly now?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class FqgateHealthProbe {
  private readonly endpoint: string;
  private readonly http: HttpTransport;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly now: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: HealthProbeOptions) {
    const baseUrl = validateLoopbackBaseUrl(options.baseUrl);
    this.endpoint = `${baseUrl}/v1/market/health`;
    this.http = options.http;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.maxBytes = options.maxBytes ?? 1_048_576;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  }

  async probe(): Promise<HealthObservation> {
    const checkedAt = this.now();
    let response;
    try {
      response = await this.http.request(this.endpoint, {
        method: "GET",
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxBytes,
      });
    } catch {
      return {
        endpoint: this.endpoint,
        checkedAt,
        available: false,
        validPayload: false,
        networkReady: null,
        connected: null,
        session: "unknown",
        level2Permission: null,
        diagnostics: { availability: "unavailable" },
      };
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        endpoint: this.endpoint,
        checkedAt,
        available: false,
        validPayload: false,
        httpStatus: response.status,
        networkReady: null,
        connected: null,
        session: "unknown",
        level2Permission: null,
        diagnostics: { availability: "http_error", httpStatus: response.status },
      };
    }

    let value: unknown;
    try {
      value = JSON.parse(decodeResponseText(response)) as unknown;
    } catch {
      return invalidObservation(
        this.endpoint,
        checkedAt,
        response.status,
        "health response is not valid JSON",
      );
    }

    try {
      const envelope = decodeFqgateResponseEnvelope<Record<string, unknown>>(value);
      return normalizeHealthPayload(this.endpoint, checkedAt, response.status, envelope.data);
    } catch (error) {
      if (
        error instanceof BridgeError &&
        (error.code === ERROR_CODES.HEALTH_INVALID ||
          error.code === ERROR_CODES.UPSTREAM_RESPONSE_INVALID)
      ) {
        return invalidObservation(
          this.endpoint,
          checkedAt,
          response.status,
          error.message,
          error.details,
        );
      }
      throw error;
    }
  }

  async waitUntilReady(timeoutMs: number, pollIntervalMs: number): Promise<HealthObservation> {
    const deadline = Date.now() + timeoutMs;
    let last = await this.probe();
    while (isActivationHealthy(last) === false && Date.now() < deadline) {
      await this.sleep(pollIntervalMs);
      last = await this.probe();
    }
    if (!isActivationHealthy(last)) {
      throw new BridgeError(
        ERROR_CODES.HEALTH_TIMEOUT,
        "FQGate health did not become valid before the activation deadline",
        {
          endpoint: this.endpoint,
          lastAvailable: last.available,
          lastStatus: last.status,
        },
      );
    }
    return last;
  }
}

export function isActivationHealthy(observation: HealthObservation): boolean {
  return observation.available && observation.validPayload;
}

export function normalizeSessionState(payload: Record<string, unknown>): SessionState {
  if (payload.connected === true) {
    return "connected";
  }

  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.toLowerCase() : "";
  const loginMethod =
    typeof payload.login_method === "string" ? payload.login_method.toLowerCase() : "";
  if (
    [status, reason].some((value) =>
      /login[_ -]?required|not[_ -]?logged[_ -]?in|unauthenticated|authentication[_ -]?required/.test(
        value,
      ),
    )
  ) {
    return "login_required";
  }
  if (status === "guest" || status === "guest_mode" || loginMethod === "guest") {
    return "guest";
  }
  return "unknown";
}

function normalizeHealthPayload(
  endpoint: string,
  checkedAt: string,
  httpStatus: number,
  value: unknown,
): HealthObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BridgeError(ERROR_CODES.HEALTH_INVALID, "health response must be a JSON object");
  }
  const payload = value as Record<string, unknown>;
  const knownKeys = [
    "status",
    "network_ready",
    "connected",
    "level2_permission",
    "login_method",
    "reason",
    "active_subscriptions",
  ];
  if (!knownKeys.some((key) => key in payload)) {
    throw new BridgeError(
      ERROR_CODES.HEALTH_INVALID,
      "health response does not contain a recognized diagnostic field",
    );
  }

  const status = readOptionalString(payload, "status");
  const loginMethod = readOptionalString(payload, "login_method");
  const reason = readOptionalString(payload, "reason");
  const networkReady = readOptionalBoolean(payload, "network_ready");
  const connected = readOptionalBoolean(payload, "connected");
  const level2Permission = readOptionalBoolean(payload, "level2_permission");
  const activeSubscriptions = readOptionalSubscriptions(payload);
  const session = normalizeSessionState(payload);
  const diagnostics: Record<string, unknown> = {};
  if (status !== undefined) diagnostics.status = status;
  if (networkReady !== null) diagnostics.networkReady = networkReady;
  if (connected !== null) diagnostics.connected = connected;
  if (level2Permission !== null) diagnostics.level2Permission = level2Permission;
  if (loginMethod !== undefined) diagnostics.loginMethod = loginMethod;
  if (reason !== undefined) diagnostics.reason = reason;
  if (activeSubscriptions !== undefined) diagnostics.activeSubscriptions = activeSubscriptions;

  return {
    endpoint,
    checkedAt,
    available: true,
    validPayload: true,
    httpStatus,
    networkReady,
    connected,
    session,
    ...(status === undefined ? {} : { status }),
    ...(loginMethod === undefined ? {} : { loginMethod }),
    level2Permission,
    ...(reason === undefined ? {} : { reason }),
    ...(activeSubscriptions === undefined ? {} : { activeSubscriptions }),
    diagnostics,
  };
}

function invalidObservation(
  endpoint: string,
  checkedAt: string,
  httpStatus: number,
  reason: string,
  details?: Readonly<Record<string, unknown>>,
): HealthObservation {
  const diagnostics: Record<string, unknown> = {
    availability: "invalid_payload",
  };
  if (details?.upstreamCode !== undefined) {
    diagnostics.upstreamCode = details.upstreamCode;
  }
  if (details?.upstreamMessage !== undefined) {
    diagnostics.upstreamMessage = details.upstreamMessage;
  }
  return {
    endpoint,
    checkedAt,
    available: true,
    validPayload: false,
    httpStatus,
    networkReady: null,
    connected: null,
    session: "unknown",
    level2Permission: null,
    reason,
    diagnostics,
  };
}

function readOptionalBoolean(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw new BridgeError(
      ERROR_CODES.HEALTH_INVALID,
      `health.${key} must be a boolean when present`,
    );
  }
  return value;
}

function readOptionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new BridgeError(
      ERROR_CODES.HEALTH_INVALID,
      `health.${key} must be a string when present`,
    );
  }
  return value;
}

function readOptionalSubscriptions(payload: Record<string, unknown>): number | undefined {
  const value = payload.active_subscriptions;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new BridgeError(
    ERROR_CODES.HEALTH_INVALID,
    "health.active_subscriptions must be a non-negative integer or array when present",
  );
}
