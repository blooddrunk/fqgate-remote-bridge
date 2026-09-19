import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { OpenApiHttpMethod, RequiredOpenApiContract } from "../../fqgate/openapi/types.js";
import type { BridgeRequestContext } from "./request-context.js";

export type BridgeOperationId =
  | "bridge.version"
  | "bridge.capabilities"
  | "bridge.status"
  | "session.qr.begin"
  | "session.qr.poll"
  | "updates.status"
  | "updates.check"
  | "updates.plan"
  | "updates.apply"
  | "openapi.catalog"
  | "openapi.refresh";

export type BridgeOperationClassification = "diagnostic" | "session_maintenance" | "local_admin";
export type BridgeSensitivity = "none" | "qr_payload";
export type BridgeOperationIntent = "read_only" | "session_maintenance" | "local_admin";
export interface BridgeOperationPolicy {
  readonly id: BridgeOperationId;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly classification: BridgeOperationClassification;
  readonly intent: BridgeOperationIntent;
  readonly allowedContexts: readonly BridgeRequestContext[];
  readonly requiresConfirmation: boolean;
  readonly timeoutMs: number;
  readonly maxBodyBytes: number;
  readonly sensitivity: BridgeSensitivity;
  readonly requiredCompatibility: "none" | "validated";
  readonly documentationVisible: boolean;
  readonly upstream?: {
    readonly method: OpenApiHttpMethod;
    readonly path: string;
  };
}

