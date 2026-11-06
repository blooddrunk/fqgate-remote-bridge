import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { fingerprintJson, parseOpenApiDocument } from "../openapi/catalog.js";
import { type HttpTransport } from "../release/http.js";
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
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
}

/** Reviewed 2.0.5 AccountSnapshot/SavedLoginSnapshot, not the MP-8 fixture schema.
 * Optional nullable display/kind/L2 values remain optional; never treated as account IDs.
 * Only this bounded projection is kept in memory, never logged or persisted.
 */
function accountSnapshot(value: Record<string, unknown>, state: string, utcMs: number) {
  keys(value, ["descriptor", "snapshot"]);
  const descriptor = object(value.descriptor),
    snapshot = object(value.snapshot);
  const saved = object(snapshot.saved_login);
  keys(descriptor, ["session_supported", "saved_login_supported", "actions"]);
  keys(snapshot, [
    "state",
    "account_display",
    "session_kind",
    "level2_access",
    "saved_login",
    "observed_at",
    "session_notice",
  ]);
  keys(saved, ["available", "account_display", "session_kind", "level2_access"]);
  if (
    typeof descriptor.session_supported !== "boolean" ||
    typeof descriptor.saved_login_supported !== "boolean" ||
    !Array.isArray(descriptor.actions) ||
    descriptor.actions.length > 3 ||
    new Set(descriptor.actions).size !== descriptor.actions.length ||
    descriptor.actions.some(
      (action) =>
        typeof action !== "string" ||
        !["logout", "restore_saved_login", "clear_saved_login"].includes(action),
    ) ||
    typeof saved.available !== "boolean"
  )
    fail();
  if (snapshot.state !== state) fail("FQGATE_INCOMPATIBLE");
  for (const v of [snapshot.account_display, saved.account_display])
    if (v !== undefined && v !== null && (!text(v, 128) || !v.trim())) fail();
  for (const v of [snapshot.session_kind, saved.session_kind])
    if (v !== undefined && v !== null && v !== "user" && v !== "guest") fail();
  for (const v of [snapshot.level2_access, saved.level2_access])
    if (v !== undefined && v !== null && typeof v !== "boolean") fail();
  if (
    snapshot.session_notice !== undefined &&
    snapshot.session_notice !== null &&
    snapshot.session_notice !== "level2_replaced_by_remote_login"
  )
    fail();
  if (
    !text(snapshot.observed_at, 64) ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.observed_at)
  )
    fail();
  const observed = Date.parse(snapshot.observed_at);
  // Freshness is a Bridge policy, not an upstream login epoch. Advancing time is not identity drift.
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(utcMs) ||
    utcMs - observed > 30_000 ||
    observed - utcMs > 2_000
  )
    fail();
  return {
    observed,
    sessionSupported: descriptor.session_supported,
    stable: {
      descriptor: {
        session_supported: descriptor.session_supported,
        saved_login_supported: descriptor.saved_login_supported,
        actions: [...descriptor.actions].sort(),
      },
      snapshot: {
        state: snapshot.state,
        account_display: snapshot.account_display,
        session_kind: snapshot.session_kind,
        level2_access: snapshot.level2_access,
        session_notice: snapshot.session_notice,
        saved_login: {
          available: saved.available,
          account_display: saved.account_display,
          session_kind: saved.session_kind,
          level2_access: saved.level2_access,
        },
      },
    },
  };
}

/** Exact manually installed artifact only; no installation or global qualification authority. */
export class FqgateV2InstrumentLookup implements InstrumentLookupPort {
  constructor(
    private readonly options: {
      readonly http: HttpTransport;
      /** Proves full pinned payload, recorded process and sole IPv4 listener; returns PID/creation binding. */
      readonly identity: () => Promise<string>;
      readonly nowMs?: () => number;
      readonly nowUtcMs?: () => number;
    },
  ) {}

