export const ALLOWED_TARGETS: readonly string[];
export const WRITE_ENV_NAMES: readonly string[];

export interface AuditEvidence {
  readonly schemaVersion: number;
  readonly task: string;
  readonly commit: string;
  readonly planFingerprint: string;
  readonly allowedTargetNames: readonly string[];
  readonly records: readonly { readonly id: string; readonly result: "PASS" | "FAIL" }[];
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number };
}

export function evaluateAudit(snapshot: unknown): AuditEvidence;
export function serializeAuditEvidence(evidence: AuditEvidence | Record<string, unknown>): string;
