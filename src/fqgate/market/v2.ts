import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { fingerprintJson, parseOpenApiDocument } from "../openapi/catalog.js";
import { decodeResponseText, type HttpTransport } from "../release/http.js";
import { operationContractFingerprint } from "./contract.js";
import {
  parseInstrumentLookupRequest,
  type InstrumentLookupPort,
  type InstrumentLookupResponse,
} from "./lookup.js";

export const V2_LOOKUP_VERSION = "2.0.5";
export const V2_LOOKUP_TREE_HASH =
  "9b9eb7f886b9ecb07bff1f1c04ab0ab5851f1182cdf92d01a5e4ea90ac15c99f";
export const V2_LOOKUP_CONTRACTS = [
  ["/v2/system/version", "get"],
  ["/v2/system/health", "get"],
  ["/v2/source-instances", "get"],
  ["/v2/source-instances/{instance_id}/account", "get"],
  ["/v2/instruments/search", "get"],
] as const;
export const V2_LOOKUP_FINGERPRINT =
  "3d9ca6c84a7b0cb75c3caae5eaf39cf4bb047a4c40d013202984bcad12b0ebe6";

function fail(code: keyof typeof ERROR_CODES = "UPSTREAM_RESPONSE_INVALID"): never {
  throw new BridgeError(ERROR_CODES[code], "FQGate v2 read-only lookup prerequisites failed");
}
function object(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail();
  return v as Record<string, unknown>;
}
function text(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v);
}
function integer(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
interface Source {
  readonly id: string;
  readonly identity: string;
}

/** Exact manually installed artifact only; no installation or global qualification authority. */
export class FqgateV2InstrumentLookup implements InstrumentLookupPort {
  constructor(
    private readonly options: {
      readonly http: HttpTransport;
      /** Proves full pinned payload, recorded process and sole IPv4 listener; returns PID/creation binding. */
      readonly identity: () => Promise<string>;
      readonly nowMs?: () => number;
    },
  ) {}

  async lookup(input: unknown): Promise<InstrumentLookupResponse> {
    const request = parseInstrumentLookupRequest(input);
    const identity = await this.options.identity();
    if (!/^[a-f0-9]{64}$/.test(identity)) fail("PROCESS_IDENTITY_MISMATCH");
    const now = this.options.nowMs ?? Date.now;
    const deadline = now() + 5_000;
    const read = async (
      path: string,
      source?: Source,
      maxBytes = 65_536,
    ): Promise<Record<string, unknown>> => {
      const remaining = deadline - now();
      if (remaining <= 0) fail("UPSTREAM_UNAVAILABLE");
      let response;
      try {
        response = await this.options.http.request(`http://127.0.0.1:17281${path}`, {
          method: "GET",
          redirect: "error",
          timeoutMs: remaining,
          maxBytes,
          headers:
            source === undefined
              ? {}
              : {
                  "X-FQGate-Instance-Id": source.id,
                  "X-Request-Timeout-Ms": String(remaining),
                },
        });
      } catch {
        fail("UPSTREAM_UNAVAILABLE");
      }
      if (response.body.byteLength > maxBytes) fail();
      let value;
      try {
        value = object(JSON.parse(decodeResponseText(response)));
      } catch {
        fail();
      }
      if (value.code === 3001) fail("LOGIN_REQUIRED");
      if (value.code === 3006 || value.code === "market_access_restricted")
        fail("MARKET_PERMISSION_REQUIRED");
      if (
        response.status !== 200 ||
        value.ok === false ||
        (value.code !== undefined && value.code !== 0)
      )
        fail("UPSTREAM_UNAVAILABLE");
      return value;
    };
    const version = async () => {
      const v = await read("/v2/system/version");
      if (
        v.version !== V2_LOOKUP_VERSION ||
        v.product !== "FQGate" ||
        v.api_version !== "2.0" ||
        v.platform !== "windows" ||
        v.architecture !== "x86_64"
      )
        fail("FQGATE_INCOMPATIBLE");
      const h = await read("/v2/system/health");
      if (h.status !== "ready") fail("UPSTREAM_UNAVAILABLE");
    };
    const contract = async () => {
      const doc = await read("/openapi.json", undefined, 4 * 1024 * 1024);
      try {
        parseOpenApiDocument(doc);
        if (operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS) !== V2_LOOKUP_FINGERPRINT)
          fail("OPENAPI_CONTRACT_MISSING");
      } catch {
        fail("OPENAPI_CONTRACT_MISSING");
      }
    };
    const select = async (): Promise<Source> => {
      const v = await read("/v2/source-instances");
      if (!Array.isArray(v.instances) || v.instances.length > 16) fail();
      const ids = new Set<string>();
      const sources = v.instances.map((entry: unknown) => {
        const s = object(entry),
          session = object(s.session);
        if (
          !text(s.instanceId, 128) ||
          !/^[A-Za-z0-9_+=.-]{1,128}$/.test(s.instanceId) ||
          [".", ".."].includes(s.instanceId) ||
          ids.has(s.instanceId) ||
          !["connected", "disconnected", "unknown", "not_applicable"].includes(
            String(session.state),
          )
        )
          fail();
        ids.add(s.instanceId);
        return s;
      });
      const connected = sources.filter((s) => object(s.session).state === "connected");
      if (connected.length === 0) fail("LOGIN_REQUIRED");
      if (connected.length !== 1) fail("FQGATE_INCOMPATIBLE");
      const s = connected[0]!;
      if (
        s.providerId !== "tonghuashun" ||
        s.workerState !== "ready" ||
        !integer(s.instanceNo) ||
        !integer(s.pid) ||
        s.pid === 0 ||
        !integer(s.restartCount)
      )
        fail("FQGATE_INCOMPATIBLE");
      const source = {
        id: s.instanceId as string,
        identity: fingerprintJson({
          id: s.instanceId,
          provider: s.providerId,
          number: s.instanceNo,
          pid: s.pid,
          restarts: s.restartCount,
        }),
      };
      const account = await read(
        `/v2/source-instances/${encodeURIComponent(source.id)}/account`,
        source,
      );
      if (
        object(account.descriptor).session_supported !== true ||
        object(account.snapshot).state !== "connected"
      )
        fail("LOGIN_REQUIRED");
      return source;
    };
    await version();
    await contract();
    const source = await select();
    const result = await read(`/v2/instruments/search?query=${request.code}`, source);
    if (result.code !== 0 || typeof result.message !== "string") fail();
    const data = object(result.data),
      coverage = object(data.coverage);
    if (
      !Array.isArray(data.items) ||
      data.items.length > 16 ||
      data.row_count !== data.items.length ||
      coverage.returned_count !== data.items.length ||
      !["complete", "partial", "unknown"].includes(String(coverage.status)) ||
      !["present", "empty", "empty_indeterminate"].includes(String(data.data_state)) ||
      data.items.length > 0 !== (data.data_state === "present")
    )
      fail();
    const items = data.items
      .map((entry: unknown) => {
        const item = object(entry),
          security = object(item.security);
        if (
          !text(security.code, 16) ||
          !/^[A-Za-z0-9]{1,16}$/.test(security.code) ||
          !["XSHG", "XSHE", "XBEI"].includes(String(security.market)) ||
          !text(item.name, 128)
        )
          fail();
        return {
          code: security.code,
          market: String(security.market),
          name: item.name,
          instrumentId: `${String(security.market)}:${security.code}`,
        };
      })
      .filter((item) => item.code === request.code);
    const after = await select();
    if (after.identity !== source.identity) fail("FQGATE_INCOMPATIBLE");
    await version();
    await contract();
    if (now() >= deadline) fail("UPSTREAM_UNAVAILABLE");
    if ((await this.options.identity()) !== identity) fail("PROCESS_IDENTITY_MISMATCH");
    return { items };
  }
}
