import { OfflineProfileRegistry } from "./registry.js";
import { OfflineProfileResolver } from "./resolver.js";
import { ProfileError, UUID, deny, exact, integer, text } from "./types.js";
import type {
  AuthorityPort,
  ClockPort,
  ProfileCode,
  ProfileLease,
  ProfileOperation,
  SyntheticPorts,
} from "./types.js";

export type Outcome =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly code: ProfileCode };
interface Flow {
  readonly id: string;
  readonly alias: string;
  readonly owner: string;
  readonly nativeId: number;
  readonly expires: number;
  readonly view: object;
}
interface Tombstone {
  readonly alias: string;
  readonly owner: string;
  readonly state: "QR_FLOW_REPLACED" | "QR_FLOW_EXPIRED" | "connected";
  readonly expires: number;
}
export interface PrototypeOptions {
  readonly registrations: unknown;
  readonly authority: AuthorityPort;
  readonly clock: ClockPort;
  /** Must be unique per simulated boot, like a random boot nonce in a future reviewed runtime. */
  readonly bootNonce: string;
  readonly uuid: () => string;
  readonly ports: SyntheticPorts;
}

/** Executable offline harness, deliberately not a production adapter or transport. */
export class OfflineProfilePrototype {
  readonly registry: OfflineProfileRegistry;
  readonly resolver: OfflineProfileResolver;
  #flows = new Map<string, Flow>();
  #terminal = new Map<string, Tombstone>();
  // Hard boot-lifetime allocation budget: tombstone eviction can never resurrect an old UUID.
  #issued = new Set<string>();
  #views = new WeakSet<object>();
  #cancelled = new WeakSet<object>();
  #qrBusy = false;
  #inflight = 0;
  #pending = new Set<object>();
  constructor(private readonly options: PrototypeOptions) {
    this.registry = new OfflineProfileRegistry(options.registrations);
    this.resolver = new OfflineProfileResolver(this.registry, {
      ...options,
      observe: () => this.#port(() => options.ports.observe()),
    });
    this.registry.onInvalidate((alias) => {
      for (const [id, flow] of this.#flows) if (flow.alias === alias) this.#flows.delete(id);
      for (const [id, terminal] of this.#terminal)
        if (terminal.alias === alias) this.#terminal.delete(id);
    });
  }
  createView(): object {
    const view = Object.freeze({});
    this.#views.add(view);
    return view;
  }
  cancel(view: object): void {
    if (!this.#views.has(view)) return;
    this.#cancelled.add(view);
    for (const [id, flow] of this.#flows)
      if (flow.view === view) this.#finish(id, "QR_FLOW_REPLACED");
  }
  #visible(view: object): void {
    if (!this.#views.has(view) || this.#cancelled.has(view)) deny("PROFILE_STALE");
  }
  #finish(id: string, state: Tombstone["state"]): void {
    const flow = this.#flows.get(id);
    if (!flow) return;
    this.#flows.delete(id);
    this.#terminal.set(id, {
      alias: flow.alias,
      owner: flow.owner,
      state,
      expires: this.resolver.now() + 30_000,
    });
    while (this.#terminal.size > 16) {
      const oldest = this.#terminal.keys().next().value;
      if (oldest !== undefined) this.#terminal.delete(oldest);
    }
  }
  #cleanup(): void {
    const now = this.resolver.now();
    for (const [id, flow] of this.#flows)
      if (flow.expires <= now) this.#finish(id, "QR_FLOW_EXPIRED");
    for (const [id, terminal] of this.#terminal)
      if (terminal.expires <= now) this.#terminal.delete(id);
  }
  #uuid(): string {
    if (this.#issued.size >= 256) deny("RESOURCE_LIMIT");
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.options.uuid();
      if (typeof candidate !== "string" || !UUID.test(candidate)) continue;
      // Namespace factory entropy by boot, retaining the UUID version/variant bits.
      // No signing/identity claim is derived from this identifier.
      const mixed = (
        BigInt(`0x${candidate.replaceAll("-", "")}`) ^ BigInt(`0x${this.options.bootNonce}`)
      )
        .toString(16)
        .padStart(32, "0");
      const id = `${mixed.slice(0, 8)}-${mixed.slice(8, 12)}-4${mixed.slice(13, 16)}-8${mixed.slice(17, 20)}-${mixed.slice(20)}`;
      if (!this.#issued.has(id)) {
        this.#issued.add(id);
        return id;
      }
    }
    deny("QR_FLOW_LIMIT");
  }
  stats(): Readonly<{
    active: number;
    tombstones: number;
    issued: number;
    inflight: number;
    pending: number;
  }> {
    this.#cleanup();
    return Object.freeze({
      active: this.#flows.size,
      tombstones: this.#terminal.size,
      issued: this.#issued.size,
      inflight: this.#inflight,
      pending: this.#pending.size,
    });
  }
  #response(input: unknown, keys: readonly string[]): Record<string, unknown> {
    try {
      return exact(input, keys);
    } catch {
      return deny("UPSTREAM_INVALID");
    }
  }
  #port(call: () => Promise<unknown>): Promise<unknown> {
    if (this.#pending.size >= 32) deny("RESOURCE_LIMIT");
    try {
      const work = call();
      const slot = {};
      this.#pending.add(slot);
      void work.then(
        () => this.#pending.delete(slot),
        () => this.#pending.delete(slot),
      );
      return work;
    } catch {
      return deny("PROFILE_UNAVAILABLE");
    }
  }
  async execute(input: unknown): Promise<Outcome> {
    let qrLock = false,
      counted = false;
    let lease: ProfileLease | undefined;
    let operation: ProfileOperation | undefined;
    let id: string | undefined;
    let pollStarted = false;
    let rawQr: Promise<unknown> | undefined;
    let rawQrSettled = false,
      qrReturned = false;
    const sendQr = (call: () => Promise<unknown>) => {
      rawQr = this.#port(call);
      const settled = () => {
        rawQrSettled = true;
        if (qrReturned) this.#qrBusy = false;
      };
      void rawQr.then(settled, settled);
      return rawQr;
    };
    try {
      const request = exact(input, [
        "alias",
        "operation",
        "authority",
        "code",
        "sessionId",
        "view",
      ]);
      if (
        !["qr.begin", "qr.poll", "session.status", "lookup"].includes(request.operation as string)
      )
        deny("INPUT_INVALID");
      operation = request.operation as ProfileOperation;
      if (
        (operation === "lookup" &&
          (typeof request.code !== "string" || !/^\d{6}$/.test(request.code))) ||
        (operation !== "lookup" && request.code !== undefined) ||
        (operation === "qr.poll" &&
          (typeof request.sessionId !== "string" || !UUID.test(request.sessionId))) ||
        (operation !== "qr.poll" && request.sessionId !== undefined)
      )
        deny("INPUT_INVALID");
      const view = request.view ?? this.createView();
      if (!view || typeof view !== "object") deny("INPUT_INVALID");
      this.#visible(view);
      if (this.#inflight >= 32) deny("RESOURCE_LIMIT");
      this.#inflight++;
      counted = true;
      // Resolve performs authority/grant/input checks before the first observation.
      lease = await this.resolver.resolve({
        ...(request.alias === undefined ? {} : { alias: request.alias as string }),
        operation,
        authority: request.authority as object,
      });
      const owner = this.resolver.owner(lease);
      const alias = (request.alias ?? this.registry.defaultAlias) as string;
      this.#cleanup();
      if (operation === "qr.begin" || operation === "qr.poll") {
        if (this.#qrBusy) deny("QR_FLOW_LIMIT");
        this.#qrBusy = true;
        qrLock = true;
      }
      if (operation === "qr.poll") {
        id = request.sessionId as string;
        const flow = this.#flows.get(id),
          terminal = this.#terminal.get(id);
        if (flow?.owner !== owner && terminal?.owner !== owner) deny("QR_FLOW_INVALID");
        if (terminal) {
          if (terminal.state !== "connected") deny(terminal.state);
          return this.resolver.commit(lease, () => {
            this.#visible(view);
            return { ok: true, value: { state: "connected" } };
          });
        }
        if (!flow) deny("QR_FLOW_INVALID");
      }
      await this.resolver.validate(lease);
      this.#visible(view);
      if (operation === "qr.begin") {
        // Refuse a foreign flow; do not silently replace another alias/owner.
        if ([...this.#flows.values()].some((flow) => flow.owner !== owner)) deny("QR_FLOW_LIMIT");
        id = this.#uuid();
        for (const oldId of this.#flows.keys()) this.#finish(oldId, "QR_FLOW_REPLACED");
      }
      // A native authentication attempt may affect peers, including when the POST fails.
      if (qrLock) this.resolver.fenceAuthentication(lease);
      const deadline = this.resolver.deadline(lease);
      const flow = id === undefined ? undefined : this.#flows.get(id);
      const result = await this.resolver.within(
        this.resolver.effect(lease, operation, (target) => {
          switch (operation) {
            case "qr.begin":
              return sendQr(() => this.options.ports.begin(target));
            case "qr.poll": {
              if (!flow || flow.expires <= this.resolver.now()) deny("QR_FLOW_EXPIRED");
              pollStarted = true;
              return sendQr(() => this.options.ports.poll(target, flow.nativeId));
            }
            case "session.status":
              return this.#port(() => this.options.ports.status(target));
            case "lookup":
              return this.#port(() => this.options.ports.lookup(target, request.code as string));
            default:
              return deny("INPUT_INVALID");
          }
        }),
        deadline,
      );
      await this.resolver.validate(lease);
      // No await between policy/generation/visibility/TTL validation and publication.
      return this.resolver.commit(lease, () => {
        this.#visible(view);
        this.#cleanup();
        if (operation === "qr.poll" && (!flow || this.#flows.get(flow.id) !== flow))
          deny("QR_FLOW_EXPIRED");
        let value: Readonly<Record<string, unknown>>;
        const v = this.#response(
          result,
          operation === "qr.begin"
            ? ["flowId", "qr"]
            : operation === "lookup"
              ? ["items"]
              : ["state"],
        );
        if (operation === "qr.begin") {
          if (!integer(v.flowId, 1) || !text(v.qr, 8_192) || id === undefined)
            deny("UPSTREAM_INVALID");
          this.#flows.set(id, {
            id,
            alias,
            owner,
            nativeId: v.flowId,
            expires: this.resolver.now() + 120_000,
            view,
          });
          value = Object.freeze({ sessionId: id, qr: v.qr });
        } else if (operation === "lookup") {
          if (!Array.isArray(v.items) || v.items.length > 16) deny("UPSTREAM_INVALID");
          const items = v.items.map((item) => {
            const row = this.#response(item, ["code", "name", "market"]);
            if (row.code !== request.code || !text(row.name, 128) || !text(row.market, 16))
              deny("UPSTREAM_INVALID");
            return Object.freeze({ code: row.code, name: row.name, market: row.market });
          });
          value = Object.freeze({ items: Object.freeze(items) });
        } else {
          if (
            !["connected", "waiting", "login_required"].includes(v.state as string) ||
            (operation === "session.status" && v.state === "waiting")
          )
            deny("UPSTREAM_INVALID");
          if (
            operation === "session.status" &&
            v.state !==
              this.resolver.effect(lease!, operation, (target) =>
                target.source.account.connected ? "connected" : "login_required",
              )
          )
            deny("UPSTREAM_INVALID");
          if (operation === "qr.poll" && v.state === "connected") {
            if (
              !this.resolver.effect(lease!, operation, (target) => target.source.account.connected)
            ) {
              this.registry.invalidate(alias);
              deny("ENROLLMENT_REQUIRED");
            }
            if (id !== undefined) this.#finish(id, "connected");
          }
          value = Object.freeze({ state: v.state });
        }
        return { ok: true, value };
      });
    } catch (error) {
      if (pollStarted && id) this.#finish(id, "QR_FLOW_REPLACED");
      // Raw port errors (including port-thrown ProfileErrors) never cross this boundary.
      return {
        ok: false,
        code: error instanceof ProfileError ? error.code : "PROFILE_UNAVAILABLE",
      };
    } finally {
      qrReturned = true;
      if (qrLock && (rawQr === undefined || rawQrSettled)) this.#qrBusy = false;
      if (counted) this.#inflight--;
    }
  }
}
