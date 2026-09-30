import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RECOVERY_CONFIG,
  RECOVERY_ACTIONS,
  emptyRecoveryHistory,
  evaluateRecovery,
  forbiddenHistory,
  validateRecoveryConfig,
  validateRecoveryHistory,
} from "../src/supervisor/recovery.js";
import type { RecoveryHistory, RecoverySafety } from "../src/supervisor/recovery.js";
import {
  MAX_RECOVERY_FILE_BYTES,
  RecoveryStore,
  validateRecoveryFile,
} from "../src/supervisor/recovery-store.js";
import type { ProbeResult, SupervisorSnapshot } from "../src/supervisor/model.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const base: SupervisorSnapshot = {
  schemaVersion: 1,
  bridge: "ready",
  fqgate: "ready",
  session: "connected",
  tunnel: "running",
};
const safe: RecoverySafety = {
  bridgeIdentity: "verified",
  fqgateIdentity: "verified",
  fqgateQualified: true,
  fqgateTransaction: "clear",
  tunnelIdentity: "verified",
};
const at = Date.parse("2026-09-30T00:00:00.000Z");
function run(
  snapshot: SupervisorSnapshot = base,
  history: RecoveryHistory = emptyRecoveryHistory(snapshot),
  safety: RecoverySafety = safe,
  failed: ProbeResult["failed"] = [],
  now = at,
) {
  return evaluateRecovery({
    observation: { snapshot, failed },
    history,
    safety,
    config: DEFAULT_RECOVERY_CONFIG,
    now,
  });
}
function withState(patch: Partial<SupervisorSnapshot>): SupervisorSnapshot {
  return { ...base, ...patch };
}
async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fqgate-recovery-"));
  roots.push(root);
  return root;
}

