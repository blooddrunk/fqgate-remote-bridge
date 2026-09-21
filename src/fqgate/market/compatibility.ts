import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { OperationQualificationEvidence } from "../compatibility/evidence.js";

export const LOOKUP_OPERATION_ID = "market.instruments.lookup" as const;
export const LOOKUP_SEMANTIC_PROBE_ID = "market.instruments.lookup.exact-code-v1" as const;
export const LOOKUP_HISTORICAL_BASELINE_VERSION = "1.0.1" as const;

/**
 * This is the reviewed operation-scoped compatibility ledger. It intentionally
 * contains no runtime document, market payload, credential, or version list.
 * A new fingerprint must be added by a separate reviewed change.
 */
export const LOOKUP_COMPATIBILITY_EVIDENCE = Object.freeze({
  operationId: LOOKUP_OPERATION_ID,
  approvedContractFingerprints: Object.freeze([
    "a0b2bb5b2cdf5ec6e4f22e5a15ef9217bc20b2d4f1cb589fe680fb87d0b39ed5",
  ]),
  semanticProbeId: LOOKUP_SEMANTIC_PROBE_ID,
});

export const LOOKUP_CONTRACT_FINGERPRINT =
  LOOKUP_COMPATIBILITY_EVIDENCE.approvedContractFingerprints[0]!;

export function assertLookupContractApproved(fingerprint: string): void {
  if (!LOOKUP_COMPATIBILITY_EVIDENCE.approvedContractFingerprints.includes(fingerprint)) {
    throw new BridgeError(
      ERROR_CODES.OPENAPI_CONTRACT_MISSING,
      "Instrument lookup contract has changed",
    );
  }
}

export function lookupQualificationEvidence(fingerprint: string): OperationQualificationEvidence {
  assertLookupContractApproved(fingerprint);
  return {
    operationId: LOOKUP_OPERATION_ID,
    contractFingerprint: fingerprint,
    semanticProbeId: LOOKUP_SEMANTIC_PROBE_ID,
  };
}

/**
 * Preserve the closed Phase 5 baseline for an already validated 1.0.1
 * installation whose state file predates persisted qualification evidence.
 * New versions must receive artifact-bound evidence from the qualification
 * transaction; this compatibility bridge is not used for them.
 */
export function legacyLookupQualificationEvidence(
  version: string | undefined,
  globallyValidated: boolean,
): readonly OperationQualificationEvidence[] {
  if (version !== LOOKUP_HISTORICAL_BASELINE_VERSION || !globallyValidated) return [];
  return [lookupQualificationEvidence(LOOKUP_CONTRACT_FINGERPRINT)];
}

export function assertLookupQualification(
  operations: readonly OperationQualificationEvidence[] | undefined,
  fingerprint: string,
): void {
  const evidence = operations?.find((candidate) => candidate.operationId === LOOKUP_OPERATION_ID);
  if (
    evidence === undefined ||
    evidence.semanticProbeId !== LOOKUP_SEMANTIC_PROBE_ID ||
    evidence.contractFingerprint !== fingerprint
  ) {
    throw new BridgeError(
      ERROR_CODES.FQGATE_INCOMPATIBLE,
      "Instrument lookup has not passed its candidate qualification gate",
    );
  }
  assertLookupContractApproved(evidence.contractFingerprint);
}
