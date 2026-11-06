import { fingerprintJson } from "../openapi/catalog.js";
import { operationContractFingerprint } from "../market/contract.js";

export const LOOKUP_OPERATION = "market.instruments.lookup";
export const LOOKUP_CONTRACTS = [
  ["/v2/system/version", "get"],
  ["/v2/system/health", "get"],
  ["/v2/source-instances", "get"],
  ["/v2/source-instances/{instance_id}/account", "get"],
  ["/v2/instruments/search", "get"],
] as const;
export const PARSER_REVISION = "mp8.lookup.strict-v1";
export const PROBE_REVISION = "mp8.sampled-continuity-v1";
export const IDENTITY_POLICY = "mp8.exact-created-exclusive-listen-source-lifetime-v1";

export interface ArtifactPins {
  readonly packageSha256: string | null;
  readonly executableSha256: string | null;
  readonly treeSha256: string | null;
  readonly clientSha256: string | null;
}
export interface CandidateProfile {
  readonly version: string;
  readonly operation: typeof LOOKUP_OPERATION;
  readonly platform: "windows";
  readonly architecture: "x86_64";
  readonly artifacts: ArtifactPins;
  readonly contracts: typeof LOOKUP_CONTRACTS;
  readonly contractSha256: string | null;
  readonly parserRevision: typeof PARSER_REVISION;
  readonly probeRevision: typeof PROBE_REVISION;
  readonly identityPolicy: typeof IDENTITY_POLICY;
  readonly evidence: {
    readonly origin: "REVIEWED_BYTES" | "SYNTHETIC";
    readonly reference: string;
    readonly publisherTrust: "UNVERIFIED" | "SYNTHETIC";
    readonly nativeSourceLifetime: "UNKNOWN" | "SYNTHETIC";
    readonly hostOwnership: "NOT_EXECUTED" | "SYNTHETIC";
    readonly localSemantics: "NOT_EXECUTED" | "SYNTHETIC";
    readonly remoteAcceptance: "NOT_EXECUTED";
  };
}

const evidence = (reference: string): CandidateProfile["evidence"] => ({
  origin: "REVIEWED_BYTES",
  reference,
  publisherTrust: "UNVERIFIED",
  nativeSourceLifetime: "UNKNOWN",
  hostOwnership: "NOT_EXECUTED",
  localSemantics: "NOT_EXECUTED",
  remoteAcceptance: "NOT_EXECUTED",
});
const base = {
  operation: LOOKUP_OPERATION,
  platform: "windows",
  architecture: "x86_64",
  contracts: LOOKUP_CONTRACTS,
  parserRevision: PARSER_REVISION,
  probeRevision: PROBE_REVISION,
  identityPolicy: IDENTITY_POLICY,
} as const;

/** Review ledger only. Historical production 2.0.5 gates are owned elsewhere. */
export const REVIEW_CANDIDATES: readonly CandidateProfile[] = [
  {
    ...base,
    version: "2.0.5",
    artifacts: {
      packageSha256: "c64571e331ac7c23f425e4f5c9434cea850897bbb65a8888ebb3236f777df5ba",
      executableSha256: "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847",
      treeSha256: "9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f",
      clientSha256: "018d033fbbbcec18beca176edea3aa8fc8cdbb272292bcac4068ee3add4ef55a",
    },
    contractSha256: "3d9ca6c84a7b0cb75c3caae5eaf39cf4bb047a4c40d013202984bcad12b0ebe6",
    evidence: evidence("main@2410e863:market/v2 + diagnostics/qr-contract; MP7 release ledger"),
  },
  {
    ...base,
    version: "2.0.6",
    artifacts: {
      packageSha256: "cebbcd42eda73f518080af7457783f4647f69c1c32451409854ff070fd81453f",
      executableSha256: "f69ab04f75c6b2b20e1776aad3cec51c0b4df4658aaf46fd05367f4ec857e8eb",
      treeSha256: "e98a9ce676a3f149cd0abee6de3b9248d3f4b601621a282819a466079120fd42",
      clientSha256: "9214dff802e03716afe1c15ca9f646ba61023e15061b48251cfcd8a4c2482a8c",
    },
    contractSha256: "617ac95aa71962842c9b552682e70459f00a5cd61147bb10557b95c7b9092ec6",
    evidence: evidence(
      "preserved/fqgate206@c06fbcff:operation-profile; UNMERGED historical claims",
    ),
  },
  {
    ...base,
    version: "2.0.7",
    artifacts: {
      packageSha256: "6a6a43aea7380cd5e3c5c6f6e271140d78bb3a978a8711e2d0a4f64dfe253dcf",
      executableSha256: "b9f4194db9ac6cad5b62e932ceddd90dcc21332152927f6ab348b50941d67a31",
      treeSha256: null,
      clientSha256: null,
    },
    contractSha256: null,
    evidence: evidence("MP7 static ZIP/PE review; runtime contract UNKNOWN"),
  },
];

