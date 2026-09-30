import type { Component, ProbeResult, SupervisorSnapshot } from "./model.js";

export const RECOVERY_COMPONENTS = ["bridge", "fqgate", "tunnel"] as const;
export type RecoveryComponent = (typeof RECOVERY_COMPONENTS)[number];
export type RecoveryAction = "bridge.restart" | "fqgate.restart" | "tunnel.restart";
export type RecoveryDecisionKind =
  "no_action" | "eligible" | "suppressed" | "exhausted" | "forbidden";
export type RecoveryReason =
  | "healthy"
  | "threshold"
  | "cooldown"
  | "attempt_limit"
  | "eligible"
  | "login_required"
  | "incompatible"
  | "missing_tunnel"
  | "unknown_state"
  | "probe_failed"
  | "identity_unknown"
  | "transaction_unresolved"
  | "history_invalid";

export interface RecoveryConfig {
  readonly schemaVersion: 1;
  readonly consecutiveFailures: number;
  readonly cooldownMs: number;
  readonly maxAttempts: number;
  readonly stableResetMs: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  schemaVersion: 1,
  consecutiveFailures: 3,
  cooldownMs: 300_000,
  maxAttempts: 2,
  stableResetMs: 600_000,
};

export function validateRecoveryConfig(value: RecoveryConfig): RecoveryConfig {
  const bounds = {
    consecutiveFailures: [2, 10],
    cooldownMs: [60_000, 3_600_000],
    maxAttempts: [1, 5],
    stableResetMs: [60_000, 86_400_000],
  } as const;
  if (
    value.schemaVersion !== 1 ||
    Object.keys(value).sort().join() !== ["schemaVersion", ...Object.keys(bounds)].sort().join()
  )
    throw new Error("Invalid recovery config");
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const number = value[key as keyof typeof bounds];
    if (!Number.isSafeInteger(number) || number < min || number > max)
      throw new Error("Invalid recovery config");
  }
  if (value.stableResetMs < value.cooldownMs) throw new Error("Invalid recovery config");
  return value;
}

export interface RecoveryHistoryEntry {
  readonly consecutive: number;
  readonly attempts: number;
  readonly lastAttemptAt: number | null;
  readonly stableSince: number | null;
  readonly lastState: string;
}
export type RecoveryHistory = Record<RecoveryComponent, RecoveryHistoryEntry>;
export interface RecoveryDecision {
  readonly schemaVersion: 1;
  readonly component: RecoveryComponent;
  readonly observedState: string;
  readonly decision: RecoveryDecisionKind;
  readonly action?: RecoveryAction;
  readonly reason: RecoveryReason;
  readonly notBefore?: string;
  readonly attemptsInWindow: number;
}

export interface RecoverySafety {
  readonly bridgeIdentity: "verified" | "unknown";
  readonly fqgateIdentity: "verified" | "unknown";
  readonly fqgateQualified: boolean;
  readonly fqgateTransaction: "clear" | "unresolved" | "unknown";
  readonly tunnelIdentity: "verified" | "unknown";
}

const healthy = { bridge: "ready", fqgate: "ready", tunnel: "running" } as const;
const candidate = { bridge: "unavailable", fqgate: "stopped", tunnel: "stopped" } as const;
const actions = {
  bridge: "bridge.restart",
  fqgate: "fqgate.restart",
  tunnel: "tunnel.restart",
} as const;
const states: Record<RecoveryComponent, readonly string[]> = {
  bridge: ["ready", "unavailable"],
  fqgate: ["ready", "unhealthy", "stopped", "incompatible", "unknown"],
  tunnel: ["running", "stopped", "missing", "unknown"],
};

export function emptyRecoveryHistory(snapshot: SupervisorSnapshot): RecoveryHistory {
  return Object.fromEntries(
    RECOVERY_COMPONENTS.map((component) => [
      component,
      {
        consecutive: 0,
        attempts: 0,
        lastAttemptAt: null,
        stableSince: null,
        lastState: snapshot[component],
      },
    ]),
  ) as RecoveryHistory;
}

export function validateRecoveryHistory(value: unknown): RecoveryHistory {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...RECOVERY_COMPONENTS].sort().join()
  )
    throw new Error("Invalid recovery history");
  const result = value as RecoveryHistory;
  for (const component of RECOVERY_COMPONENTS) {
    const entry = result[component];
    if (
      typeof entry !== "object" ||
      entry === null ||
      Object.keys(entry).sort().join() !==
        ["consecutive", "attempts", "lastAttemptAt", "stableSince", "lastState"].sort().join() ||
      !Number.isSafeInteger(entry.consecutive) ||
      entry.consecutive < 0 ||
      entry.consecutive > 1_000 ||
      !Number.isSafeInteger(entry.attempts) ||
      entry.attempts < 0 ||
      entry.attempts > 5 ||
      !states[component].includes(entry.lastState) ||
      !validTime(entry.lastAttemptAt) ||
      !validTime(entry.stableSince)
    )
      throw new Error("Invalid recovery history");
  }
  return result;
}

function validTime(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15);
}

