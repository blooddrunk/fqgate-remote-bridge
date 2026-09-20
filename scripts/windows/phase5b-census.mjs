import process from "node:process";
import { loadConfig } from "../../dist/config/config.js";
import { createApplicationServices } from "../../dist/app/runtime.js";
import { FetchHttpTransport, decodeResponseText } from "../../dist/fqgate/release/http.js";
import { FqgateOpenApiService } from "../../dist/fqgate/openapi/service.js";
import { lookupContractFingerprint } from "../../dist/fqgate/market/contract.js";
import {
  LOOKUP_CONTRACT_FINGERPRINT,
  FqgateInstrumentLookup,
} from "../../dist/fqgate/market/lookup.js";

// All probes are fixed, independently reviewed reads. Discovery never dispatches.
let stage = "P5B-C1";
const emit = (id, metadata) =>
  process.stdout.write(
    JSON.stringify({ id, ...metadata, timestamp: new Date().toISOString() }) + "\n",
  );
try {
  if (process.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
  const config = await loadConfig(process.argv[2]);
  if (config.fqgateBaseUrl !== "http://127.0.0.1:17281") throw new Error("FIXED_ORIGIN_REQUIRED");
  const status = await createApplicationServices(config).lifecycle.status();
  if (
    status.process.state !== "running" ||
    status.compatibility?.validated !== true ||
    status.installed?.version !== "1.0.1"
  )
    throw new Error("VALIDATED_RUNNING_VERSION_REQUIRED");
  emit(stage, {
    result: "PASS",
    version: status.installed.version,
    session: status.health.session,
  });
  const transport = new FetchHttpTransport();
  let document;
  const service = new FqgateOpenApiService({
    http: {
      async request(url, options) {
        const response = await transport.request(url, { ...options, redirect: "error" });
        if (response.body.byteLength <= 4194304 && response.status === 200)
          document = JSON.parse(decodeResponseText(response));
        return response;
      },
    },
  });
  stage = "P5B-C2";
  const snapshot = await service.refresh();
  emit(stage, {
    result: "PASS",
    openapi: snapshot.openapiVersion,
    bytes: snapshot.byteLength,
    count: snapshot.operations.length,
    fingerprint: snapshot.fingerprint,
  });
  const candidates = snapshot.operations.filter(
    (o) =>
      /symbol|instrument|quote|kline|bars|history|search/i.test(o.key) &&
      !/trade|order|cancel|transfer|account|session|credential|update|process|buy|sell/i.test(
        o.key,
      ),
  );
  for (const operation of candidates.slice(0, 24))
    if (/^[A-Z]+ \/[a-zA-Z0-9/_{}-]{1,160}$/.test(operation.key))
      emit("P5B-CANDIDATE", { key: operation.key, fingerprint: operation.structuralFingerprint });
  stage = "P5B-C5";
  const fingerprint = lookupContractFingerprint(document);
  if (fingerprint !== LOOKUP_CONTRACT_FINGERPRINT) throw new Error("CONTRACT_DRIFT");
  emit(stage, {
    result: "PASS",
    fingerprint,
    requestFields: ["pattern", "need_market"],
    itemFields: ["code", "market", "name", "ths_code"],
  });
  stage = "P5B-C3";
  const lookup = new FqgateInstrumentLookup({
    http: transport,
    runtime: async () => ({ version: status.installed.version, validated: true, running: true }),
    contract: async () => fingerprint,
  });
  const value = await lookup.lookup({ code: "600000" });
  if (value.items.length === 0) throw new Error("KNOWN_INSTRUMENT_NOT_FOUND");
  emit(stage, {
    result: "PASS",
    status: 200,
    code: 0,
    count: value.items.length,
    shape: "bounded normalized instrument items",
  });
  stage = "P5B-C6";
  const empty = await lookup.lookup({ code: "000000" });
  emit(stage, {
    result: "PASS",
    status: 200,
    count: empty.items.length,
    shape: "bounded normalized instrument items",
  });
  // Quote remains a census-only candidate; it is not registered or authorized.
  // Its observed contract must still match before this optional fixed read.
  stage = "P5B-C4";
  const quoteContract = snapshot.operations.find((o) => o.key === "POST /v1/market/realtime/quote");
  if (
    quoteContract?.structuralFingerprint !==
    "7607cf591b436142d4572ff6cf6f5894736db9200a73e8a72b413d43942da979"
  ) {
    emit(stage, { result: "SKIP", error: "UNSELECTED_QUOTE_CONTRACT_DRIFT" });
  } else {
    const { market, code } = value.items[0];
    const response = await transport.request("http://127.0.0.1:17281/v1/market/realtime/quote", {
      method: "POST",
      redirect: "error",
      timeoutMs: 5000,
      maxBytes: 65536,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        securities: [{ market, code }],
        fields: [5, 55, 10, 6, 7, 8, 9, 13, 19],
      }),
    });
    const quote = JSON.parse(decodeResponseText(response));
    const ok =
      response.status === 200 &&
      quote.code === 0 &&
      Array.isArray(quote.data?.records) &&
      quote.data.records.length <= 1;
    emit(stage, {
      result: ok ? "PASS" : "SKIP",
      status: response.status,
      code: Number.isSafeInteger(quote.code) ? quote.code : null,
      bytes: response.body.byteLength,
      shape: ok ? "generic nested records; not selected" : "unselected candidate unavailable",
    });
  }
} catch (error) {
  const allowed = new Set([
    "WINDOWS_REQUIRED",
    "FIXED_ORIGIN_REQUIRED",
    "VALIDATED_RUNNING_VERSION_REQUIRED",
    "CONTRACT_DRIFT",
    "KNOWN_INSTRUMENT_NOT_FOUND",
    "LOGIN_REQUIRED",
    "MARKET_PERMISSION_REQUIRED",
    "UPSTREAM_UNAVAILABLE",
    "UPSTREAM_RESPONSE_INVALID",
    "OPENAPI_CONTRACT_MISSING",
    "OPENAPI_FETCH_FAILED",
    "OPENAPI_INVALID",
    "OPENAPI_RESPONSE_TOO_LARGE",
  ]);
  const code = allowed.has(error?.code)
    ? error.code
    : allowed.has(error?.message)
      ? error.message
      : "CONTRACT_PREFLIGHT_FAILED";
  emit(stage, { result: "FAIL", error: code });
  process.exitCode = 1;
}
