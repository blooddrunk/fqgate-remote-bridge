import { fingerprintJson } from "../openapi/catalog.js";
import { parseInstrumentLookupRequest, type InstrumentLookupResponse } from "../market/lookup.js";
import { assessCandidate, type CandidateObservation, type CandidateProfile } from "./registry.js";

export class CandidateDenied extends Error {
  readonly code = "MP8_CANDIDATE_DENIED";
  constructor() {
    super("Offline lookup candidate prerequisites or continuity failed");
  }
}
function deny(): never {
  throw new CandidateDenied();
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) deny();
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k))) deny();
}
function text(v: unknown, max = 128): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v);
}
const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function created(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/.test(v) &&
    Number.isFinite(Date.parse(v))
  );
}

export interface FixtureAttestation {
  readonly observation: CandidateObservation;
  readonly process: {
    readonly pid: number;
    readonly created: string;
    readonly recordedCreated: string;
    readonly pathSha256: string;
    readonly recordSha256: string;
    readonly stateSha256: string;
  };
  /** Both IPv4 and IPv6 must be collected; state 0 is always UNKNOWN/denied. */
  readonly listener: {
    readonly families: readonly [2, 23];
    readonly rows: readonly {
      readonly family: number;
      readonly address: string;
      readonly port: number;
      readonly state: number;
      readonly pid: number;
    }[];
  };
  /** Synthetic Source lifetime evidence, NOT an account ID/login epoch. No native adapter exists. */
  readonly lifetimes: readonly {
    readonly id: string;
    readonly generation: number;
    readonly workerPid: number;
    readonly workerCreated: string;
    readonly parentPid: number;
  }[];
}
export interface FixtureReadOptions {
  readonly method: "GET";
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal: AbortSignal;
  readonly sourceId?: string;
}
/** Injected synthetic ports only. No native, HTTP, config, service or route implementation. */
export interface LookupFixturePorts {
  attest(signal: AbortSignal, remainingMs: number): Promise<FixtureAttestation>;
  read(
    path: string,
    options: FixtureReadOptions,
  ): Promise<{ readonly status: number; readonly body: Uint8Array }>;
}

/** Every completion is scoped to its own call and absolute deadline. Never production authority. */
export class OfflineLookupCandidate {
  private readonly profiles: readonly CandidateProfile[];
  constructor(
    profiles: readonly CandidateProfile[],
    private readonly ports: LookupFixturePorts,
    private readonly now: () => number = () => performance.now(),
    private readonly utcNow: () => number = Date.now,
  ) {
    this.profiles = structuredClone(profiles);
  }

