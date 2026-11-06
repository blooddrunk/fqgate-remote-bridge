import { vi } from "vitest";
import {
  OfflineLookupCandidate,
  type FixtureAttestation,
  type FixtureReadOptions,
} from "../../src/fqgate/admission/lookup.js";
import {
  LOOKUP_CONTRACTS,
  REVIEW_CANDIDATES,
  type CandidateProfile,
} from "../../src/fqgate/admission/registry.js";
import { operationContractFingerprint } from "../../src/fqgate/market/contract.js";

export function mp8Fixture(version = "2.0.5") {
  const document = {
    openapi: "3.1.0",
    info: { title: "SYNTHETIC MP8", version },
    paths: Object.fromEntries(
      LOOKUP_CONTRACTS.map(([path, method]) => [
        path,
        {
          [method]: {
            responses: { "200": { schema: { $ref: "#/components/schemas/Root" } } },
          },
        },
      ]),
    ),
    components: {
      schemas: {
        Root: { properties: { child: { $ref: "#/components/schemas/Leaf" } } },
        Leaf: { type: "string" },
      },
    },
  };
  const profile: CandidateProfile = {
    ...structuredClone(REVIEW_CANDIDATES[0]!),
    version,
    artifacts: {
      packageSha256: "1".repeat(64),
      executableSha256: "2".repeat(64),
      treeSha256: "3".repeat(64),
      clientSha256: "4".repeat(64),
    },
    contractSha256: operationContractFingerprint(document, LOOKUP_CONTRACTS),
    evidence: {
      origin: "SYNTHETIC",
      reference: "tests/helpers/mp8-fixture.ts; NOT NATIVE",
      publisherTrust: "SYNTHETIC",
      nativeSourceLifetime: "SYNTHETIC",
      hostOwnership: "SYNTHETIC",
      localSemantics: "SYNTHETIC",
      remoteAcceptance: "NOT_EXECUTED",
    },
  };
  const utc = Date.parse("2026-11-06T03:00:00Z");
  const source = {
    instanceId: "synthetic-a",
    providerId: "tonghuashun",
    instanceNo: 1,
    pid: 101,
    restartCount: 0,
    workerState: "ready",
    session: { state: "connected" },
  };
  const account = {
    descriptor: { session_supported: true },
    snapshot: {
      state: "connected",
      account_display: "PRIVATE_SYNTHETIC_A",
      session_kind: "account",
      level2_access: false,
      saved_login: {
        available: false,
        account_display: null,
        session_kind: null,
        level2_access: null,
      },
      session_notice: null,
      observed_at: new Date(utc).toISOString(),
    },
  };
  const attestation: FixtureAttestation = {
    observation: {
      version,
      operation: profile.operation,
      platform: "windows",
      architecture: "x86_64",
      artifacts: structuredClone(profile.artifacts),
      contracts: LOOKUP_CONTRACTS,
      document,
      parserRevision: profile.parserRevision,
      probeRevision: profile.probeRevision,
      identityPolicy: profile.identityPolicy,
      origin: "SYNTHETIC",
    },
    process: {
      pid: 100,
      created: "2026-11-06T00:00:00.1234567Z",
      recordedCreated: "2026-11-06T00:00:00.1234567Z",
      pathSha256: "5".repeat(64),
      recordSha256: "6".repeat(64),
      stateSha256: "7".repeat(64),
    },
    listener: {
      families: [2, 23],
      rows: [{ family: 2, address: "127.0.0.1", port: 17281, state: 2, pid: 100 }],
    },
    lifetimes: [
      {
        id: source.instanceId,
        generation: 1,
        workerPid: 101,
        workerCreated: "2026-11-06T00:00:01.1234567Z",
        parentPid: 100,
      },
    ],
  };
  const result = {
    code: 0,
    message: "ok",
    data: {
      row_count: 1,
      data_state: "present",
      coverage: { status: "complete", returned_count: 1 },
      items: [{ security: { code: "600000", market: "XSHG" }, name: "Fixture" }],
    },
  };
  const f = {
    profile,
    attestation,
    document,
    sources: [source],
    accounts: new Map([[source.instanceId, account]]),
    result,
    time: 0,
    utc,
    reads: [] as string[],
    attestCount: 0,
    beforeRead: (_path: string, _options: FixtureReadOptions) => {},
    beforeAttest: (_count: number) => {},
    status: 200,
    bytes: undefined as Uint8Array | undefined,
  };
  const ports = {
    attest: vi.fn(async () => {
      f.beforeAttest(++f.attestCount);
      return structuredClone(f.attestation);
    }),
    read: vi.fn(async (path: string, options: FixtureReadOptions) => {
      f.reads.push(path);
      f.beforeRead(path, options);
      let value: unknown;
      if (path === "/v2/system/version")
        value = {
          product: "FQGate",
          version: f.attestation.observation.version,
          api_version: "2.0",
          platform: "windows",
          architecture: "x86_64",
        };
      else if (path === "/v2/system/health") value = { status: "ready" };
      else if (path === "/openapi.json") value = f.document;
      else if (path === "/v2/source-instances") value = { instances: f.sources };
      else if (/^\/v2\/source-instances\/[^/]+\/account$/.test(path))
        value = f.accounts.get(decodeURIComponent(path.split("/")[3]!));
      else if (path === "/v2/instruments/search?query=600000") value = f.result;
      else throw Error("unexpected fixture route");
      return { status: f.status, body: f.bytes ?? Buffer.from(JSON.stringify(value)) };
    }),
  };
  const make = (profiles: readonly CandidateProfile[] = [f.profile]) =>
    new OfflineLookupCandidate(
      profiles,
      ports,
      () => f.time,
      () => f.utc,
    );
  return { f, ports, make };
}