export function evaluateRecovery(input: {
  readonly observation: ProbeResult;
  readonly safety: RecoverySafety;
  readonly history: RecoveryHistory;
  readonly config: RecoveryConfig;
  readonly now: number;
}): { decisions: readonly RecoveryDecision[]; history: RecoveryHistory } {
  const { observation, safety, config, now } = input;
  validateRecoveryConfig(config);
  validateRecoveryHistory(input.history);
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    now > 8.64e15 ||
    observation.snapshot.schemaVersion !== 1
  )
    throw new Error("Invalid recovery observation");
  if (
    RECOVERY_COMPONENTS.some((component) => {
      const entry = input.history[component];
      return (
        (entry.lastAttemptAt !== null && entry.lastAttemptAt > now) ||
        (entry.stableSince !== null && entry.stableSince > now)
      );
    })
  )
    throw new Error("Invalid recovery history");
  const updated = {} as RecoveryHistory;
  const globallyStable =
    observation.snapshot.bridge === "ready" &&
    observation.snapshot.fqgate === "ready" &&
    observation.snapshot.tunnel === "running" &&
    (observation.snapshot.session === "connected" || observation.snapshot.session === "guest") &&
    observation.failed.length === 0 &&
    safety.fqgateTransaction === "clear";
  const globalBlock =
    observation.snapshot.session === "login_required" ||
    observation.snapshot.session === "unknown" ||
    observation.snapshot.fqgate === "incompatible" ||
    observation.snapshot.fqgate === "unknown" ||
    observation.snapshot.tunnel === "missing" ||
    observation.snapshot.tunnel === "unknown" ||
    observation.failed.length > 0 ||
    safety.fqgateTransaction !== "clear";
  const decisions = RECOVERY_COMPONENTS.map((component): RecoveryDecision => {
    const state = observation.snapshot[component];
    const before = input.history[component];
    if (!states[component].includes(state)) throw new Error("Invalid recovery observation");
    const identityVerified =
      component === "bridge"
        ? safety.bridgeIdentity === "verified"
        : component === "fqgate"
          ? safety.fqgateIdentity === "verified"
          : safety.tunnelIdentity === "verified";
    const countable =
      !globalBlock &&
      identityVerified &&
      (component !== "fqgate" || safety.fqgateQualified) &&
      (state === candidate[component] || (component === "fqgate" && state === "unhealthy"));
    let consecutive = countable
      ? before.lastState === state
        ? Math.min(1_000, before.consecutive + 1)
        : 1
      : 0;
    let attempts = before.attempts;
    let lastAttemptAt = before.lastAttemptAt;
    let stableSince = before.stableSince;
    if (state === healthy[component] && !observation.failed.includes(component)) {
      consecutive = 0;
      stableSince = globallyStable
        ? before.lastState === state && before.stableSince !== null
          ? before.stableSince
          : now
        : null;
      if (stableSince !== null && now - stableSince >= config.stableResetMs) {
        attempts = 0;
        lastAttemptAt = null;
      }
    } else stableSince = null;
    updated[component] = { consecutive, attempts, lastAttemptAt, stableSince, lastState: state };
    const decision = (
      kind: RecoveryDecisionKind,
      reason: RecoveryReason,
      notBefore?: string,
    ): RecoveryDecision => ({
      schemaVersion: 1,
      component,
      observedState: state,
      decision: kind,
      ...(kind === "eligible" || kind === "suppressed" || kind === "exhausted"
        ? { action: actions[component] }
        : {}),
      reason,
      ...(notBefore === undefined ? {} : { notBefore }),
      attemptsInWindow: attempts,
    });
    if (observation.snapshot.session === "login_required")
      return decision("forbidden", "login_required");
    if (observation.snapshot.fqgate === "incompatible")
      return decision("forbidden", "incompatible");
    if (observation.snapshot.tunnel === "missing") return decision("forbidden", "missing_tunnel");
    if (observation.failed.length > 0) return decision("forbidden", "probe_failed");
    if (
      observation.snapshot.session === "unknown" ||
      observation.snapshot.fqgate === "unknown" ||
      observation.snapshot.tunnel === "unknown"
    )
      return decision("forbidden", "unknown_state");
    if (safety.fqgateTransaction !== "clear")
      return decision("forbidden", "transaction_unresolved");
    if (state === healthy[component]) return decision("no_action", "healthy");
    if (component === "fqgate" && !safety.fqgateQualified)
      return decision("forbidden", "incompatible");
    if (
      (component === "bridge" && safety.bridgeIdentity !== "verified") ||
      (component === "fqgate" && safety.fqgateIdentity !== "verified") ||
      (component === "tunnel" && safety.tunnelIdentity !== "verified")
    )
      return decision("forbidden", "identity_unknown");
    if (state !== candidate[component] && !(component === "fqgate" && state === "unhealthy"))
      return decision("forbidden", "unknown_state");
    if (attempts >= config.maxAttempts) return decision("exhausted", "attempt_limit");
    if (lastAttemptAt !== null) {
      if (lastAttemptAt > now) return decision("forbidden", "history_invalid");
      if (now - lastAttemptAt < config.cooldownMs)
        return decision(
          "suppressed",
          "cooldown",
          new Date(lastAttemptAt + config.cooldownMs).toISOString(),
        );
    }
    if (consecutive < config.consecutiveFailures) return decision("suppressed", "threshold");
    return decision("eligible", "eligible");
  });
  return { decisions, history: updated };
}

export function forbiddenHistory(snapshot: SupervisorSnapshot): readonly RecoveryDecision[] {
  return RECOVERY_COMPONENTS.map((component) => ({
    schemaVersion: 1,
    component,
    observedState: snapshot[component],
    decision: "forbidden",
    reason: "history_invalid",
    attemptsInWindow: 0,
  }));
}

export function validateProbeResult(value: ProbeResult): void {
  const allowed: readonly Component[] = ["bridge", "fqgate", "session", "tunnel"];
  if (value.failed.some((item) => !allowed.includes(item)))
    throw new Error("Invalid recovery observation");
}
