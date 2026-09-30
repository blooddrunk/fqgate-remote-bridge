import type { FqgateStatus } from "../fqgate/install/lifecycle.js";
import type { CloudflaredServiceStatus } from "../cloudflared/windows/service.js";

export type Component = "bridge" | "fqgate" | "session" | "tunnel";
export type NormalizedState =
  | "ready"
  | "unavailable"
  | "unhealthy"
  | "stopped"
  | "incompatible"
  | "unknown"
  | "connected"
  | "guest"
  | "login_required"
  | "running"
  | "missing";

export interface SupervisorSnapshot {
  readonly schemaVersion: 1;
  readonly bridge: "ready" | "unavailable";
  readonly fqgate: "ready" | "unhealthy" | "stopped" | "incompatible" | "unknown";
  readonly session: "connected" | "guest" | "login_required" | "unknown";
  readonly tunnel: "running" | "stopped" | "missing" | "unknown";
}

export interface ObservationAdapters {
  readonly bridge: () => Promise<boolean>;
  readonly fqgate: () => Promise<FqgateStatus>;
  readonly tunnel: () => Promise<CloudflaredServiceStatus>;
}

export interface ProbeResult {
  readonly snapshot: SupervisorSnapshot;
  readonly failed: readonly Component[];
}

export async function observe(adapters: ObservationAdapters): Promise<ProbeResult> {
  const [bridge, fqgate, tunnel] = await Promise.allSettled([
    adapters.bridge(),
    adapters.fqgate(),
    adapters.tunnel(),
  ]);
  const failed: Component[] = [];
  if (bridge.status === "rejected") failed.push("bridge");
  if (fqgate.status === "rejected") failed.push("fqgate", "session");
  if (tunnel.status === "rejected") failed.push("tunnel");
  return {
    snapshot: normalizeSnapshot({
      bridge: bridge.status === "fulfilled" && bridge.value,
      ...(fqgate.status === "fulfilled" ? { fqgate: fqgate.value } : {}),
      ...(tunnel.status === "fulfilled" ? { tunnel: tunnel.value } : {}),
    }),
    failed,
  };
}

export function normalizeSnapshot(input: {
  readonly bridge: boolean;
  readonly fqgate?: FqgateStatus;
  readonly tunnel?: CloudflaredServiceStatus;
}): SupervisorSnapshot {
  const lifecycle = input.fqgate?.lifecycle;
  const fqgate: SupervisorSnapshot["fqgate"] =
    lifecycle === "ready"
      ? "ready"
      : lifecycle === "incompatible"
        ? "incompatible"
        : lifecycle === "stopped" || lifecycle === "not_installed"
          ? "stopped"
          : lifecycle === "unhealthy" || lifecycle === "starting"
            ? "unhealthy"
            : "unknown";
  const session = input.fqgate?.health.session;
  return {
    schemaVersion: 1,
    bridge: input.bridge ? "ready" : "unavailable",
    fqgate,
    session:
      session === "connected" || session === "guest" || session === "login_required"
        ? session
        : "unknown",
    tunnel:
      input.tunnel === undefined
        ? "unknown"
        : !input.tunnel.installed
          ? "missing"
          : input.tunnel.running
            ? "running"
            : "stopped",
  };
}

export const COMPONENTS = ["bridge", "fqgate", "session", "tunnel"] as const;

export type EventReason = "initial" | "state_changed" | "probe_failed" | "probe_recovered";
export interface Transition {
  readonly component: Component;
  readonly previous?: NormalizedState;
  readonly current: NormalizedState;
  readonly reason: EventReason;
}

export function transitions(previous: ProbeResult | undefined, current: ProbeResult): Transition[] {
  return COMPONENTS.flatMap((component) => {
    const before = previous?.snapshot[component];
    const after = current.snapshot[component];
    const wasFailed = previous?.failed.includes(component) ?? false;
    const isFailed = current.failed.includes(component);
    if (before === after && wasFailed === isFailed) return [];
    return [
      {
        component,
        ...(before === undefined ? {} : { previous: before }),
        current: after,
        reason:
          before === undefined
            ? "initial"
            : isFailed && !wasFailed
              ? "probe_failed"
              : !isFailed && wasFailed
                ? "probe_recovered"
                : "state_changed",
      },
    ];
  });
}
