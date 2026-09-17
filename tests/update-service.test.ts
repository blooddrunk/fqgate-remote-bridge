import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FqgateUpdateService } from "../src/fqgate/update/service.js";
import type { FqgateStatus, ReleasePlan } from "../src/fqgate/install/lifecycle.js";
import { BridgeError, ERROR_CODES } from "../src/shared/errors.js";

function planFor(version: string, action: ReleasePlan["action"] = "update"): ReleasePlan {
  const body = Buffer.from(version, "utf8");
  return {
    release: {
      schemaVersion: 1,
      component: "fqgate",
      channel: "stable",
      status: "published",
      version,
      publishedAt: "2026-09-17T00:00:00.000Z",
      releaseNotes: ["safe test release"],
      packages: [
        {
          platform: "windows",
          architecture: "x86_64",
          installMode: "replaceExecutable",
          fileName: `FQGate-${version}-windows-x64-UNSIGNED.exe`,
          size: body.byteLength,
          sha256: createHash("sha256").update(body).digest("hex"),
          assetUrl: `https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v${version}/FQGate-${version}-windows-x64-UNSIGNED.exe`,
        },
      ],
    },
    package: {
      platform: "windows",
      architecture: "x86_64",
      installMode: "replaceExecutable",
      fileName: `FQGate-${version}-windows-x64-UNSIGNED.exe`,
      size: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"),
      assetUrl: `https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v${version}/FQGate-${version}-windows-x64-UNSIGNED.exe`,
    },
    compatibility: {
      version,
      status: action === "blocked" ? "unsupported" : "validated",
      supported: action !== "blocked",
      validated: action !== "blocked",
      reason: action === "blocked" ? "test candidate is not validated" : "validated test candidate",
    },
    ...(action === "install" || action === "update"
      ? {
          current: {
            path: "C:\\FQGate\\current\\fqgate.exe",
            size: 1,
            sha256: "a".repeat(64),
            version: "1.0.0",
            compatibility: {
              version: "1.0.0",
              status: "validated" as const,
              supported: true,
              validated: true,
              reason: "current",
            },
          },
        }
      : {}),
    action,
    reason: action === "noop" ? "already current" : action === "blocked" ? "blocked" : "available",
  };
}

const status: FqgateStatus = {
  lifecycle: "ready",
  process: { state: "running", pid: 44, expectedPath: "C:\\FQGate\\current\\fqgate.exe" },
  installed: {
    path: "C:\\FQGate\\current\\fqgate.exe",
    size: 1,
    sha256: "a".repeat(64),
    version: "1.0.0",
    compatibility: {
      version: "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "current",
    },
  },
  compatibility: {
    version: "1.0.0",
    status: "validated",
    supported: true,
    validated: true,
    reason: "current",
  },
  health: {
    endpoint: "http://127.0.0.1:17281/v1/market/health",
    checkedAt: "2026-09-17T00:00:00.000Z",
    available: true,
    validPayload: true,
    httpStatus: 200,
    networkReady: true,
    connected: false,
    session: "login_required",
    level2Permission: null,
    diagnostics: {},
  },
};

class FakeLifecycle {
  planCalls = 0;
  installCalls = 0;
  planValue: ReleasePlan = planFor("1.0.1");
  applyGate: (() => Promise<void>) | undefined;

  async plan(): Promise<ReleasePlan> {
    this.planCalls += 1;
    return this.planValue;
  }

  async installPlan(plan: ReleasePlan) {
    this.installCalls += 1;
    await this.applyGate?.();
    return {
      plan,
      action: plan.action === "install" ? ("installed" as const) : ("updated" as const),
    };
  }

  async status(): Promise<FqgateStatus> {
    return status;
  }
}

describe("framework-agnostic FQGate update service", () => {
  it("does not check the release source while status is loaded", async () => {
    const lifecycle = new FakeLifecycle();
    const service = new FqgateUpdateService({ lifecycle, now: () => "2026-09-17T00:00:00.000Z" });
    const value = await service.getStatus();
    expect(value.releaseSource.id).toBe("github");
    expect(value.lastCheck).toBeUndefined();
    expect(lifecycle.planCalls).toBe(0);
  });

  it("creates a candidate-bound preview and applies only the same fresh plan", async () => {
    const lifecycle = new FakeLifecycle();
    const service = new FqgateUpdateService({
      lifecycle,
      now: () => "2026-09-17T00:00:00.000Z",
      idFactory: () => "transaction-test",
    });
    const checked = await service.checkForUpdate();
    expect(checked.plan?.targetVersion).toBe("1.0.1");
    expect(checked.plan?.planId).toMatch(/^plan-[a-f0-9]{32}$/);
    expect(checked.plan?.candidateId).toMatch(/^candidate-[a-f0-9]{32}$/);
    expect(checked.plan?.package).not.toHaveProperty("assetUrl");

    lifecycle.planValue = planFor("1.0.2");
    await expect(service.applyConfirmed(checked.plan?.planId ?? "")).rejects.toMatchObject({
      code: ERROR_CODES.UPDATE_CONFIRMATION_STALE,
    });
    expect(lifecycle.installCalls).toBe(0);

    const refreshed = await service.checkForUpdate();
    const applied = await service.applyConfirmed(refreshed.plan?.planId ?? "");
    expect(applied.transaction.state).toBe("succeeded");
    expect(lifecycle.installCalls).toBe(1);
  });

  it("rejects overlapping mutating transactions", async () => {
    const lifecycle = new FakeLifecycle();
    let release!: () => void;
    lifecycle.applyGate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const service = new FqgateUpdateService({ lifecycle });
    const checked = await service.checkForUpdate();
    const first = service.applyConfirmed(checked.plan?.planId ?? "");
    await Promise.resolve();
    await expect(service.applyConfirmed(checked.plan?.planId ?? "")).rejects.toMatchObject({
      code: ERROR_CODES.UPDATE_IN_PROGRESS,
    });
    release();
    await expect(first).resolves.toMatchObject({ transaction: { state: "succeeded" } });
    expect(lifecycle.installCalls).toBe(1);
  });

  it("surfaces incompatible candidates without making them activatable", async () => {
    const lifecycle = new FakeLifecycle();
    lifecycle.planValue = planFor("2.0.0", "blocked");
    const service = new FqgateUpdateService({ lifecycle });
    const result = await service.checkForUpdate();
    expect(result.lastCheck?.result).toBe("blocked");
    expect(result.plan?.action).toBe("blocked");
    await expect(service.applyConfirmed(result.plan?.planId ?? "")).rejects.toMatchObject({
      code: ERROR_CODES.UPDATE_CONFIRMATION_STALE,
    });
    expect(lifecycle.installCalls).toBe(0);
  });

  it("normalizes transaction failure and records rollback metadata without secrets", async () => {
    const lifecycle = new FakeLifecycle();
    lifecycle.installPlan = async () => {
      throw new BridgeError(ERROR_CODES.HEALTH_TIMEOUT, "candidate failed", {
        rollbackRestored: true,
      });
    };
    const service = new FqgateUpdateService({ lifecycle });
    const checked = await service.checkForUpdate();
    await expect(service.applyConfirmed(checked.plan?.planId ?? "")).rejects.toMatchObject({
      code: ERROR_CODES.HEALTH_TIMEOUT,
    });
    const result = await service.getStatus();
    expect(result.transaction.state).toBe("rolled_back");
    expect(result.lastResult?.outcome).toBe("rolled_back");
    expect(JSON.stringify(result)).not.toContain("assetUrl");
  });
});