  async lookup(input: unknown): Promise<InstrumentLookupResponse> {
    let request;
    try {
      request = parseInstrumentLookupRequest(input);
    } catch {
      deny();
    }
    const controller = new AbortController();
    const started = this.now(),
      deadline = started + 5000;
    let last = started;
    const remaining = () => {
      const now = this.now();
      if (!Number.isFinite(now) || now < last || controller.signal.aborted || now >= deadline)
        deny();
      last = now;
      return deadline - now;
    };
    const checked = async <T>(call: () => Promise<T>): Promise<T> => {
      remaining();
      const value = await call();
      remaining();
      return value;
    };
    const read = async (path: string, sourceId?: string, maxBytes = 65536) => {
      const response = await checked(() =>
        this.ports.read(path, {
          method: "GET",
          timeoutMs: remaining(),
          maxBytes,
          signal: controller.signal,
          ...(sourceId === undefined ? {} : { sourceId }),
        }),
      );
      // Status before decoding: HTML/empty 503 is rejected without inspecting secrets.
      if (
        response.status !== 200 ||
        !(response.body instanceof Uint8Array) ||
        response.body.byteLength > maxBytes
      )
        deny();
      return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)));
    };
    const attest = async () => {
      const a = structuredClone(
        await checked(() => this.ports.attest(controller.signal, remaining())),
      );
      keys(record(a), ["observation", "process", "listener", "lifetimes"]);
      if (assessCandidate(this.profiles, a.observation).state !== "OFFLINE_CANDIDATE") deny();
      const p = record(a.process),
        l = record(a.listener);
      keys(p, ["pid", "created", "recordedCreated", "pathSha256", "recordSha256", "stateSha256"]);
      keys(l, ["families", "rows"]);
      if (
        !positive(p.pid) ||
        !created(p.created) ||
        p.created !== p.recordedCreated ||
        !digest(p.pathSha256) ||
        !digest(p.recordSha256) ||
        !digest(p.stateSha256) ||
        JSON.stringify(l.families) !== "[2,23]" ||
        !Array.isArray(l.rows) ||
        l.rows.length !== 1
      )
        deny();
      const row = record(l.rows[0]);
      keys(row, ["family", "address", "port", "state", "pid"]);
      if (
        row.family !== 2 ||
        row.address !== "127.0.0.1" ||
        row.port !== 17281 ||
        row.state !== 2 ||
        row.pid !== p.pid
      )
        deny();
      if (!Array.isArray(a.lifetimes) || a.lifetimes.length > 16) deny();
      const ids = new Set(),
        workers = new Set();
      for (const raw of a.lifetimes) {
        const w = record(raw);
        keys(w, ["id", "generation", "workerPid", "workerCreated", "parentPid"]);
        if (
          !text(w.id) ||
          ids.has(w.id) ||
          !positive(w.generation) ||
          !positive(w.workerPid) ||
          w.workerPid === p.pid ||
          workers.has(w.workerPid) ||
          !created(w.workerCreated) ||
          w.parentPid !== p.pid
        )
          deny();
        ids.add(w.id);
        workers.add(w.workerPid);
      }
      return a;
    };
    const snapshot = async () => {
      const a = await attest();
      const v = await read("/v2/system/version");
      keys(v, ["product", "version", "api_version", "platform", "architecture"]);
      if (
        v.product !== "FQGate" ||
        v.version !== a.observation.version ||
        v.api_version !== "2.0" ||
        v.platform !== "windows" ||
        v.architecture !== "x86_64"
      )
        deny();
      const health = await read("/v2/system/health");
      keys(health, ["status"]);
      if (health.status !== "ready") deny();
      const document = await read("/openapi.json", undefined, 4 * 1024 * 1024);
      if (
        assessCandidate(this.profiles, { ...a.observation, document }).state !== "OFFLINE_CANDIDATE"
      )
        deny();
      const inventory = await read("/v2/source-instances");
      keys(inventory, ["instances"]);
      if (
        !Array.isArray(inventory.instances) ||
        inventory.instances.length === 0 ||
        inventory.instances.length > 16
      )
        deny();
      const ids = new Set(),
        workers = new Set();
      let selected: string | undefined;
      const peers = [];
      for (const raw of inventory.instances) {
        const s = record(raw),
          session = record(s.session);
        keys(s, [
          "instanceId",
          "providerId",
          "instanceNo",
          "pid",
          "restartCount",
          "workerState",
          "session",
        ]);
        keys(session, ["state"]);
        if (
          !text(s.instanceId) ||
          !/^[A-Za-z0-9_+=.-]+$/.test(s.instanceId) ||
          [".", ".."].includes(s.instanceId) ||
          ids.has(s.instanceId) ||
          !positive(s.pid) ||
          workers.has(s.pid) ||
          !positive(s.instanceNo) ||
          !Number.isSafeInteger(s.restartCount) ||
          Number(s.restartCount) < 0 ||
          s.providerId !== "tonghuashun" ||
          s.workerState !== "ready" ||
          !["connected", "disconnected"].includes(String(session.state)) ||
          typeof session.state !== "string"
        )
          deny();
        ids.add(s.instanceId);
        workers.add(s.pid);
        const lifetime = a.lifetimes.filter((w) => w.id === s.instanceId);
        if (lifetime.length !== 1 || lifetime[0]!.workerPid !== s.pid) deny();
        if (session.state === "connected") {
          if (selected !== undefined) deny();
          selected = s.instanceId;
        }
        const account = await read(
          `/v2/source-instances/${encodeURIComponent(s.instanceId)}/account`,
          s.instanceId,
        );
        keys(account, ["descriptor", "snapshot"]);
        const descriptor = record(account.descriptor),
          accountSnapshot = record(account.snapshot);
        keys(descriptor, ["session_supported"]);
        if (descriptor.session_supported !== true) deny();
        keys(accountSnapshot, [
          "state",
          "account_display",
          "session_kind",
          "level2_access",
          "saved_login",
          "session_notice",
          "observed_at",
        ]);
        const saved = record(accountSnapshot.saved_login);
        keys(saved, ["available", "account_display", "session_kind", "level2_access"]);
        if (
          accountSnapshot.state !== session.state ||
          !text(accountSnapshot.observed_at, 64) ||
          !Number.isFinite(Date.parse(accountSnapshot.observed_at)) ||
          typeof saved.available !== "boolean"
        )
          deny();
        const age = this.utcNow() - Date.parse(accountSnapshot.observed_at);
        if (!Number.isFinite(age) || age < -1000 || age > 5000) deny();
        for (const fields of [accountSnapshot, saved]) {
          if (fields.account_display !== null && !text(fields.account_display)) deny();
          if (
            fields.session_kind !== null &&
            (typeof fields.session_kind !== "string" ||
              !["account", "guest"].includes(fields.session_kind))
          )
            deny();
          if (![true, false, null].includes(fields.level2_access as boolean | null)) deny();
        }
        if (
          accountSnapshot.session_notice !== null &&
          accountSnapshot.session_notice !== "level2_replaced_by_remote_login"
        )
          deny();
        const stable = { ...accountSnapshot };
        delete stable.observed_at;
        peers.push({ source: s, account: stable });
      }
      if (selected === undefined || a.lifetimes.length !== peers.length) deny();
      // Attest again after account reads so Source lifetime changes during sampling cannot pass.
      if (fingerprintJson(await attest()) !== fingerprintJson(a)) deny();
      peers.sort((x, y) => String(x.source.instanceId).localeCompare(String(y.source.instanceId)));
      return { selected, identity: fingerprintJson({ attestation: a, peers }) };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new CandidateDenied());
        }, 5000);
      });
      const work = async () => {
        const before = await snapshot();
        const result = await read(`/v2/instruments/search?query=${request.code}`, before.selected);
        const items = decodeItems(result, request.code);
        const after = await snapshot();
        if (after.identity !== before.identity || after.selected !== before.selected) deny();
        remaining();
        return { items };
      };
      return await Promise.race([work(), expired]);
    } catch {
      throw new CandidateDenied();
    } finally {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function decodeItems(v: Record<string, unknown>, code: string): InstrumentLookupResponse["items"] {
  keys(v, ["code", "message", "data"]);
  if (v.code !== 0 || !text(v.message)) deny();
  const d = record(v.data),
    coverage = record(d.coverage);
  keys(d, ["row_count", "data_state", "coverage", "items"]);
  keys(coverage, ["status", "returned_count"]);
  if (
    !Array.isArray(d.items) ||
    d.items.length > 16 ||
    d.row_count !== d.items.length ||
    coverage.returned_count !== d.items.length ||
    coverage.status !== "complete" ||
    (d.items.length > 0 ? d.data_state !== "present" : d.data_state !== "empty")
  )
    deny();
  return d.items
    .map((raw) => {
      const item = record(raw),
        security = record(item.security);
      keys(item, ["security", "name"]);
      keys(security, ["code", "market"]);
      if (
        !text(security.code, 16) ||
        !/^[A-Za-z0-9]{1,16}$/.test(security.code) ||
        typeof security.market !== "string" ||
        !["XSHG", "XSHE", "XBEI"].includes(security.market) ||
        !text(item.name)
      )
        deny();
      return {
        code: security.code,
        market: security.market,
        name: item.name,
        instrumentId: `${security.market}:${security.code}`,
      };
    })
    .filter((item) => item.code === code);
}
