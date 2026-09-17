import { expect, test, type Route } from "@playwright/test";

test.describe("Phase 3 local update center", () => {
  test("requires explicit check, preview confirmation, and applies the candidate", async ({
    page,
  }) => {
    let statusCalls = 0;
    let checkCalls = 0;
    const baseline = updateStatusPayload();
    const planned = updateStatusPayload({
      withPlan: true,
      planId: "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const replanned = updateStatusPayload({
      withPlan: true,
      planId: "plan-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const succeeded = updateStatusPayload({ succeeded: true });

    await page.route("**/api/v1/updates/status", async (route) => {
      statusCalls += 1;
      await json(route, statusCalls === 1 ? baseline : succeeded);
    });
    await page.route("**/api/v1/updates/check", async (route) => {
      checkCalls += 1;
      await json(route, checkCalls === 1 ? planned : replanned);
    });
    await page.route("**/api/v1/updates/apply", async (route) => {
      await json(route, succeeded);
    });

    await page.goto("/updates");
    await expect(page.getByText("FQGate 更新中心")).toBeVisible();
    expect(checkCalls).toBe(0);
    await page.getByRole("button", { name: "检查更新" }).click();
    await expect(page.getByText("FQGate 1.0.1")).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "检查更新" }).click();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "确认安装 / 升级" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "确认安装 / 升级" }).click();
    await expect(page.getByText("升级完成")).toBeVisible();
    expect(checkCalls).toBe(2);
  });
});

test.describe("Phase 3 runtime API reference", () => {
  test("keeps upstream reference, bridge API, and compatibility views separate", async ({
    page,
  }) => {
    await page.route("**/api/v1/openapi/catalog", async (route) => {
      await json(route, apiCatalogPayload());
    });
    await page.route("**/api/v1/openapi/refresh", async (route) => {
      await json(route, apiCatalogPayload());
    });

    await page.goto("/api-reference");
    await expect(page.getByRole("heading", { name: "Upstream FQGate Reference" })).toBeVisible();
    await expect(page.getByText("/v1/new/unregistered")).toBeVisible();
    await expect(page.getByText("仅上游参考").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Try it out" })).toHaveCount(0);

    await page.getByRole("tab", { name: /Bridge API/ }).click();
    await expect(page.getByText("/api/v1/session/qr/begin")).toBeVisible();
    await expect(page.getByText("/v1/new/unregistered")).toHaveCount(0);

    await page.getByRole("tab", { name: /Compatibility \/ Changes/ }).click();
    await expect(page.getByText("Required Bridge contracts")).toBeVisible();
    await expect(page.getByText("GET /v1/new/unregistered")).toBeVisible();
  });
});

async function json(route: Route, value: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

function updateStatusPayload(
  options: {
    readonly withPlan?: boolean;
    readonly succeeded?: boolean;
    readonly planId?: string;
  } = {},
) {
  return {
    releaseSource: { id: "github", label: "GitHub · zhuyifang/fqgate-releases（固定可信源）" },
    lifecycle: "ready",
    installedVersion: options.succeeded ? "1.0.1" : "1.0.0",
    compatibility: {
      version: options.succeeded ? "1.0.1" : "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "validated",
    },
    ...(options.withPlan
      ? {
          plan: {
            planId: options.planId ?? "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            candidateId: "candidate-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            createdAt: "2026-09-17T00:00:00.000Z",
            source: "github",
            installedVersion: "1.0.0",
            targetVersion: "1.0.1",
            action: "update",
            reason: "selected release differs",
            compatibility: {
              version: "1.0.1",
              status: "validated",
              supported: true,
              validated: true,
              reason: "validated",
            },
            package: {
              fileName: "FQGate-1.0.1-windows-x64-UNSIGNED.exe",
              size: 1024,
              sha256: "c".repeat(64),
            },
            releaseNotes: [],
            restartRequired: true,
          },
          lastCheck: {
            checkedAt: "2026-09-17T00:00:00.000Z",
            result: "available",
            planId: "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetVersion: "1.0.1",
          },
        }
      : {}),
    transaction: options.succeeded
      ? { state: "succeeded", targetVersion: "1.0.1" }
      : { state: "idle" },
    ...(options.succeeded
      ? {
          lastResult: {
            completedAt: "2026-09-17T00:01:00.000Z",
            outcome: "updated",
            targetVersion: "1.0.1",
          },
        }
      : {}),
  };
}

function apiCatalogPayload() {
  const health = {
    key: "GET /v1/market/health",
    method: "GET",
    path: "/v1/market/health",
    operationId: "health",
    tags: ["diagnostic"],
    deprecated: false,
    structuralFingerprint: "a".repeat(64),
  };
  const qrBegin = {
    key: "POST /v1/market/session/qr/begin",
    method: "POST",
    path: "/v1/market/session/qr/begin",
    operationId: "qrBegin",
    tags: ["session"],
    deprecated: false,
    structuralFingerprint: "b".repeat(64),
  };
  const unregistered = {
    key: "GET /v1/new/unregistered",
    method: "GET",
    path: "/v1/new/unregistered",
    operationId: "newEndpoint",
    tags: ["new"],
    deprecated: false,
    structuralFingerprint: "d".repeat(64),
  };
  return {
    source: "runtime_fqgate_openapi",
    snapshot: {
      endpoint: "http://127.0.0.1:17281/openapi.json",
      openapiVersion: "3.0.3",
      info: { title: "FQGate API", version: "1.0.0" },
      fetchedAt: "2026-09-17T00:00:00.000Z",
      byteLength: 1234,
      fingerprint: "e".repeat(64),
      operations: [health, qrBegin, unregistered],
      changes: { added: [unregistered], removed: [], changed: [] },
      cacheHit: false,
    },
    bridgeOperations: [
      {
        id: "session.qr.begin",
        method: "POST",
        path: "/api/v1/session/qr/begin",
        classification: "session_maintenance",
        intent: "session_maintenance",
        exposure: "local_only",
        requiredCompatibility: "validated",
        documentationVisible: true,
        upstream: { method: "POST", path: "/v1/market/session/qr/begin" },
      },
    ],
    upstreamOnlyOperations: [health, unregistered],
    contractCoverage: {
      required: [{ id: "health", method: "GET", path: "/v1/market/health", description: "health" }],
      missing: [],
    },
    note: "FQGate 文档只描述上游能力；只有显式注册的 Bridge operation 才获得授权。",
  };
}
