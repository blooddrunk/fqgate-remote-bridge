import { fingerprintJson } from "../openapi/catalog.js";
import { operationContractFingerprint } from "../market/contract.js";
import { V2_LOOKUP_CONTRACTS, V2_LOOKUP_FINGERPRINT } from "../market/v2.js";
import { QR_CENSUS_CONTRACTS, V2_QR_FINGERPRINT } from "./qr-contract.js";
import type { HttpTransport } from "../release/http.js";

// A diagnostic contract only. Never imported by runtime composition or the MP-1 prototype.
export interface ProfilePreflightConfig {
  readonly schemaVersion: 1;
  readonly expectedBridgeCommit: string;
  readonly profiles: readonly {
    readonly alias: string;
    readonly sourceId: string;
    readonly instanceNumber: number;
    readonly expectedState: "connected" | "disconnected";
  }[];
}
export interface NativeProcessFact {
  readonly pid: number;
  readonly parentPid: number;
  readonly path: string;
  readonly created: string;
  readonly pathSafe: boolean;
}
export interface ProfileNativeFacts {
  readonly listeners: readonly {
    readonly port: number;
    readonly address: string;
    readonly pid: number;
  }[];
  readonly processes: readonly NativeProcessFact[];
  readonly payloadVerified: boolean;
  readonly recordVerified: boolean;
}
export interface ProfileGate {
  readonly id: string;
  readonly status: "OBSERVED" | "BLOCKED" | "UNPROVEN" | "NOT_EXECUTED";
  readonly reason: string;
}
const sourceId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_+=.-]{1,128}$/.test(v) && v !== "." && v !== "..";
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error();
  return v as Record<string, unknown>;
};
function keys(v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) throw Error();
}
export function parseProfilePreflightConfig(input: unknown): ProfilePreflightConfig {
  const v = object(input);
  keys(v, ["schemaVersion", "expectedBridgeCommit", "profiles"]);
  if (
    v.schemaVersion !== 1 ||
    typeof v.expectedBridgeCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(v.expectedBridgeCommit) ||
    !Array.isArray(v.profiles) ||
    v.profiles.length < 1 ||
    v.profiles.length > 16
  )
    throw Error();
  const aliases = new Set(),
    ids = new Set(),
    numbers = new Set();
  const profiles = v.profiles.map((input: unknown) => {
    const p = object(input);
    keys(p, ["alias", "sourceId", "instanceNumber", "expectedState"]);
    if (
      typeof p.alias !== "string" ||
      !/^p_[a-f0-9]{32}$/.test(p.alias) ||
      !sourceId(p.sourceId) ||
      !integer(p.instanceNumber) ||
      p.instanceNumber > 65535 ||
      (p.expectedState !== "connected" && p.expectedState !== "disconnected") ||
      aliases.has(p.alias) ||
      ids.has(p.sourceId) ||
      numbers.has(p.instanceNumber)
    )
      throw Error();
    aliases.add(p.alias);
    ids.add(p.sourceId);
    numbers.add(p.instanceNumber);
    return Object.freeze({
      alias: p.alias,
      sourceId: p.sourceId,
      instanceNumber: p.instanceNumber,
      expectedState: p.expectedState as "connected" | "disconnected",
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    expectedBridgeCommit: v.expectedBridgeCommit,
    profiles: Object.freeze(profiles),
  });
}

/** Fixed GET-only, no credentials, retries, repairs, or account selectors on Bridge requests.
 * Real account proof is deliberately unavailable in the reviewed 2.0.5 contract.
 * Equal samples MUST NOT promote readiness to true, even with injected identity fields.
 */
export async function inspectProfilePreflight(options: {
  readonly config: unknown;
  readonly checkoutCommit: string;
  readonly http: HttpTransport;
  readonly native: (workerPids: readonly number[]) => Promise<ProfileNativeFacts>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const observedTimes: number[][] = [];
  const gates: ProfileGate[] = [];
  const add = (id: string, status: ProfileGate["status"], reason: string) =>
    gates.push({ id, status, reason });
  const summaries: {
    profile: number;
    workerState: string;
    state: string;
    displayPresent: boolean;
    savedLoginAvailable: boolean;
    level2: boolean | null;
    strongAccountIdentity: false;
    nativeSessionEpoch: false;
    workerPid: number;
    workerCreated: string;
    restartCount: number;
  }[] = [];
  let getCount = 0;
  let runningCommit: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  let stopped = false;
  let failureReason = "SOURCE_WORKER_ACCOUNT_CONTRACT_CHANGED_OR_UNAVAILABLE";
  const deny = (reason: string): never => {
    failureReason = reason;
    throw Error();
  };
  const stop = new Promise<never>((_, reject) => {
    cancel = () => {
      stopped = true;
      reject(Error());
    };
    timer = setTimeout(cancel, Math.max(1, Math.min(options.timeoutMs ?? 60_000, 60_000)));
    options.signal?.addEventListener("abort", cancel, { once: true });
  });
  // An injected port that never settles cannot hang the diagnostic or publish a late result.
  const bounded = async <T>(run: () => Promise<T>) => {
    if (stopped || options.signal?.aborted) throw Error();
    const result = await Promise.race([run(), stop]);
    if (stopped || options.signal?.aborted) throw Error();
    return result;
  };
  const get = async (port: 17281 | 17282, path: string, maxBytes = 65536) => {
    const r = await bounded(() => {
      getCount++;
      return options.http.request(`http://127.0.0.1:${port}${path}`, {
        method: "GET",
        redirect: "error",
        timeoutMs: 5000,
        maxBytes,
        headers: { accept: "application/json" },
      });
    });
    if (r.body.byteLength > maxBytes) throw Error();
    return {
      status: r.status,
      value: object(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(r.body))),
    };
  };
  const read = async (path: string, maxBytes?: number) => {
    const r = await get(17281, path, maxBytes);
    if (
      r.status !== 200 ||
      r.value.ok === false ||
      (r.value.code !== undefined && r.value.code !== 0)
    )
      throw Error();
    return r.value;
  };
  let config: ProfilePreflightConfig;
  try {
    config = parseProfilePreflightConfig(options.config);
    add("CONFIG", "OBSERVED", "EXPLICIT_UNIQUE_ALIAS_SOURCE_MAP");
  } catch {
    add("CONFIG", "BLOCKED", "INVALID_OR_AMBIGUOUS_PRIVATE_MAPPING");
    return finish();
  }
  const native = async (pids: readonly number[]) => {
    const facts = await bounded(() => options.native(pids)).catch(() => {
      add("NATIVE_COLLECTION", "BLOCKED", "PROCESS_LISTENER_PATH_READ_UNAVAILABLE_OR_CHANGED");
      throw Error();
    });
    const bindings: Record<string, NativeProcessFact> = {};
    for (const port of [17281, 17282]) {
      const listeners = facts.listeners.filter((l) => l.port === port);
      if (listeners.length !== 1 || listeners[0]!.address !== "127.0.0.1") {
        add(
          `LISTENER_${port}`,
          "BLOCKED",
          listeners.length === 0 ? "LISTENER_ABSENT" : "LISTENER_NOT_EXCLUSIVE_IPV4_LOOPBACK",
        );
        continue;
      }
      const matches = facts.processes.filter((p) => p.pid === listeners[0]!.pid);
      if (matches.length !== 1 || !validProcess(matches[0]!)) {
        add(`OWNER_${port}`, "BLOCKED", "NATIVE_OWNER_IDENTITY_UNREADABLE");
        continue;
      }
      bindings[String(port)] = matches[0]!;
      add(`LISTENER_${port}`, "OBSERVED", "EXCLUSIVE_IPV4_LOOPBACK_NATIVE_OWNER");
    }
    add(
      "PAYLOAD_PROCESS_RECORD",
      facts.payloadVerified && facts.recordVerified ? "OBSERVED" : "BLOCKED",
      facts.payloadVerified && facts.recordVerified
        ? "PINNED_205_ARTIFACT_AND_NATIVE_CREATION"
        : "INSTALL_OR_PROCESS_RECORD_UNVERIFIED",
    );
    for (const pid of pids) {
      const workers = facts.processes.filter((p) => p.pid === pid);
      const parent = bindings["17281"];
      if (
        !parent ||
        workers.length !== 1 ||
        !validProcess(workers[0]!) ||
        workers[0]!.parentPid !== parent.pid ||
        workers[0]!.pid === parent.pid ||
        workers[0]!.created < parent.created ||
        workers[0]!.path.toLowerCase() !== parent.path.toLowerCase()
      )
        throw Error();
      bindings[`worker-${pid}`] = workers[0]!;
    }
    return {
      bindings,
      payloadVerified: facts.payloadVerified,
      recordVerified: facts.recordVerified,
    };
  };
  try {
    const firstNative = await native([]);
    try {
      if (!firstNative.bindings["17282"]) throw Error();
      const r = await get(17282, "/api/v1/version");
      const v = r.value;
      if (
        r.status !== 200 ||
        v.name !== "fqgate-remote-bridge" ||
        typeof v.commit !== "string" ||
        !/^[a-f0-9]{40}$/.test(v.commit)
      )
        throw Error();
      runningCommit = v.commit;
      add(
        "BRIDGE_BUILD",
        v.commit === config.expectedBridgeCommit ? "OBSERVED" : "BLOCKED",
        v.commit === config.expectedBridgeCommit
          ? "RUNNING_BUILD_MATCHES_EXPLICIT_EXPECTATION"
          : "RUNNING_BUILD_MISMATCH",
      );
      add(
        "CHECKOUT_RUNTIME",
        v.commit === options.checkoutCommit ? "OBSERVED" : "BLOCKED",
        v.commit === options.checkoutCommit
          ? "CHECKOUT_MATCHES_RUNNING_BUILD"
          : "CHECKOUT_IS_NOT_RUNNING_BUILD",
      );
    } catch {
      add("BRIDGE_BUILD", "BLOCKED", "RUNNING_BUILD_UNAVAILABLE");
    }
    try {
      if (!firstNative.bindings["17282"]) throw Error();
      for (const path of [
        "/api/v1/instruments/lookup",
        "/api/v1/session/qr/begin",
        "/api/v1/session/qr/poll",
      ]) {
        const r = await get(17282, path);
        if (r.status !== 405 || object(r.value.error).code !== "METHOD_NOT_ALLOWED") throw Error();
      }
      add("BRIDGE_GET_DENIALS", "OBSERVED", "LOOKUP_QR_GET_METHODS_DENIED");
    } catch {
      add("BRIDGE_GET_DENIALS", "BLOCKED", "METHOD_DENIALS_UNVERIFIED");
    }
    if (!firstNative.bindings["17281"]) deny("NATIVE_LISTENER_OWNER_UNVERIFIED_NO_NATIVE_GET");
    const snapshot = async () => {
      const times: number[] = [];
      const version = await read("/v2/system/version"),
        health = await read("/v2/system/health");
      if (
        version.version !== "2.0.5" ||
        version.product !== "FQGate" ||
        version.api_version !== "2.0" ||
        version.platform !== "windows" ||
        version.architecture !== "x86_64" ||
        health.status !== "ready"
      )
        throw Error();
      const doc = await read("/openapi.json", 4 * 1024 * 1024);
      if (
        operationContractFingerprint(doc, QR_CENSUS_CONTRACTS) !== V2_QR_FINGERPRINT ||
        operationContractFingerprint(doc, V2_LOOKUP_CONTRACTS) !== V2_LOOKUP_FINGERPRINT
      )
        deny("UNKNOWN_OPENAPI_CONTRACT_NO_ACCOUNT_GET");
      const inventory = await read("/v2/source-instances");
      if (!Array.isArray(inventory.instances) || inventory.instances.length > 16) throw Error();
      const seen = new Set(),
        workerIds = new Set(),
        numbers = new Set();
      const sources = inventory.instances.map((input: unknown) => {
        const s = object(input),
          state = object(s.session).state;
        if (
          !sourceId(s.instanceId) ||
          seen.has(s.instanceId) ||
          !integer(s.instanceNo) ||
          s.instanceNo > 65535 ||
          !integer(s.pid) ||
          s.pid === 0 ||
          s.pid > 2147483647 ||
          workerIds.has(s.pid) ||
          !integer(s.restartCount) ||
          s.providerId !== "tonghuashun" ||
          s.workerState !== "ready" ||
          numbers.has(s.instanceNo) ||
          !["connected", "disconnected"].includes(String(state)) ||
          typeof s.autoLogin !== "boolean" ||
          typeof s.defaultGuest !== "boolean"
        )
          throw Error();
        seen.add(s.instanceId);
        workerIds.add(s.pid);
        numbers.add(s.instanceNo);
        return {
          id: s.instanceId,
          number: s.instanceNo,
          pid: s.pid,
          restarts: s.restartCount,
          workerState: s.workerState,
          autoLogin: s.autoLogin,
          defaultGuest: s.defaultGuest,
          state,
        };
      });
      if (sources.length !== config.profiles.length) throw Error();
      const results = await Promise.all(
        config.profiles.map((p, index) =>
          (async () => {
            const s = sources.find((s) => s.id === p.sourceId && s.number === p.instanceNumber);
            if (!s || s.state !== p.expectedState) throw Error();
            const base = `/v2/source-instances/${encodeURIComponent(p.sourceId)}`;
            const account = await read(`${base}/account`),
              auth = await read(`${base}/authentication`);
            const a = object(account.snapshot),
              saved = object(a.saved_login),
              descriptor = object(account.descriptor);
            keys(a, [
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
              a.state !== s.state ||
              descriptor.session_supported !== true ||
              typeof saved.available !== "boolean" ||
              !Array.isArray(auth.modes) ||
              !auth.modes.includes("app_qr") ||
              auth.modes.length > 5 ||
              new Set(auth.modes).size !== auth.modes.length ||
              auth.modes.some(
                (m) =>
                  typeof m !== "string" ||
                  !["guest", "local_client", "app_qr", "sms_code", "username_password"].includes(m),
              ) ||
              typeof a.observed_at !== "string" ||
              !Number.isFinite(Date.parse(a.observed_at))
            )
              throw Error();
            if (
              typeof a.observed_at !== "string" ||
              !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(a.observed_at) ||
              now() - Date.parse(a.observed_at) > 30_000 ||
              Date.parse(a.observed_at) - now() > 2_000
            )
              deny("SNAPSHOT_STALE_FUTURE_OR_TIMEZONE_UNKNOWN");
            times[index] = Date.parse(a.observed_at);
            for (const v of [a.account_display, saved.account_display])
              if (
                v !== undefined &&
                v !== null &&
                (typeof v !== "string" ||
                  v.length < 1 ||
                  v.length > 128 ||
                  /[\p{Cc}\p{Cf}]/u.test(v))
              )
                throw Error();
            for (const v of [a.session_kind, saved.session_kind])
              if (v !== undefined && v !== null && !["user", "guest"].includes(String(v)))
                throw Error();
            for (const v of [a.level2_access, saved.level2_access])
              if (v !== undefined && v !== null && typeof v !== "boolean") throw Error();
            if (
              a.session_notice !== undefined &&
              a.session_notice !== null &&
              a.session_notice !== "level2_replaced_by_remote_login"
            )
              throw Error();
            return {
              source: s,
              account: { ...a, observed_at: undefined },
              descriptor,
              modes: auth.modes,
              summary: {
                profile: index + 1,
                workerState: "ready",
                state: p.expectedState,
                displayPresent: typeof a.account_display === "string",
                savedLoginAvailable: saved.available,
                level2: typeof a.level2_access === "boolean" ? a.level2_access : null,
                strongAccountIdentity: false as const,
                nativeSessionEpoch: false as const,
              },
            };
          })().catch(() => {
            // Fence the peer immediately, even if its in-flight account GET resolves later.
            stopped = true;
            throw Error();
          }),
        ),
      );
      observedTimes.push(times);
      const workers = await native(sources.map((s) => s.pid));
      return { results, workers };
    };
    const before = await snapshot();
    const after = await snapshot();
    if (fingerprintJson(before) !== fingerprintJson(after)) throw Error();
    if (observedTimes[1]!.some((time, i) => time < observedTimes[0]![i]!))
      deny("SNAPSHOT_TIME_REGRESSED");
    for (const port of ["17281", "17282"])
      if (
        fingerprintJson(firstNative.bindings[port] ?? null) !==
        fingerprintJson(after.workers.bindings[port] ?? null)
      )
        throw Error();
    if (runningCommit !== null) {
      const finalBuild = await get(17282, "/api/v1/version");
      if (finalBuild.status !== 200 || finalBuild.value.commit !== runningCommit) throw Error();
    }
    if (observedTimes.flat().some((time) => now() - time > 30_000 || time - now() > 2_000))
      deny("SNAPSHOT_EXPIRED_BEFORE_PUBLICATION");
    summaries.push(
      ...before.results.map((s) => ({
        ...s.summary,
        workerPid: s.source.pid,
        workerCreated: before.workers.bindings[`worker-${s.source.pid}`]!.created,
        restartCount: s.source.restarts,
      })),
    );
    const connected = summaries.filter((s) => s.state === "connected").length;
    add(
      "LEGACY_SINGLE_PROFILE_STATE",
      connected > 1 ? "BLOCKED" : "OBSERVED",
      connected > 1
        ? "MULTIPLE_CONNECTED_SOURCES_BREAK_EXISTING_LOOKUP_QR_GUARD"
        : "EXISTING_SINGLE_CONNECTED_GUARD_PRESERVED",
    );
    add("ALIAS_SOURCE_CONTINUITY", "OBSERVED", "TWO_EQUAL_SAMPLES_WITH_NATIVE_WORKER_CREATION");
    add("SNAPSHOT_FRESHNESS", "OBSERVED", "WITHIN_30_SECONDS_AND_NOT_REGRESSING_NOT_AN_EPOCH");
    // Display, even when equal or hashed, is never an account credential.
    add("ACCOUNT_IDENTITY", "UNPROVEN", "NO_REVIEWED_NON_DISPLAY_ACCOUNT_ID");
    add("SESSION_EPOCH", "UNPROVEN", "NO_NATIVE_EPOCH_A_B_A_BETWEEN_SAMPLES_UNDETECTABLE");
    add(
      "MP1_NATIVE_REQUIREMENTS",
      "BLOCKED",
      "SYNTHETIC_IDENTITY_PORTS_CANNOT_BE_FILLED_FROM_REVIEWED_NATIVE_CONTRACT",
    );
  } catch {
    add("ALIAS_SOURCE_CONTINUITY", "BLOCKED", failureReason);
  }
  return finish();
  function finish() {
    stopped = true;
    if (!gates.some((g) => g.id === "ACCOUNT_IDENTITY"))
      add("ACCOUNT_IDENTITY", "UNPROVEN", "NO_REVIEWED_NON_DISPLAY_ACCOUNT_ID");
    if (!gates.some((g) => g.id === "SESSION_EPOCH"))
      add("SESSION_EPOCH", "UNPROVEN", "NO_NATIVE_EPOCH_A_B_A_BETWEEN_SAMPLES_UNDETECTABLE");
    add("L2_INDEPENDENCE", "UNPROVEN", "ENTITLEMENT_FLAG_IS_NOT_PEER_OR_DATA_ISOLATION_PROOF");
    add("SAVED_LOGIN_ISOLATION", "UNPROVEN", "AVAILABILITY_IS_NOT_RESTORE_OR_STORAGE_PROOF");
    add("PROCESS_MUTATION", "NOT_EXECUTED", "NO_START_STOP_RESTART_OR_DEPLOYMENT");
    clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener("abort", cancel);
    add("LIVE_QR", "NOT_EXECUTED", "SEPARATE_AUTHORIZATION_AND_NATIVE_IDENTITY_CONTRACT_REQUIRED");
    return {
      schemaVersion: 1,
      mode: "GET_ONLY_READINESS" as const,
      resumeProcedure: "docs/operations/windows-fqgate205-mp4.md",
      qualification: "LIVE_MULTI_ACCOUNT_ISOLATION_NOT_QUALIFIED" as const,
      readyForNativeIntegration: false as const,
      runningCommit,
      checkoutCommit: options.checkoutCommit,
      gates,
      profiles: summaries,
      counters: { get: getCount, post: 0, accountWrites: 0, qrBegin: 0, qrPoll: 0 },
      exitCode: 1,
    };
  }
}
function validProcess(p: NativeProcessFact) {
  return (
    integer(p.pid) &&
    p.pid > 0 &&
    integer(p.parentPid) &&
    p.pathSafe === true &&
    typeof p.path === "string" &&
    p.path.length > 0 &&
    p.path.length <= 1024 &&
    typeof p.created === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(p.created) &&
    Number.isFinite(Date.parse(p.created))
  );
}
