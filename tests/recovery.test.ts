import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RECOVERY_CONFIG,
  emptyRecoveryHistory,
  evaluateRecovery,
  validateRecoveryConfig,
  validateRecoveryHistory,
} from "../src/supervisor/recovery.js";
import type { RecoveryHistory, RecoverySafety } from "../src/supervisor/recovery.js";
import { MAX_RECOVERY_FILE_BYTES, RecoveryStore } from "../src/supervisor/recovery-store.js";
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
    [{ session: "unknown" }, "unknown_state"],
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
