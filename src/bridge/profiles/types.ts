/** MP-1 synthetic contracts only. These ports are never constructed by the live runtime. */
export type ProfileOperation = "qr.begin" | "qr.poll" | "session.status" | "lookup";
export type ProfileCode =
  | "PROFILE_DENIED"
  | "PROFILE_SELECTION_REQUIRED"
  | "INPUT_INVALID"
  | "CONFIG_INVALID"
  | "PROFILE_STALE"
  | "PROFILE_UNAVAILABLE"
  | "LOGIN_REQUIRED"
  | "IDENTITY_UNPROVEN"
  | "ENROLLMENT_REQUIRED"
  | "QR_FLOW_INVALID"
  | "QR_FLOW_REPLACED"
  | "QR_FLOW_EXPIRED"
  | "QR_FLOW_LIMIT"
  | "RESOURCE_LIMIT"
  | "TIMEOUT"
  | "UPSTREAM_INVALID";
export class ProfileError extends Error {
  constructor(readonly code: ProfileCode) {
    super(code);
    this.name = "ProfileError";
  }
}
export function deny(code: ProfileCode): never {
  throw new ProfileError(code);
}
export interface Scope {
  readonly context: "local" | "remote_human" | "remote_admin" | "remote_machine";
  readonly principal: string;
  readonly audience: string;
  readonly deployment: string;
  readonly policyRevision: number;
}
export interface AuthorityPort {
  /** Must recognize server-owned authority objects by identity, never by caller fields. */
  verify(authority: object): Scope | undefined;
  allows(scope: Scope, alias: string, operation: ProfileOperation): boolean;
}
export interface ClockPort {
  now(): number;
  /** Injected deterministic deadline race, also covering observations. No real timers here. */
  within<T>(work: Promise<T>, deadline: number): Promise<T>;
}
export interface ProcessEvidence {
  readonly pid: number;
  readonly created: string;
  readonly path: string;
  readonly artifact: string;
  readonly endpoint: "fixed-loopback";
  readonly contracts: Readonly<Record<ProfileOperation, string>>;
}
export interface SourceEvidence {
  readonly id: string;
  readonly number: number;
  readonly provider: "synthetic";
  readonly worker: {
    readonly pid: number;
    readonly created: string;
    readonly restarts: number;
    readonly ready: boolean;
  };
  readonly account: {
    /** Synthetic identity proof. A display string or its hash can NEVER fill this field. */
    readonly token: string | null;
    readonly display: string;
    readonly kind: string;
    readonly connected: boolean;
    readonly savedLogin: boolean;
    readonly l2: string;
    readonly epoch: string | null;
  };
}
export interface Observation {
  readonly process: ProcessEvidence;
  readonly sources: readonly SourceEvidence[];
}
export interface Registration {
  readonly alias: string;
  readonly revision: number;
  readonly enabled: boolean;
  readonly expectedAccount: string;
  readonly process: ProcessEvidence;
  readonly source: SourceEvidence;
}
export interface ProfileRequest {
  readonly alias?: string;
  readonly operation: ProfileOperation;
  readonly authority: object;
}
declare const leaseBrand: unique symbol;
export type ProfileLease = { readonly [leaseBrand]: true };
export interface SyntheticTarget {
  readonly lease: ProfileLease;
  readonly source: SourceEvidence;
}
export interface SyntheticPorts {
  observe(): Promise<unknown>;
  begin(target: SyntheticTarget): Promise<unknown>;
  poll(target: SyntheticTarget, flowId: number): Promise<unknown>;
  status(target: SyntheticTarget): Promise<unknown>;
  lookup(target: SyntheticTarget, code: string): Promise<unknown>;
}
export const OPERATIONS: readonly ProfileOperation[] = [
  "qr.begin",
  "qr.poll",
  "session.status",
  "lookup",
];
export const ALIAS = /^p_[a-f0-9]{32}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) deny("INPUT_INVALID");
  return value as Record<string, unknown>;
}
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const v = record(value);
  if (Object.keys(v).some((k) => !keys.includes(k))) deny("INPUT_INVALID");
  return v;
}
export function text(value: unknown, max = 128): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !/[\p{Cc}\p{Cf}]/u.test(value)
  );
}
export function integer(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}
export function frozen<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) frozen(child);
    Object.freeze(v);
  }
  return v;
}
/** Explicit projection prevents retaining caller-owned objects or unknown raw fields. */
export function processEvidence(input: unknown): ProcessEvidence {
  const v = exact(input, ["pid", "created", "path", "artifact", "endpoint", "contracts"]);
  const c = exact(v.contracts, OPERATIONS);
  if (
    !integer(v.pid, 1) ||
    !text(v.created) ||
    !text(v.path, 256) ||
    !text(v.artifact) ||
    v.endpoint !== "fixed-loopback" ||
    OPERATIONS.some((op) => !text(c[op]))
  )
    deny("INPUT_INVALID");
  return frozen({
    pid: v.pid,
    created: v.created,
    path: v.path,
    artifact: v.artifact,
    endpoint: v.endpoint,
    contracts: {
      "qr.begin": c["qr.begin"] as string,
      "qr.poll": c["qr.poll"] as string,
      "session.status": c["session.status"] as string,
      lookup: c.lookup as string,
    },
  });
}
export function sourceEvidence(input: unknown): SourceEvidence {
  const v = exact(input, ["id", "number", "provider", "worker", "account"]);
  const w = exact(v.worker, ["pid", "created", "restarts", "ready"]);
  const a = exact(v.account, [
    "token",
    "display",
    "kind",
    "connected",
    "savedLogin",
    "l2",
    "epoch",
  ]);
  if (
    !text(v.id) ||
    !integer(v.number, 1) ||
    v.provider !== "synthetic" ||
    !integer(w.pid, 1) ||
    !text(w.created) ||
    !integer(w.restarts) ||
    typeof w.ready !== "boolean" ||
    !(a.token === null || text(a.token)) ||
    !text(a.display) ||
    !text(a.kind) ||
    typeof a.connected !== "boolean" ||
    typeof a.savedLogin !== "boolean" ||
    !text(a.l2) ||
    !(a.epoch === null || text(a.epoch))
  )
    deny("INPUT_INVALID");
  return frozen({
    id: v.id,
    number: v.number,
    provider: v.provider,
    worker: { pid: w.pid, created: w.created, restarts: w.restarts, ready: w.ready },
    account: {
      token: a.token,
      display: a.display,
      kind: a.kind,
      connected: a.connected,
      savedLogin: a.savedLogin,
      l2: a.l2,
      epoch: a.epoch,
    },
  });
}
export function observation(input: unknown): Observation {
  const v = exact(input, ["process", "sources"]);
  if (!Array.isArray(v.sources) || v.sources.length > 16) deny("PROFILE_UNAVAILABLE");
  const sources = v.sources.map(sourceEvidence);
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    new Set(sources.map((s) => s.number)).size !== sources.length
  )
    deny("PROFILE_UNAVAILABLE");
  return frozen({ process: processEvidence(v.process), sources });
}
export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
