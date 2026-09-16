import { BridgeError, ERROR_CODES } from "../../shared/errors.js";

export type BridgeOperationId =
  | "bridge.version"
  | "bridge.capabilities"
  | "bridge.status"
  | "session.qr.begin"
  | "session.qr.poll";

export type BridgeOperationClassification = "diagnostic" | "session_maintenance";
export type BridgeSensitivity = "none" | "qr_payload";

export interface BridgeOperationPolicy {
  readonly id: BridgeOperationId;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly classification: BridgeOperationClassification;
  readonly intent: "read_only" | "session_maintenance";
  readonly timeoutMs: number;
  readonly maxBodyBytes: number;
  readonly sensitivity: BridgeSensitivity;
  readonly requiredCompatibility: "none" | "validated";
}

const OPERATION_POLICIES: readonly BridgeOperationPolicy[] = [
  {
    id: "bridge.version",
    method: "GET",
    path: "/api/v1/version",
    classification: "diagnostic",
    intent: "read_only",
    timeoutMs: 1_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
  },
  {
    id: "bridge.capabilities",
    method: "GET",
    path: "/api/v1/capabilities",
    classification: "diagnostic",
    intent: "read_only",
    timeoutMs: 1_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
  },
  {
    id: "bridge.status",
    method: "GET",
    path: "/api/v1/status",
    classification: "diagnostic",
    intent: "read_only",
    timeoutMs: 5_000,
    maxBodyBytes: 0,
    sensitivity: "none",
    requiredCompatibility: "none",
  },
  {
    id: "session.qr.begin",
    method: "POST",
    path: "/api/v1/session/qr/begin",
    classification: "session_maintenance",
    intent: "session_maintenance",
    timeoutMs: 5_000,
    maxBodyBytes: 4_096,
    sensitivity: "qr_payload",
    requiredCompatibility: "validated",
  },
  {
    id: "session.qr.poll",
    method: "POST",
    path: "/api/v1/session/qr/poll",
    classification: "session_maintenance",
    intent: "session_maintenance",
    timeoutMs: 5_000,
    maxBodyBytes: 4_096,
    sensitivity: "none",
    requiredCompatibility: "validated",
  },
];

const BY_ID = new Map(OPERATION_POLICIES.map((operation) => [operation.id, operation]));

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
  }
}

assertOperationRegistryInvariants();
