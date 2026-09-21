import { BridgeError, ERROR_CODES, type BridgeErrorCode } from "../../shared/errors.js";
import { readJsonFile, writeJsonAtomically, type FqgateLayout } from "./layout.js";
import {
  isOperationQualificationEvidence,
  type OperationQualificationEvidence,
} from "../compatibility/evidence.js";

export interface RuntimeQualification {
  readonly qualifiedAt: string;
  readonly operations: readonly OperationQualificationEvidence[];
}

export interface ArtifactRecord {
  readonly version: string;
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
  readonly qualification?: RuntimeQualification;
}

export type ActivationState = "none" | "succeeded" | "failed" | "rolled_back" | "rollback_failed";

export interface FqgateState {
  readonly schemaVersion: 1;
  readonly active?: ArtifactRecord;
  readonly previous?: ArtifactRecord;
  readonly lastActivation: ActivationState;
  readonly lastError?: {
    readonly code: BridgeErrorCode;
    readonly message: string;
    readonly at: string;
  };
  readonly updatedAt: string;
}

export function emptyFqgateState(): FqgateState {
  return {
    schemaVersion: 1,
    lastActivation: "none",
    updatedAt: new Date(0).toISOString(),
  };
}

export async function readFqgateState(layout: FqgateLayout): Promise<FqgateState> {
  let value: unknown;
  try {
    value = await readJsonFile(layout.stateFile);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.STATE_INVALID,
      "Unable to read FQGate state file",
      undefined,
      { cause: error },
    );
  }
  if (value === undefined) {
    return emptyFqgateState();
  }
  if (!isFqgateState(value)) {
    throw new BridgeError(ERROR_CODES.STATE_INVALID, "FQGate state file is malformed");
  }
  return value;
}

export async function writeFqgateState(layout: FqgateLayout, state: FqgateState): Promise<void> {
  await writeJsonAtomically(layout.stateFile, state);
}

function isFqgateState(value: unknown): value is FqgateState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1
  ) {
    return false;
  }
  if (
    !("lastActivation" in value) ||
    !["none", "succeeded", "failed", "rolled_back", "rollback_failed"].includes(
      String(value.lastActivation),
    )
  ) {
    return false;
  }
  if (!("updatedAt" in value) || typeof value.updatedAt !== "string") {
    return false;
  }
  if ("active" in value && value.active !== undefined && !isArtifactRecord(value.active)) {
    return false;
  }
  if ("previous" in value && value.previous !== undefined && !isArtifactRecord(value.previous)) {
    return false;
  }
  if ("lastError" in value && value.lastError !== undefined && !isLastError(value.lastError)) {
    return false;
  }
  return true;
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    "sha256" in value &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    (!("qualification" in value) ||
      value.qualification === undefined ||
      isRuntimeQualification(value.qualification))
  );
}

function isRuntimeQualification(value: unknown): value is RuntimeQualification {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.qualifiedAt === "string" &&
    record.qualifiedAt.length > 0 &&
    Array.isArray(record.operations) &&
    record.operations.length > 0 &&
    record.operations.every((operation) => isOperationQualificationEvidence(operation))
  );
}

function isLastError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "at" in value &&
    typeof value.at === "string"
  );
}
