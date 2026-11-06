/** Inert compiled-code fixtures. No HTTP/native process/config/credential access. */
import assert from "node:assert/strict";
import console from "node:console";
import { Buffer } from "node:buffer";
import { OfflineLookupCandidate } from "../../dist/fqgate/admission/lookup.js";
import {
  LOOKUP_CONTRACTS,
  REVIEW_CANDIDATES,
  assessCandidate,
} from "../../dist/fqgate/admission/registry.js";
import { operationContractFingerprint } from "../../dist/fqgate/market/contract.js";

const document = {
  paths: Object.fromEntries(LOOKUP_CONTRACTS.map(([p, m]) => [p, { [m]: { responses: {} } }])),
  components: { schemas: {} },
};
const profile = {
  ...globalThis.structuredClone(REVIEW_CANDIDATES[0]),
  artifacts: Object.fromEntries(
    Object.keys(REVIEW_CANDIDATES[0].artifacts).map((k, i) => [k, String(i + 1).repeat(64)]),
  ),
  contractSha256: operationContractFingerprint(document, LOOKUP_CONTRACTS),
  evidence: {
    origin: "SYNTHETIC",
    reference: "native Node inert fixture",
    publisherTrust: "SYNTHETIC",
    nativeSourceLifetime: "SYNTHETIC",
    hostOwnership: "SYNTHETIC",
    localSemantics: "SYNTHETIC",
    remoteAcceptance: "NOT_EXECUTED",
  },
};
let count = 0;
for (const version of ["2.0.5", "2.0.6", "2.0.7", "2.0.8", "unknown"]) {
  const d = assessCandidate(REVIEW_CANDIDATES, { version, operation: profile.operation });
  assert.ok(["UNKNOWN", "DENIED"].includes(d.state));
  assert.equal(d.productionAllowed, false);
  count++;
}
for (const mode of [
  "success",
  "display-drift",
  "source-ABA",
  "listener-0",
  "rounded-created",
  "missing-lifetime",
  "duplicate-connected",
  "sensitive",
  "503",
  "timeout",
  "stale",
  "process-race",
]) {
  const utc = Date.parse("2026-11-06T03:00:00Z");
  let time = 0,
    searches = 0;
  const a = {
    observation: {
      version: "2.0.5",
      operation: profile.operation,
      platform: "windows",
      architecture: "x86_64",
      artifacts: profile.artifacts,
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
        id: "fixture",
        generation: 1,
        workerPid: 101,
        workerCreated: "2026-11-06T00:00:01.1234567Z",
        parentPid: 100,
      },
    ],
  };
  const source = {
    instanceId: "fixture",
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
      account_display: "PRIVATE_A",
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
  if (mode === "listener-0") a.listener.rows[0].state = 0;
  if (mode === "rounded-created")
    a.process.created = a.process.recordedCreated = "2026-11-06T00:00:00.123Z";
  if (mode === "missing-lifetime") a.lifetimes = [];
  if (mode === "stale") account.snapshot.observed_at = new Date(utc - 5001).toISOString();
  const candidate = new OfflineLookupCandidate(
    [profile],
    {
      attest: async () => globalThis.structuredClone(a),
      read: async (path, options) => {
        assert.equal(options.method, "GET");
        assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 5000);
        let value;
        if (path === "/v2/system/version")
          value = {
            product: "FQGate",
            version: "2.0.5",
            api_version: "2.0",
            platform: "windows",
            architecture: "x86_64",
          };
        else if (path === "/v2/system/health") value = { status: "ready" };
        else if (path === "/openapi.json") value = document;
        else if (path === "/v2/source-instances")
          value = {
            instances:
              mode === "duplicate-connected"
                ? [source, { ...source, instanceId: "peer", pid: 102 }]
                : [source],
          };
        else if (path === "/v2/source-instances/fixture/account") value = account;
        else if (path === "/v2/instruments/search?query=600000") {
          searches++;
          if (mode === "display-drift") account.snapshot.account_display = "PRIVATE_B";
          if (mode === "source-ABA") a.lifetimes[0].generation++;
          if (mode === "process-race") a.process.recordSha256 = "a".repeat(64);
          if (mode === "timeout") time = 5000;
          value = {
            code: 0,
            message: "ok",
            data: {
              row_count: 1,
              data_state: "present",
              coverage: { status: "complete", returned_count: 1 },
              items: [
                {
                  security: { code: "600000", market: "XSHG" },
                  name: "Fixture",
                  ...(mode === "sensitive" ? { token: "PRIVATE_SECRET" } : {}),
                },
              ],
            },
          };
        } else throw Error("unexpected fixture path");
        return {
          status: mode === "503" && searches ? 503 : 200,
          body: Buffer.from(JSON.stringify(value)),
        };
      },
    },
    () => time,
    () => utc,
  );
  if (mode === "success")
    assert.equal((await candidate.lookup({ code: "600000" })).items.length, 1);
  else
    await assert.rejects(candidate.lookup({ code: "600000" }), (e) => {
      assert.equal(e.code, "MP8_CANDIDATE_DENIED");
      assert.ok(!String(e).includes("PRIVATE_"));
      return true;
    });
  assert.ok(searches <= 1);
  count++;
}
console.log(
  JSON.stringify({
    suite: "MP8_INERT_COMPILED_FIXTURES",
    cases: count,
    productionAllowed: false,
    nativeHostQualified: false,
  }),
);
