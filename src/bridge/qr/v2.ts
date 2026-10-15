import { Buffer } from "node:buffer";
import { BridgeError, ERROR_CODES, type BridgeErrorCode } from "../../shared/errors.js";
import type { SessionState } from "../../fqgate/health/types.js";
import { fingerprintJson } from "../../fqgate/openapi/catalog.js";
import { operationContractFingerprint } from "../../fqgate/market/contract.js";
import { QR_CENSUS_CONTRACTS, V2_QR_FINGERPRINT } from "../../fqgate/diagnostics/qr-contract.js";
export { V2_QR_FINGERPRINT } from "../../fqgate/diagnostics/qr-contract.js";
import type { HttpTransport } from "../../fqgate/release/http.js";
import {
  decodeBeginData,
  decodePollData,
  QR_FLOW_TTL_MS,
  QR_MAX_RESPONSE_BYTES,
  type QrAdapterPort,
  type QrBeginUpstreamResult,
  type QrPollUpstreamResult,
} from "./adapter.js";

export interface QrV2Observation {
  readonly process: string;
  readonly source: {
    readonly id: string;
    readonly worker: string;
    readonly account: string;
    readonly accountIdentity: string;
    readonly peers: string;
    readonly connected: boolean;
    readonly session: SessionState;
  };
}
interface Binding {
  readonly observation: QrV2Observation;
  readonly expires: number;
}
function fail(code: BridgeErrorCode = ERROR_CODES.UPSTREAM_RESPONSE_INVALID): never {
  throw new BridgeError(
    code,
    "Exact FQGate 2.0.5 QR prerequisites or response could not be verified",
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function integer(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
function text(v: unknown, max = 128): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v);
}
const states = new Set(["connected", "disconnected", "unknown", "not_applicable"]);
const modes = new Set(["guest", "local_client", "app_qr", "sms_code", "username_password"]);

/** Exact installed artifact plus observed embedded client, never a generic authentication proxy. */
export class FqgateV2QrAdapter implements QrAdapterPort {
  private binding: { readonly flowId: number; readonly value: Binding } | undefined;
  private busy = false;
  private readonly now: () => number;
  constructor(
    private readonly options: {
      readonly http: HttpTransport;
      readonly identity: () => Promise<string>;
      readonly instanceNumber?: number;
      readonly nowMs?: () => number;
    },
  ) {
    this.now = options.nowMs ?? Date.now;
    if (
      options.instanceNumber !== undefined &&
      (!integer(options.instanceNumber) || options.instanceNumber > 65535)
    )
      fail(ERROR_CODES.CONFIG_INVALID);
  }
  /** Read-only private readiness observation; never serialize source/account bindings. */
  async inspect(): Promise<QrV2Observation> {
    const process = await this.options.identity();
    if (!/^[a-f0-9]{64}$/.test(process)) fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
    const read = this.reader();
    const source = await this.snapshot(read);
    if (process !== (await this.options.identity())) fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
    return { process, source };
  }
  async begin(): Promise<QrBeginUpstreamResult> {
    return this.exclusive(async () => {
      // A failed replacement never resurrects the previous private flow.
      this.binding = undefined;
      const process = await this.options.identity(),
        read = this.reader();
      if (!/^[a-f0-9]{64}$/.test(process)) fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
      const source = await this.snapshot(read);
      const data = await read(
        `/v2/source-instances/${encodeURIComponent(source.id)}/authentication`,
        { action: "app_qr_begin" },
      );
      if (data.connected !== undefined && data.connected !== false) fail();
      const result = decodeBeginData(data);
      // v1 intentionally keeps its legacy decoder. v2 requires canonical base64 bytes.
      if (Buffer.from(result.imageBase64, "base64").toString("base64") !== result.imageBase64)
        fail();
      const after = await this.snapshot(read);
      if (
        after.worker !== source.worker ||
        after.account !== source.account ||
        after.peers !== source.peers
      )
        fail(ERROR_CODES.QR_FLOW_REPLACED);
      if (process !== (await this.options.identity())) fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
      this.binding = {
        flowId: result.flowId,
        value: { observation: { process, source }, expires: this.now() + QR_FLOW_TTL_MS },
      };
      return result;
    });
  }
  async poll(flowId: number): Promise<QrPollUpstreamResult> {
    return this.exclusive(async () => {
      const binding = this.binding;
      if (!integer(flowId) || flowId === 0) fail(ERROR_CODES.QR_FLOW_INVALID);
      if (!binding || binding.flowId !== flowId) fail(ERROR_CODES.QR_FLOW_REPLACED);
      if (binding.value.expires <= this.now()) {
        this.binding = undefined;
        fail(ERROR_CODES.QR_FLOW_EXPIRED);
      }
      try {
        const { process, source } = binding.value.observation;
        if (process !== (await this.options.identity()))
          fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
        const read = this.reader(),
          before = await this.snapshot(read);
        if (
          before.worker !== source.worker ||
          before.account !== source.account ||
          before.peers !== source.peers
        )
          fail(ERROR_CODES.QR_FLOW_REPLACED);
        const data = await read(
          `/v2/source-instances/${encodeURIComponent(source.id)}/authentication`,
          { action: "app_qr_poll", flow_id: flowId },
        );
        if (data.flow_id !== undefined && data.flow_id !== flowId)
          fail(ERROR_CODES.QR_FLOW_REPLACED);
        if (data.connected !== undefined && typeof data.connected !== "boolean") fail();
        if (
          data.status !== undefined &&
          data.status !== "waiting_for_scan" &&
          data.status !== "waiting_for_confirmation"
        )
          fail();
        if (data.login_method !== undefined && !text(data.login_method, 64)) fail();
        if (data.connected === true && data.status !== undefined) fail();
        const result = decodePollData(data),
          after = await this.snapshot(read);
        if (
          after.worker !== source.worker ||
          after.peers !== source.peers ||
          (result.connected &&
            source.connected &&
            after.accountIdentity !== source.accountIdentity) ||
          (!result.connected && after.account !== source.account)
        )
          fail(ERROR_CODES.QR_FLOW_REPLACED);
        if (result.connected && (!after.connected || after.session !== "connected")) fail();
        if (this.now() >= binding.value.expires) fail(ERROR_CODES.QR_FLOW_EXPIRED);
        if (process !== (await this.options.identity()))
          fail(ERROR_CODES.PROCESS_IDENTITY_MISMATCH);
        if (result.connected) this.binding = undefined;
        // Native login_method is private. UI receives only Bridge-owned completion state.
        return { status: result.status, connected: result.connected };
      } catch (error) {
        this.binding = undefined;
        throw error;
      }
    });
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy) fail(ERROR_CODES.QR_FLOW_LIMIT);
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }
  private reader() {
    const deadline = this.now() + 5000;
    return async (
      path: string,
      command?: { readonly action: "app_qr_begin" | "app_qr_poll"; readonly flow_id?: number },
    ) => {
      const remaining = deadline - this.now(),
        maxBytes =
          path === "/openapi.json" ? 4 * 1024 * 1024 : command ? QR_MAX_RESPONSE_BYTES : 65536;
      if (remaining <= 0) fail(ERROR_CODES.UPSTREAM_UNAVAILABLE);
      let response;
      try {
        response = await this.options.http.request(`http://127.0.0.1:17281${path}`, {
          method: command ? "POST" : "GET",
          redirect: "error",
          timeoutMs: remaining,
          maxBytes,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "X-Request-Timeout-Ms": String(remaining),
          },
          ...(command === undefined ? {} : { body: JSON.stringify(command) }),
        });
      } catch {
        fail(ERROR_CODES.UPSTREAM_UNAVAILABLE);
      }
      if (response.body.byteLength > maxBytes || this.now() >= deadline)
        fail(ERROR_CODES.UPSTREAM_RESPONSE_INVALID);
      let value;
      try {
        value = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)));
      } catch {
        fail();
      }
      if (command) {
        if (value.code !== 0 || response.status !== 200 || value.ok === false) {
          // Embedded 2.0.5 UI establishes the terminal-code SET, not individual code semantics.
          // Distinguish only exact terminal messages also present in the pinned native image.
          if (command.action === "app_qr_poll" && [1003, 3014].includes(value.code as number)) {
            if (value.message === "交互登录流程已过期，请重新开始")
              fail(ERROR_CODES.QR_FLOW_EXPIRED);
            if (
              value.message === "flow_id 无效或已被替换" ||
              value.message === "没有待处理的交互登录流程"
            )
              fail(ERROR_CODES.QR_FLOW_REPLACED);
          }
          fail(ERROR_CODES.UPSTREAM_UNAVAILABLE);
        }
        if (typeof value.message !== "string" || value.message.length > 256) fail();
        return object(value.data);
      }
      if (
        response.status !== 200 ||
        value.ok === false ||
        (value.code !== undefined && value.code !== 0)
      )
        fail(ERROR_CODES.UPSTREAM_UNAVAILABLE);
      return value;
    };
  }
  private async snapshot(read: ReturnType<FqgateV2QrAdapter["reader"]>) {
    const version = await read("/v2/system/version"),
      health = await read("/v2/system/health");
    if (
      version.version !== "2.0.5" ||
      version.product !== "FQGate" ||
      version.api_version !== "2.0" ||
      version.platform !== "windows" ||
      version.architecture !== "x86_64"
    )
      fail(ERROR_CODES.FQGATE_INCOMPATIBLE);
    if (health.status !== "ready") fail(ERROR_CODES.FQGATE_UNHEALTHY);
    const doc = await read("/openapi.json");
    if (operationContractFingerprint(doc, QR_CENSUS_CONTRACTS) !== V2_QR_FINGERPRINT)
      fail(ERROR_CODES.OPENAPI_CONTRACT_MISSING);
    const inventory = await read("/v2/source-instances");
    if (!Array.isArray(inventory.instances) || inventory.instances.length > 16) fail();
    const ids = new Set<string>(),
      numbers = new Set<number>();
    const sources = inventory.instances.map((v: unknown) => {
      const s = object(v),
        session = object(s.session);
      if (
        !text(s.instanceId) ||
        !/^[A-Za-z0-9_+=.-]{1,128}$/.test(s.instanceId) ||
        [".", ".."].includes(s.instanceId) ||
        ids.has(s.instanceId) ||
        !text(s.providerId) ||
        !text(s.workerState, 32) ||
        typeof s.autoLogin !== "boolean" ||
        typeof s.defaultGuest !== "boolean" ||
        !integer(s.instanceNo) ||
        !integer(s.pid) ||
        s.pid === 0 ||
        !integer(s.restartCount) ||
        typeof session.state !== "string" ||
        !states.has(session.state)
      )
        fail();
      ids.add(s.instanceId);
      if (s.providerId === "tonghuashun") {
        if (numbers.has(s.instanceNo)) fail();
        numbers.add(s.instanceNo);
      }
      return s;
    });
    const candidates = [];
    for (const s of sources.filter(
      (s) => s.providerId === "tonghuashun" && s.workerState === "ready",
    )) {
      const path = `/v2/source-instances/${encodeURIComponent(s.instanceId as string)}`;
      const auth = await read(`${path}/authentication`),
        account = await read(`${path}/account`);
      if (
        !Array.isArray(auth.modes) ||
        auth.modes.length > 5 ||
        new Set(auth.modes).size !== auth.modes.length ||
        auth.modes.some((v) => typeof v !== "string" || !modes.has(v))
      )
        fail();
      const descriptor = object(account.descriptor),
        snapshot = object(account.snapshot),
        saved = object(snapshot.saved_login);
      const allowed = (value: Record<string, unknown>, keys: readonly string[]) =>
        Object.keys(value).every((key) => keys.includes(key));
      if (
        !allowed(descriptor, ["session_supported", "saved_login_supported", "actions"]) ||
        !allowed(snapshot, [
          "state",
          "account_display",
          "session_kind",
          "level2_access",
          "saved_login",
          "observed_at",
          "session_notice",
        ]) ||
        !allowed(saved, ["available", "account_display", "session_kind", "level2_access"]) ||
        typeof descriptor.saved_login_supported !== "boolean" ||
        !Array.isArray(descriptor.actions) ||
        descriptor.actions.length > 3 ||
        new Set(descriptor.actions).size !== descriptor.actions.length ||
        descriptor.actions.some(
          (action) =>
            typeof action !== "string" ||
            !["logout", "restore_saved_login", "clear_saved_login"].includes(action),
        ) ||
        typeof snapshot.observed_at !== "string" ||
        snapshot.observed_at.length > 64 ||
        !Number.isFinite(Date.parse(snapshot.observed_at)) ||
        (snapshot.session_notice !== undefined &&
          snapshot.session_notice !== null &&
          snapshot.session_notice !== "level2_replaced_by_remote_login")
      )
        fail();
      if (
        typeof descriptor.session_supported !== "boolean" ||
        typeof snapshot.state !== "string" ||
        !states.has(snapshot.state) ||
        snapshot.state !== object(s.session).state ||
        typeof saved.available !== "boolean"
      )
        fail();
      if (!auth.modes.includes("app_qr") || descriptor.session_supported !== true) continue;
      for (const v of [snapshot.account_display, saved.account_display])
        if (v !== undefined && v !== null && !text(v)) fail();
      for (const v of [snapshot.session_kind, saved.session_kind])
        if (v !== undefined && v !== null && v !== "user" && v !== "guest") fail();
      for (const v of [snapshot.level2_access, saved.level2_access])
        if (v !== undefined && v !== null && typeof v !== "boolean") fail();
      const stable = { ...snapshot };
      delete stable.observed_at;
      candidates.push({
        number: s.instanceNo as number,
        id: s.instanceId as string,
        worker: fingerprintJson({
          id: s.instanceId,
          number: s.instanceNo,
          provider: s.providerId,
          pid: s.pid,
          restarts: s.restartCount,
          autoLogin: s.autoLogin,
          defaultGuest: s.defaultGuest,
          modes: auth.modes,
          descriptor,
        }),
        account: fingerprintJson(stable),
        accountIdentity: fingerprintJson({
          account: snapshot.account_display ?? null,
          kind: snapshot.session_kind ?? null,
        }),
        connected: snapshot.state === "connected",
        session: (snapshot.state === "connected"
          ? snapshot.session_kind === "guest"
            ? "guest"
            : "connected"
          : snapshot.state === "disconnected"
            ? "login_required"
            : "unknown") as SessionState,
      });
    }
    const selected =
      this.options.instanceNumber === undefined
        ? candidates
        : candidates.filter((s) => s.number === this.options.instanceNumber);
    if (selected.length !== 1) fail(ERROR_CODES.FQGATE_INCOMPATIBLE);
    const connected = sources.filter((s) => object(s.session).state === "connected").length;
    // Do not create a second connected source and disable the closed lookup slice.
    if (connected > 1 || (!selected[0]!.connected && connected > 0))
      fail(ERROR_CODES.FQGATE_INCOMPATIBLE);
    const target = selected[0]!;
    const peers = fingerprintJson({
      sources: sources
        .filter((s) => s.instanceId !== target.id)
        .map((s) => ({
          id: s.instanceId,
          number: s.instanceNo,
          provider: s.providerId,
          pid: s.pid,
          restarts: s.restartCount,
          workerState: s.workerState,
          state: object(s.session).state,
          autoLogin: s.autoLogin,
          defaultGuest: s.defaultGuest,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      accounts: candidates
        .filter((s) => s.id !== target.id)
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    return { ...target, peers };
  }
}