export interface CandidateObservation {
  readonly version: string;
  readonly operation: string;
  readonly platform: string;
  readonly architecture: string;
  readonly artifacts: ArtifactPins;
  readonly contracts: readonly (readonly [string, string])[];
  readonly document: unknown;
  readonly parserRevision: string;
  readonly probeRevision: string;
  readonly identityPolicy: string;
  readonly origin: "REVIEWED_BYTES" | "SYNTHETIC";
}
export interface CandidateDecision {
  readonly state: "UNKNOWN" | "DENIED" | "OFFLINE_CANDIDATE";
  readonly reason: "UNKNOWN_PROFILE" | "INCOMPLETE_EVIDENCE" | "DRIFT" | "FIXTURE_ONLY";
  readonly productionAllowed: false;
  readonly runtimeQualified: false;
}
const decision = (
  state: CandidateDecision["state"],
  reason: CandidateDecision["reason"],
): CandidateDecision => ({ state, reason, productionAllowed: false, runtimeQualified: false });
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

/** No production admission state exists. Even real-byte matches remain denied. */
export function assessCandidate(
  profiles: readonly CandidateProfile[],
  observed: CandidateObservation,
): CandidateDecision {
  try {
    if (!/^2\.\d+\.\d+$/.test(observed.version) || observed.operation !== LOOKUP_OPERATION)
      return decision("UNKNOWN", "UNKNOWN_PROFILE");
    const entries = profiles.filter(
      (p) => p.version === observed.version && p.operation === observed.operation,
    );
    if (entries.length !== 1) return decision("UNKNOWN", "UNKNOWN_PROFILE");
    const p = entries[0]!;
    if (
      Object.keys(p.artifacts).sort().join() !==
        "clientSha256,executableSha256,packageSha256,treeSha256" ||
      !Object.values(p.artifacts).every(hash) ||
      !hash(p.contractSha256) ||
      p.evidence.origin !== "SYNTHETIC" ||
      observed.origin !== "SYNTHETIC" ||
      p.evidence.publisherTrust !== "SYNTHETIC" ||
      p.evidence.nativeSourceLifetime !== "SYNTHETIC" ||
      p.evidence.hostOwnership !== "SYNTHETIC" ||
      p.evidence.localSemantics !== "SYNTHETIC" ||
      p.evidence.remoteAcceptance !== "NOT_EXECUTED" ||
      !p.evidence.reference
    )
      return decision("DENIED", "INCOMPLETE_EVIDENCE");
    if (
      observed.platform !== "windows" ||
      observed.architecture !== "x86_64" ||
      p.platform !== observed.platform ||
      p.architecture !== observed.architecture ||
      p.parserRevision !== PARSER_REVISION ||
      observed.parserRevision !== PARSER_REVISION ||
      p.probeRevision !== PROBE_REVISION ||
      observed.probeRevision !== PROBE_REVISION ||
      p.identityPolicy !== IDENTITY_POLICY ||
      observed.identityPolicy !== IDENTITY_POLICY ||
      fingerprintJson(p.contracts) !== fingerprintJson(LOOKUP_CONTRACTS) ||
      fingerprintJson(observed.contracts) !== fingerprintJson(LOOKUP_CONTRACTS) ||
      fingerprintJson(p.artifacts) !== fingerprintJson(observed.artifacts) ||
      operationContractFingerprint(observed.document, LOOKUP_CONTRACTS) !== p.contractSha256
    )
      return decision("DENIED", "DRIFT");
    return decision("OFFLINE_CANDIDATE", "FIXTURE_ONLY");
  } catch {
    return decision("DENIED", "DRIFT");
  }
}
