export interface OperationQualificationEvidence {
  readonly operationId: string;
  readonly contractFingerprint: string;
  readonly semanticProbeId: string;
}

export interface CandidateQualificationProbe {
  readonly operationId: string;
  run(): Promise<OperationQualificationEvidence>;
}

export function isOperationQualificationEvidence(
  value: unknown,
): value is OperationQualificationEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.operationId === "string" &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,7}$/.test(record.operationId) &&
    typeof record.contractFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(record.contractFingerprint) &&
    typeof record.semanticProbeId === "string" &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){0,127}$/.test(record.semanticProbeId)
  );
}