  async lookup(input: unknown): Promise<InstrumentLookupResponse> {
    const request = parseInstrumentLookupRequest(input);
    // Monotonic in production. Start before identity, not after it.
    const now = this.options.nowMs ?? (() => performance.now());
    const deadline = now() + 5_000;
    let stopped = false;
    const check = () => {
      if (stopped || !Number.isFinite(deadline) || now() >= deadline) fail("UPSTREAM_UNAVAILABLE");
    };
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        stopped = true;
        reject(
          new BridgeError(
            ERROR_CODES.UPSTREAM_UNAVAILABLE,
            "FQGate v2 read-only lookup prerequisites failed",
          ),
        );
      }, 5_000);
    });
    const proveIdentity = async () => {
      check();
      let value;
      try {
        value = await this.options.identity();
      } catch {
        check();
        fail("PROCESS_IDENTITY_MISMATCH");
      }
      check();
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
        fail("PROCESS_IDENTITY_MISMATCH");
      return value;
    };
    const run = async (): Promise<InstrumentLookupResponse> => {
      const identity = await proveIdentity();
      const read = async (
        path: string,
        source?: Source,
        maxBytes = 65_536,
      ): Promise<Record<string, unknown>> => {
        check();
        const remaining = Math.min(5_000, Math.floor(deadline - now()));
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
        check();
        if (response.body.byteLength > maxBytes) fail();
        let value;
        try {
          value = object(
            JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)),
          );
        } catch {
          check();
          fail();
        }
        check();
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
          check();
          fail("OPENAPI_CONTRACT_MISSING");
        }
        check();
      };
      const observations = new Map<string, number>();
      const select = async () => {
        const v = await read("/v2/source-instances");
        if (!Array.isArray(v.instances) || v.instances.length > 16) fail();
        const ids = new Set<string>(),
          pids = new Set<number>(),
          numbers = new Set<string>();
        const sources = v.instances
          .map((entry: unknown) => {
            const s = object(entry),
              session = object(s.session);
            if (
              !text(s.instanceId, 128) ||
              !/^[A-Za-z0-9_+=.-]{1,128}$/.test(s.instanceId) ||
              [".", ".."].includes(s.instanceId) ||
              ids.has(s.instanceId) ||
              !text(s.providerId, 128) ||
              !text(s.workerState, 32) ||
              !integer(s.instanceNo) ||
              !integer(s.pid) ||
              s.pid === 0 ||
              !integer(s.restartCount) ||
              typeof s.autoLogin !== "boolean" ||
              typeof s.defaultGuest !== "boolean" ||
              typeof session.state !== "string" ||
              !["connected", "disconnected", "unknown", "not_applicable"].includes(session.state)
            )
              fail();
            const number = `${s.providerId}:${s.instanceNo}`;
            if (pids.has(s.pid) || numbers.has(number)) fail();
            ids.add(s.instanceId);
            pids.add(s.pid);
            numbers.add(number);
            return {
              id: s.instanceId,
              provider: s.providerId,
              number: s.instanceNo,
              pid: s.pid,
              restarts: s.restartCount,
              worker: s.workerState,
              autoLogin: s.autoLogin,
              defaultGuest: s.defaultGuest,
              state: session.state,
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        const connected = sources.filter((s) => s.state === "connected");
        if (connected.length === 0) fail("LOGIN_REQUIRED");
        if (connected.length !== 1) fail("FQGATE_INCOMPATIBLE");
        const selected = connected[0]!;
        if (selected.provider !== "tonghuashun" || selected.worker !== "ready")
          fail("FQGATE_INCOMPATIBLE");
        const peers = [];
        // Sequential and bounded: at most 16 account GETs per sample; no racing peer publication.
        for (const source of sources) {
          const account = accountSnapshot(
            await read(`/v2/source-instances/${encodeURIComponent(source.id)}/account`, source),
            source.state,
            (this.options.nowUtcMs ?? Date.now)(),
          );
          check();
          if (source.id === selected.id && !account.sessionSupported) fail("LOGIN_REQUIRED");
          const previous = observations.get(source.id);
          if (previous !== undefined && account.observed < previous) fail("FQGATE_INCOMPATIBLE");
          observations.set(source.id, account.observed);
          peers.push({ source, account: account.stable });
        }
        check();
        return { id: selected.id, identity: fingerprintJson(peers) };
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
        typeof coverage.status !== "string" ||
        !["complete", "unknown"].includes(coverage.status) ||
        typeof data.data_state !== "string" ||
        !["present", "empty", "empty_indeterminate"].includes(data.data_state) ||
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
            typeof security.market !== "string" ||
            !["XSHG", "XSHE", "XBEI"].includes(security.market) ||
            !text(item.name, 128)
          )
            fail();
          return {
            code: security.code,
            market: security.market,
            name: item.name,
            instrumentId: `${security.market}:${security.code}`,
          };
        })
        .filter((item) => item.code === request.code);
      const after = await select();
      if (after.identity !== source.identity) fail("FQGATE_INCOMPATIBLE");
      await version();
      await contract();
      check();
      if ((await proveIdentity()) !== identity) fail("PROCESS_IDENTITY_MISMATCH");
      check();
      return { items };
    };
    try {
      return await Promise.race([run(), expired]);
    } finally {
      stopped = true;
      clearTimeout(timer!);
    }
  }
}