describe("Phase 7-B1 decision layer", () => {
  it("returns only no_action for a healthy normalized observation", () => {
    const result = run();
    expect(result.decisions.map((item) => [item.decision, item.reason])).toEqual([
      ["no_action", "healthy"],
      ["no_action", "healthy"],
      ["no_action", "healthy"],
    ]);
    expect(JSON.stringify(result)).not.toMatch(/127\.0\.0\.1|pid|path|token/);
  });

  it.each([
    ["bridge", "unavailable", "bridge.restart"],
    ["fqgate", "stopped", "fqgate.restart"],
    ["fqgate", "unhealthy", "fqgate.restart"],
    ["tunnel", "stopped", "tunnel.restart"],
  ] as const)("requires consecutive failures before %s %s", (component, state, action) => {
    const snapshot = withState({ [component]: state });
    let history = emptyRecoveryHistory(snapshot);
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const result = run(snapshot, history);
      const decision = result.decisions.find((item) => item.component === component);
      expect(decision?.decision).toBe(cycle < 3 ? "suppressed" : "eligible");
      expect(decision?.action).toBe(action);
      expect(() =>
        validateRecoveryFile({
          schemaVersion: 1,
          history: result.history,
          decisions: result.decisions,
        }),
      ).not.toThrow();
      history = result.history;
    }
    expect(
      run(snapshot, history).decisions.find((item) => item.component === component)?.decision,
    ).toBe("eligible");
  });

  it("enforces cooldown, attempt ceiling and stable reset with a fake clock", () => {
    const snapshot = withState({ bridge: "unavailable" });
    const history = emptyRecoveryHistory(snapshot);
    const bridge = { ...history.bridge, consecutive: 3, attempts: 1, lastAttemptAt: at };
    const cooling = run(snapshot, { ...history, bridge }, safe, [], at + 1);
    expect(cooling.decisions[0]).toMatchObject({
      decision: "suppressed",
      reason: "cooldown",
      notBefore: new Date(at + 300_000).toISOString(),
    });
    expect(
      run(snapshot, { ...history, bridge }, safe, [], at + 300_000).decisions[0]?.decision,
    ).toBe("eligible");
    const exhausted = run(
      snapshot,
      { ...history, bridge: { ...bridge, attempts: 2 } },
      safe,
      [],
      at + 300_000,
    );
    expect(exhausted.decisions[0]).toMatchObject({
      decision: "exhausted",
      reason: "attempt_limit",
    });
    const firstHealthy = run(base, exhausted.history, safe, [], at + 300_000);
    expect(firstHealthy.history.bridge.attempts).toBe(2);
    const reset = run(base, firstHealthy.history, safe, [], at + 900_000);
    expect(reset.history.bridge).toMatchObject({
      attempts: 0,
      consecutive: 0,
      lastAttemptAt: null,
    });
  });

  it.each([
    [{ fqgate: "incompatible" }, "incompatible"],
    [{ fqgate: "unknown" }, "unknown_state"],
    [{ session: "login_required" }, "login_required"],
    [{ tunnel: "missing" }, "missing_tunnel"],
    [{ tunnel: "unknown" }, "unknown_state"],
  ] as const)("forbids dangerous global state %j", (patch, reason) => {
    expect(
      run(withState(patch)).decisions.every(
        (item) =>
          item.decision === "forbidden" && item.reason === reason && item.action === undefined,
      ),
    ).toBe(true);
  });

  it("keeps a fully ready but unnamed session at no_action and forbids recovery candidates", () => {
    expect(
      run(withState({ session: "unknown" })).decisions.every(
        (item) => item.decision === "no_action" && item.action === undefined,
      ),
    ).toBe(true);
    expect(
      run(withState({ session: "unknown", bridge: "unavailable" })).decisions.every(
        (item) => item.decision === "forbidden" && item.action === undefined,
      ),
    ).toBe(true);
  });

  it("forbids probe failures, unqualified artifacts, unresolved transactions and unknown identity", () => {
    const snapshot = withState({ fqgate: "stopped" });
    expect(run(snapshot, undefined, safe, ["fqgate"]).decisions[1]?.reason).toBe("probe_failed");
    expect(run(snapshot, undefined, { ...safe, fqgateQualified: false }).decisions[1]?.reason).toBe(
      "incompatible",
    );
    expect(
      run(snapshot, undefined, { ...safe, fqgateTransaction: "unresolved" }).decisions[1]?.reason,
    ).toBe("transaction_unresolved");
    expect(
      run(snapshot, undefined, { ...safe, fqgateTransaction: "unknown" }).decisions[1]?.reason,
    ).toBe("transaction_unresolved");
    expect(
      run(snapshot, undefined, { ...safe, fqgateIdentity: "unknown" }).decisions[1]?.reason,
    ).toBe("identity_unknown");
    const blocked = run(snapshot, undefined, { ...safe, fqgateIdentity: "unknown" });
    expect(blocked.history.fqgate.consecutive).toBe(0);
    expect(run(snapshot, blocked.history).decisions[1]?.reason).toBe("threshold");
  });

  it("rejects out-of-range config and corrupt history", () => {
    for (const key of [
      "consecutiveFailures",
      "cooldownMs",
      "maxAttempts",
      "stableResetMs",
    ] as const) {
      expect(() => validateRecoveryConfig({ ...DEFAULT_RECOVERY_CONFIG, [key]: 0 })).toThrow();
      expect(() =>
        validateRecoveryConfig({ ...DEFAULT_RECOVERY_CONFIG, [key]: Number.MAX_SAFE_INTEGER }),
      ).toThrow();
    }
    expect(() =>
      validateRecoveryHistory({ ...emptyRecoveryHistory(base), token: "secret" }),
    ).toThrow();
    expect(() =>
      validateRecoveryHistory({ ...emptyRecoveryHistory(base), bridge: { consecutive: 10000 } }),
    ).toThrow();
  });

  it("accepts only decision combinations the B1 evaluator can persist", () => {
    const kinds = ["no_action", "eligible", "suppressed", "exhausted", "forbidden"] as const;
    const reasons = [
      "healthy",
      "threshold",
      "cooldown",
      "attempt_limit",
      "eligible",
      "login_required",
      "incompatible",
      "missing_tunnel",
      "unknown_state",
      "probe_failed",
      "identity_unknown",
      "transaction_unresolved",
      "history_invalid",
    ] as const;
    const healthyState = { bridge: "ready", fqgate: "ready", tunnel: "running" } as const;
    const candidateState = {
      bridge: "unavailable",
      fqgate: "stopped",
      tunnel: "stopped",
    } as const;
    const forbiddenReasons = [
      "login_required",
      "incompatible",
      "missing_tunnel",
      "unknown_state",
      "probe_failed",
      "identity_unknown",
      "transaction_unresolved",
    ];
    const at = Date.parse("2026-09-30T00:00:00.000Z");
    const cooldownDeadline = new Date(at + 300_000).toISOString();
    const actionVariants = (component: "bridge" | "fqgate" | "tunnel") => [
      { present: false },
      { present: true, value: RECOVERY_ACTIONS[component] },
      ...Object.values(RECOVERY_ACTIONS)
        .filter((action) => action !== RECOVERY_ACTIONS[component])
        .map((value) => ({ present: true, value })),
      { present: true, value: "not-an-action" },
      { present: true, value: null },
      { present: true, value: undefined },
    ];
    const notBeforeVariants = [
      { present: false },
      { present: true, value: cooldownDeadline },
      { present: true, value: "2026-09-30T00:05:00Z" },
      { present: true, value: "not-a-time" },
      { present: true, value: null },
      { present: true, value: undefined },
    ];

    for (const component of ["bridge", "fqgate", "tunnel"] as const) {
      for (const kind of kinds) {
        for (const reason of reasons) {
          const observedState =
            kind === "no_action" ||
            (kind === "forbidden" &&
              reason !== "identity_unknown" &&
              !(reason === "incompatible" && component === "fqgate"))
              ? healthyState[component]
              : candidateState[component];
          const attempts =
            kind === "exhausted" || (kind === "suppressed" && reason === "cooldown") ? 1 : 0;
          const consecutive =
            kind === "eligible" || (kind === "suppressed" && reason === "cooldown")
              ? 3
              : kind === "suppressed" || kind === "exhausted"
                ? 1
                : 0;
          const history = {
            ...emptyRecoveryHistory(base),
            [component]: {
              consecutive,
              attempts,
              lastAttemptAt: attempts === 0 ? null : at,
              stableSince: null,
              lastState: observedState,
            },
          };
          const otherDecisions = run().decisions;
          const index = ["bridge", "fqgate", "tunnel"].indexOf(component);
          const decisionBase = {
            schemaVersion: 1,
            component,
            observedState,
            decision: kind,
            reason,
            attemptsInWindow: attempts,
          };

          for (const action of actionVariants(component)) {
            for (const notBefore of notBeforeVariants) {
              const decision = {
                ...decisionBase,
                ...(action.present ? { action: action.value } : {}),
                ...(notBefore.present ? { notBefore: notBefore.value } : {}),
              };
              const file = {
                schemaVersion: 1,
                history,
                decisions: otherDecisions.map((item, itemIndex) =>
                  itemIndex === index ? decision : item,
                ),
              };
              const reasonAllowed =
                (kind === "no_action" && reason === "healthy") ||
                (kind === "eligible" && reason === "eligible") ||
                (kind === "suppressed" && ["threshold", "cooldown"].includes(reason)) ||
                (kind === "exhausted" && reason === "attempt_limit") ||
                (kind === "forbidden" && forbiddenReasons.includes(reason));
              const actionAllowed = ["eligible", "suppressed", "exhausted"].includes(kind)
                ? action.present && action.value === RECOVERY_ACTIONS[component]
                : !action.present;
              const isCooldownSuppression = kind === "suppressed" && reason === "cooldown";
              const notBeforeAllowed = isCooldownSuppression
                ? notBefore.present && notBefore.value === cooldownDeadline
                : !notBefore.present;
              const stateAllowed =
                kind === "no_action"
                  ? observedState === healthyState[component]
                  : ["eligible", "suppressed", "exhausted"].includes(kind) ||
                    reason !== "identity_unknown" ||
                    observedState === candidateState[component];
              const setAllowed =
                kind !== "forbidden" ||
                (![
                  "login_required",
                  "missing_tunnel",
                  "probe_failed",
                  "unknown_state",
                  "transaction_unresolved",
                ].includes(reason) &&
                  (reason !== "incompatible" || component === "fqgate"));
              const shouldAccept =
                reasonAllowed && actionAllowed && notBeforeAllowed && stateAllowed && setAllowed;
              let accepted = false;
              try {
                validateRecoveryFile(file);
                accepted = true;
              } catch {
                accepted = false;
              }
              expect(accepted).toBe(shouldAccept);
            }
          }
        }
      }
    }

    const healthyHistory = emptyRecoveryHistory(base);
    const invalidQualifiedState = run().decisions.map((decision) => {
      if (decision.component !== "fqgate") return decision;
      return {
        schemaVersion: decision.schemaVersion,
        component: decision.component,
        observedState: decision.observedState,
        decision: "forbidden" as const,
        reason: "incompatible" as const,
        attemptsInWindow: decision.attemptsInWindow,
      };
    });
    expect(() =>
      validateRecoveryFile({
        schemaVersion: 1,
        history: healthyHistory,
        decisions: invalidQualifiedState,
      }),
    ).toThrow();
  });

  it("persists complete evaluator decisions for every global safety block", () => {
    const cases: Array<{
      snapshot: SupervisorSnapshot;
      safety?: RecoverySafety;
      failed?: ProbeResult["failed"];
    }> = [
      { snapshot: withState({ session: "login_required" }) },
      { snapshot: withState({ fqgate: "incompatible" }) },
      { snapshot: withState({ tunnel: "missing" }) },
      { snapshot: withState({ fqgate: "unknown" }) },
      { snapshot: withState({ session: "unknown", bridge: "unavailable" }) },
      { snapshot: base, safety: { ...safe, fqgateTransaction: "unresolved" } },
      { snapshot: withState({ fqgate: "ready" }), safety: { ...safe, fqgateQualified: false } },
      {
        snapshot: withState({ bridge: "unavailable" }),
        safety: { ...safe, bridgeIdentity: "unknown" },
      },
      { snapshot: base, failed: ["bridge"] },
    ];
    for (const item of cases) {
      const result = run(item.snapshot, undefined, item.safety ?? safe, item.failed ?? []);
      expect(() =>
        validateRecoveryFile({
          schemaVersion: 1,
          history: result.history,
          decisions: result.decisions,
        }),
      ).not.toThrow();
    }
    expect(() =>
      validateRecoveryFile({
        schemaVersion: 1,
        history: emptyRecoveryHistory(base),
        decisions: forbiddenHistory(base),
      }),
    ).toThrow();
  });

  it("preserves evaluator precedence when multiple global blocks are present", () => {
    const cases: Array<{
      snapshot: SupervisorSnapshot;
      failed?: ProbeResult["failed"];
      reason: string;
    }> = [
      {
        snapshot: withState({
          session: "login_required",
          fqgate: "incompatible",
          tunnel: "missing",
        }),
        reason: "login_required",
      },
      {
        snapshot: withState({ fqgate: "incompatible", tunnel: "missing" }),
        reason: "incompatible",
      },
      {
        snapshot: withState({ tunnel: "missing", fqgate: "unknown" }),
        failed: ["bridge"],
        reason: "missing_tunnel",
      },
      {
        snapshot: withState({ fqgate: "unknown" }),
        failed: ["bridge"],
        reason: "probe_failed",
      },
    ];

    for (const item of cases) {
      const result = run(item.snapshot, undefined, safe, item.failed ?? []);
      expect(result.decisions.every((decision) => decision.reason === item.reason)).toBe(true);
      expect(() =>
        validateRecoveryFile({
          schemaVersion: 1,
          history: result.history,
          decisions: result.decisions,
        }),
      ).not.toThrow();

      if (item.reason !== "probe_failed") {
        const lowerPriority = result.decisions.map((decision) => ({
          ...decision,
          reason: "unknown_state" as const,
        }));
        expect(() =>
          validateRecoveryFile({
            schemaVersion: 1,
            history: result.history,
            decisions: lowerPriority,
          }),
        ).toThrow();
      }
    }
  });

  it("rejects decisions inconsistent with their persisted history counters", () => {
    const result = run(withState({ bridge: "unavailable" }));
    const file = {
      schemaVersion: 1,
      history: result.history,
      decisions: result.decisions.map((decision) =>
        decision.component === "bridge" ? { ...decision, attemptsInWindow: 1 } : decision,
      ),
    };
    expect(() => validateRecoveryFile(file)).toThrow();
    expect(() =>
      validateRecoveryFile({
        ...file,
        history: {
          ...result.history,
          bridge: { ...result.history.bridge, consecutive: 1, lastState: "ready" },
        },
      }),
    ).toThrow();
    const history = emptyRecoveryHistory(base);
    expect(() =>
      validateRecoveryHistory({
        ...history,
        bridge: { ...history.bridge, attempts: 1 },
      }),
    ).toThrow();
    expect(() =>
      validateRecoveryHistory({
        ...history,
        bridge: { ...history.bridge, lastAttemptAt: at },
      }),
    ).toThrow();
    expect(() =>
      validateRecoveryHistory({
        ...history,
        bridge: { ...history.bridge, stableSince: at, lastState: "unavailable" },
      }),
    ).toThrow();
  });

  it("writes bounded schema-only decisions with the Phase 7-A single-writer lock", async () => {
    const root = await directory();
    const store = new RecoveryStore(join(root, "supervisor"), process.cwd());
    const release = await store.acquire();
    await expect(store.acquire()).rejects.toThrow();
    const result = run();
    await store.write({ schemaVersion: 1, history: result.history, decisions: result.decisions });
    expect(await store.read()).toEqual({
      schemaVersion: 1,
      history: result.history,
      decisions: result.decisions,
    });
    const file = join(root, "supervisor", "recovery.json");
    expect((await stat(file)).size).toBeLessThan(MAX_RECOVERY_FILE_BYTES);
    expect(await readFile(file, "utf8")).not.toMatch(/secret|pid|path|Bearer/);
    await release();
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        history: result.history,
        decisions: result.decisions,
        secret: "bad",
      }),
    );
    await expect(store.read()).rejects.toThrow();
  });

  it("rejects oversized files, repo paths and link paths", async () => {
    const root = await directory();
    await expect(new RecoveryStore(join(process.cwd(), "state")).acquire()).rejects.toThrow();
    await symlink(
      process.cwd(),
      join(root, "link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(new RecoveryStore(join(root, "link", "state")).acquire()).rejects.toThrow();
    const store = new RecoveryStore(join(root, "safe"));
    const release = await store.acquire();
    await writeFile(join(root, "safe", "recovery.json"), "x".repeat(MAX_RECOVERY_FILE_BYTES + 1));
    await expect(store.read()).rejects.toThrow();
    await release();
  });
});
