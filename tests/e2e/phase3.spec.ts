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

  test("qualifies an in-range candidate only after explicit local confirmation", async ({
    page,
  }) => {
    let statusCalls = 0;
    let qualificationRequest: { readonly url: string; readonly body: unknown } | undefined;
    const baseline = updateStatusPayload({ version: "1.0.2" });
    const blocked = blockedCandidateStatusPayload();
    const succeeded = updateStatusPayload({ succeeded: true, version: "1.0.4" });

    await page.route("**/api/v1/capabilities", async (route) => {
      await json(route, { requestContext: "local" });
    });
    await page.route("**/api/v1/updates/status", async (route) => {
      statusCalls += 1;
      await json(route, statusCalls === 1 ? baseline : succeeded);
    });
    await page.route("**/api/v1/updates/check", async (route) => {
      await json(route, blocked);
    });
    await page.route("**/api/v1/updates/qualify", async (route) => {
      qualificationRequest = {
        url: route.request().url(),
        body: route.request().postDataJSON(),
      };
      await json(route, succeeded);
    });

    await page.goto("/updates");
    await expect(page.getByRole("button", { name: "验证兼容并升级" })).toHaveCount(0);
    await page.getByRole("button", { name: "检查更新" }).click();
    await expect(page.getByText("FQGate 1.0.4", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "验证兼容并升级" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "验证兼容并升级" }).click();
    await expect(page.getByText("升级完成")).toBeVisible();
    expect(qualificationRequest).toEqual({
      url: expect.stringContaining("/api/v1/updates/qualify"),
      body: { planId: "plan-cccccccccccccccccccccccccccccccc" },
    });
  });

  test("does not expose qualification to the remote-admin Dashboard", async ({ page }) => {
    await page.route("**/api/v1/capabilities", async (route) => {
      await json(route, { requestContext: "remote_admin" });
    });
    await page.route("**/api/v1/updates/status", async (route) => {
      await json(route, updateStatusPayload());
    });
    await page.route("**/api/v1/updates/check", async (route) => {
      await json(route, blockedCandidateStatusPayload());
    });

    await page.goto("/updates");
    await page.getByRole("button", { name: "管理员检查更新" }).click();
    await expect(page.getByText("资格验证和升级仅能从本机 Dashboard 执行。")).toBeVisible();
    await expect(page.getByRole("button", { name: "验证兼容并升级" })).toHaveCount(0);
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
    readonly version?: string;
    readonly targetVersion?: string;
  } = {},
) {
  const version = options.version ?? (options.succeeded ? "1.0.1" : "1.0.0");
  const targetVersion = options.targetVersion ?? (options.succeeded ? version : "1.0.1");
  return {
    releaseSource: { id: "github", label: "GitHub · fqgate/FQGate-releases（固定可信源）" },
    lifecycle: "ready",
    installedVersion: version,
    compatibility: {
      version,
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
            installedVersion: version,
            targetVersion,
            action: "update",
            reason: "selected release differs",
            compatibility: {
              version: targetVersion,
              status: "validated",
              supported: true,
              validated: true,
              reason: "validated",
            },
            package: {
              fileName: `FQGate-${targetVersion}-windows-x64-UNSIGNED.exe`,
              size: 1024,
              sha256: "c".repeat(64),
            },
            releaseNotes: [],
            restartRequired: true,
          },
          lastCheck: {
            checkedAt: "2026-09-17T00:00:00.000Z",
            result: "available",
            planId: options.planId ?? "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetVersion,
          },
        }
      : {}),
    transaction: options.succeeded ? { state: "succeeded", targetVersion } : { state: "idle" },
    ...(options.succeeded
      ? {
          lastResult: {
            completedAt: "2026-09-17T00:01:00.000Z",
            outcome: "updated",
            targetVersion,
          },
        }
      : {}),
  };
}

function blockedCandidateStatusPayload() {
  const status = updateStatusPayload({
    withPlan: true,
    version: "1.0.2",
    targetVersion: "1.0.4",
    planId: "plan-cccccccccccccccccccccccccccccccc",
  });
  const plan = status.plan;
  if (plan === undefined) throw new Error("fixture update plan is missing");
  return {
    ...status,
    plan: {
      ...plan,
      targetVersion: "1.0.4",
      action: "blocked",
      reason: "FQGate 1.0.4 is in range but not yet validated",
      compatibility: {
        version: "1.0.4",
        status: "supported_unvalidated",
        supported: true,
        validated: false,
        reason: "supported but not yet qualified",
      },
      package: {
        fileName: "FQGate-1.0.4-windows-x64-UNSIGNED.exe",
        size: 23_201_792,
        sha256: "d".repeat(64),
      },
    },
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
        allowedContexts: ["local"],
        requiresConfirmation: false,
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
