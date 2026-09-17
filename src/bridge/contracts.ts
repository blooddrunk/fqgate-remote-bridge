import type { CompatibilityEvaluation } from "../fqgate/compatibility/policy.js";
import type { FqgateLifecycleState, FqgateStatus } from "../fqgate/install/lifecycle.js";
import type { ManagedProcessState } from "../fqgate/process/types.js";
import type { BuildInfo } from "../shared/build-info.js";
import type { OpenApiCatalog } from "../fqgate/openapi/types.js";
import type { UpdateStatusView } from "../fqgate/update/service.js";

export type BridgeVersionResponse = BuildInfo;
export type BridgeUpdateStatusResponse = UpdateStatusView;
export type BridgeOpenApiCatalogResponse = OpenApiCatalog;

export interface CompatibilityResponse {
  readonly version: string | null;
  readonly status: CompatibilityEvaluation["status"] | "unknown";
  readonly supported: boolean;
  readonly validated: boolean;
  readonly reason: string;
}

export interface BridgeCapabilitiesResponse {
  readonly apiVersion: "v1";
  readonly capabilities: {
    readonly status: true;
    readonly qrLogin: boolean;
  };
  readonly fqgate: {
    readonly version: string | null;
    readonly compatibility: CompatibilityResponse;
  };
}

export interface HealthResponse {
  readonly available: boolean;
  readonly validPayload: boolean;
  readonly httpStatus: number | null;
  readonly networkReady: boolean | null;
  readonly connected: boolean | null;
  readonly session: "connected" | "guest" | "login_required" | "unknown";
  readonly status: string | null;
  readonly loginMethod: string | null;
  readonly level2Permission: boolean | null;
  readonly reason: string | null;
  readonly activeSubscriptions: number | null;
}

export interface BridgeStatusResponse {
  readonly bridge: {
    readonly state: "ready";
    readonly version: string;
    readonly checkedAt: string;
  };
  readonly fqgate: {
    readonly lifecycle: FqgateLifecycleState;
    readonly process: {
      readonly state: ManagedProcessState;
      readonly running: boolean;
      readonly pid?: number;
    };
    readonly version: string | null;
    readonly compatibility: CompatibilityResponse;
    readonly health: HealthResponse;
  };
  readonly session: {
    readonly state: HealthResponse["session"];
    readonly loginMethod: string | null;
  };
  readonly lastCheckedAt: string;
}

export type QrClientStatus = "waiting_for_scan" | "waiting_for_confirmation" | "connected";

export interface QrBeginResponse {
  readonly sessionId: string;
  readonly qr: {
    readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
    readonly imageBase64: string;
  };
  readonly status: "waiting_for_scan" | "waiting_for_confirmation";
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface QrPollResponse {
  readonly sessionId: string;
  readonly status: QrClientStatus;
  readonly connected: boolean;
  readonly loginMethod?: string;
  readonly expiresAt?: string;
}

export function normalizeCompatibility(
  status: Pick<FqgateStatus, "installed" | "compatibility">,
): CompatibilityResponse {
  const evaluation = status.compatibility ?? status.installed?.compatibility;
  if (evaluation === undefined) {
    return {
      version: status.installed?.version ?? null,
      status: "unknown",
      supported: false,
      validated: false,
      reason: "No validated FQGate version is active",
    };
  }
  return {
    version: evaluation.version,
    status: evaluation.status,
    supported: evaluation.supported,
    validated: evaluation.validated,
    reason: evaluation.reason.slice(0, 256),
  };
}