const OPERATION_POLICIES: readonly BridgeOperationPolicy[] = [
  {
    id: "bridge.version",
    method: "GET",
    path: "/api/v1/version",
    classification: "diagnostic",
    intent: "read_only",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 1_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "bridge.capabilities",
    method: "GET",
    path: "/api/v1/capabilities",
    classification: "diagnostic",
    intent: "read_only",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 1_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "bridge.status",
    method: "GET",
    path: "/api/v1/status",
    classification: "diagnostic",
    intent: "read_only",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "session.qr.begin",
    method: "POST",
    path: "/api/v1/session/qr/begin",
    classification: "session_maintenance",
    intent: "session_maintenance",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 4_096,
    sensitivity: "qr_payload",
    requiredCompatibility: "validated",
    documentationVisible: true,
    upstream: { method: "POST", path: "/v1/market/session/qr/begin" },
  },
  {
    id: "session.qr.poll",
    method: "POST",
    path: "/api/v1/session/qr/poll",
    classification: "session_maintenance",
    intent: "session_maintenance",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 4_096,
    sensitivity: "none",
    requiredCompatibility: "validated",
    documentationVisible: true,
    upstream: { method: "POST", path: "/v1/market/session/qr/poll" },
  },
  {
    id: "updates.status",
    method: "GET",
    path: "/api/v1/updates/status",
    classification: "local_admin",
    intent: "read_only",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "updates.check",
    method: "POST",
    path: "/api/v1/updates/check",
    classification: "local_admin",
    intent: "local_admin",
    allowedContexts: ["local", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 30_000,
    maxBodyBytes: 1_024,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "updates.plan",
    method: "POST",
    path: "/api/v1/updates/plan",
    classification: "local_admin",
    intent: "local_admin",
    allowedContexts: ["local", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 30_000,
    maxBodyBytes: 1_024,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "updates.apply",
    method: "POST",
    path: "/api/v1/updates/apply",
    classification: "local_admin",
    intent: "local_admin",
    allowedContexts: ["local", "remote_admin"],
    requiresConfirmation: true,
    timeoutMs: 10 * 60_000,
    maxBodyBytes: 2_048,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "openapi.catalog",
    method: "GET",
    path: "/api/v1/openapi/catalog",
    classification: "diagnostic",
    intent: "read_only",
    allowedContexts: ["local", "remote_human", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
  {
    id: "openapi.refresh",
    method: "POST",
    path: "/api/v1/openapi/refresh",
    classification: "diagnostic",
    intent: "local_admin",
    allowedContexts: ["local", "remote_admin"],
    requiresConfirmation: false,
    timeoutMs: 5_000,
    maxBodyBytes: 1_024,
    sensitivity: "none",
    requiredCompatibility: "none",
    documentationVisible: true,
  },
];

const REQUIRED_FQGATE_CONTRACTS: readonly RequiredOpenApiContract[] = [
  {
    id: "fqgate.market.health",
    method: "GET",
    path: "/v1/market/health",
    description: "用于生命周期和桥接状态的健康响应",
  },
  {
    id: "fqgate.session.qr.begin",
    method: "POST",
    path: "/v1/market/session/qr/begin",
    description: "用于开始受管 QR 登录流程",
  },
  {
    id: "fqgate.session.qr.poll",
    method: "POST",
    path: "/v1/market/session/qr/poll",
    description: "用于轮询受管 QR 登录流程",
  },
];

const BY_ID = new Map(OPERATION_POLICIES.map((operation) => [operation.id, operation]));
const REMOTE_ADMIN_MAINTENANCE_IDS = new Set<BridgeOperationId>([
  "updates.check",
  "updates.plan",
  "updates.apply",
  "openapi.refresh",
]);

export function listBridgeOperations(): readonly BridgeOperationPolicy[] {
  return OPERATION_POLICIES;
}

export function getBridgeOperation(id: BridgeOperationId): BridgeOperationPolicy {
  const operation = BY_ID.get(id);
  if (operation === undefined) {
    throw new BridgeError(
      ERROR_CODES.BRIDGE_NOT_READY,
      `Bridge operation is not registered: ${id}`,
    );
  }
  return operation;
}

export function findBridgeOperation(
  method: string,
  path: string,
): BridgeOperationPolicy | undefined {
  const normalizedMethod = method.toUpperCase();
  return OPERATION_POLICIES.find(
    (operation) => operation.method === normalizedMethod && operation.path === path,
  );
}

export function findBridgeOperationsForPath(path: string): readonly BridgeOperationPolicy[] {
  return OPERATION_POLICIES.filter((operation) => operation.path === path);
}

export function listRequiredFqgateContracts(): readonly RequiredOpenApiContract[] {
  return REQUIRED_FQGATE_CONTRACTS;
}

export function assertOperationRegistryInvariants(): void {
  const keys = new Set<string>();
  for (const operation of OPERATION_POLICIES) {
    const key = `${operation.method} ${operation.path}`;
    if (keys.has(key)) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Duplicate bridge operation policy: ${key}`,
      );
    }
    keys.add(key);
    if (
      operation.path.includes("*") ||
      operation.path.includes(":") ||
      operation.path.includes("/v1/market")
    ) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Bridge operation policy cannot be a wildcard or raw upstream route: ${key}`,
      );
    }
    if (!Number.isSafeInteger(operation.timeoutMs) || operation.timeoutMs <= 0) {
      throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, `Invalid timeout policy: ${key}`);
    }
    if (!Number.isSafeInteger(operation.maxBodyBytes) || operation.maxBodyBytes < 0) {
      throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, `Invalid body-size policy: ${key}`);
    }
    if (
      operation.allowedContexts.length === 0 ||
      operation.allowedContexts.some(
        (context, index, contexts) =>
          !["local", "remote_human", "remote_admin", "remote_machine"].includes(context) ||
          contexts.indexOf(context) !== index,
      )
    ) {
      throw new BridgeError(ERROR_CODES.BRIDGE_NOT_READY, `Invalid context policy: ${key}`);
    }
    if (operation.allowedContexts.includes("remote_machine")) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Remote machine operation privilege is not enabled in Phase 5-A: ${key}`,
      );
    }
    if (operation.requiresConfirmation && operation.id !== "updates.apply") {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Confirmation is not supported for this operation: ${key}`,
      );
    }
    if (
      operation.intent === "local_admin" &&
      operation.allowedContexts.includes("remote_admin") &&
      !REMOTE_ADMIN_MAINTENANCE_IDS.has(operation.id)
    ) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Unexpected remote administrator maintenance operation: ${key}`,
      );
    }
    if (
      REMOTE_ADMIN_MAINTENANCE_IDS.has(operation.id) &&
      !operation.allowedContexts.includes("remote_admin")
    ) {
      throw new BridgeError(
        ERROR_CODES.BRIDGE_NOT_READY,
        `Remote administrator maintenance operation is not registered: ${key}`,
      );
    }
  }
}

assertOperationRegistryInvariants();
