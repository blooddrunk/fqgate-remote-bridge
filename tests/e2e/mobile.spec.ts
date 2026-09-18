import { expect, test, type Page, type Route } from "@playwright/test";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test.describe(`responsive dashboard ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("keeps every existing route usable without document overflow", async ({ page }) => {
      await installResponsiveFixtures(page);

      await page.goto("/");
      await expect(page.getByRole("heading", { name: "本机行情连接，一眼看清。" })).toBeVisible();
      await assertNoDocumentOverflow(page);
      await assertNavigationBehavior(page, viewport.width < 768);

      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "恢复行情会话。" })).toBeVisible();
      await page.getByRole("button", { name: "生成 QR 码" }).click();
      const qr = page.getByRole("img", { name: "FQGate 扫码登录二维码" });
      await expect(qr).toBeVisible();
      const qrBox = await qr.boundingBox();
      expect(qrBox).not.toBeNull();
      expect(qrBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.width);
      await assertNoDocumentOverflow(page);

      await page.goto("/updates");
      await expect(page.getByRole("heading", { name: "FQGate 更新中心" })).toBeVisible();
      await expect(page.getByRole("button", { name: "检查更新" })).toHaveCount(0);
      await assertNoDocumentOverflow(page);

      await page.goto("/api-reference");
      await expect(page.getByRole("heading", { name: "API Reference" })).toBeVisible();
      await assertNoDocumentOverflow(page);

      const forbiddenStatuses = await page.evaluate(async () => {
        const paths = [
          "/api/v1/updates/check",
          "/api/v1/updates/plan",
          "/api/v1/updates/apply",
          "/api/v1/openapi/refresh",
        ];
        const responses = await Promise.all(
          paths.map((path) =>
            fetch(path, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            }),
          ),
        );
        return responses.map((response) => response.status);
      });
      expect(forbiddenStatuses).toEqual([403, 403, 403, 403]);
    });
  });
}

async function assertNavigationBehavior(page: Page, mobile: boolean): Promise<void> {
  const menu = page.getByRole("button", { name: "打开主导航" });
  if (mobile) {
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("min-height", "44px");
    await menu.focus();
    await expect(menu).toBeFocused();
    await menu.click();
    await expect(page.getByRole("navigation", { name: "移动主导航" })).toBeVisible();
    await expect(page.getByRole("link", { name: "API Reference" })).toBeVisible();
    return;
  }
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(menu).toBeHidden();
}

async function assertNoDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function installResponsiveFixtures(page: Page): Promise<void> {
  await page.route("**/api/v1/capabilities", async (route) => {
    await json(route, {
      apiVersion: "v1",
      requestContext: "remote_human",
      capabilities: { status: true, qrLogin: true },
      fqgate: {
        version: "1.0.0",
        compatibility: {
          version: "1.0.0",
          status: "validated",
          supported: true,
          validated: true,
          reason: "fixture",
        },
      },
    });
  });
  await page.route("**/api/v1/status", async (route) => {
    await json(route, statusPayload());
  });
  await page.route("**/api/v1/updates/status", async (route) => {
    await json(route, updateStatusPayload());
  });
  await page.route("**/api/v1/openapi/catalog", async (route) => {
    await json(route, catalogPayload());
  });
  await page.route("**/api/v1/session/qr/begin", async (route) => {
    await json(route, {
      sessionId: "11111111-1111-4111-8111-111111111111",
      qr: {
        mediaType: "image/png",
        imageBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
      status: "waiting_for_scan",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2026-09-17T00:02:00.000Z",
    });
  });
  await page.route("**/api/v1/session/qr/poll", async (route) => {
    await json(route, {
      sessionId: "11111111-1111-4111-8111-111111111111",
      status: "waiting_for_scan",
      connected: false,
    });
  });
  for (const path of [
    "**/api/v1/updates/check",
    "**/api/v1/updates/plan",
    "**/api/v1/updates/apply",
    "**/api/v1/openapi/refresh",
  ]) {
    await page.route(path, async (route) => {
      await json(
        route,
        {
          error: {
            code: "OPERATION_FORBIDDEN",
            message: "remote-human fixture is read-only",
            requestId: "fixture-request",
          },
        },
        403,
      );
    });
  }
}

async function json(route: Route, value: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

function statusPayload() {
  return {
    bridge: { state: "ready", version: "0.1.0", checkedAt: "2026-09-17T00:00:00.000Z" },
    fqgate: {
      lifecycle: "ready",
      process: { state: "running", running: true, pid: 12 },
      version: "1.0.0",
      compatibility: {
        version: "1.0.0",
        status: "validated",
        supported: true,
        validated: true,
        reason: "fixture",
      },
      health: {
        available: true,
        validPayload: true,
        httpStatus: 200,
        networkReady: true,
        connected: false,
        session: "login_required",
        status: "ok",
        loginMethod: null,
        level2Permission: null,
        reason: null,
        activeSubscriptions: 0,
      },
    },
    session: { state: "login_required", loginMethod: null },
    lastCheckedAt: "2026-09-17T00:00:00.000Z",
  };
}

function updateStatusPayload() {
  return {
    releaseSource: { id: "github", label: "GitHub · fixed official source" },
    lifecycle: "ready",
    installedVersion: "1.0.0",
    compatibility: {
      version: "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "fixture",
    },
    transaction: { state: "idle" },
  };
}

function catalogPayload() {
  const longPath = `/v1/market/${"very-long-operation-segment-".repeat(8)}/health`;
  const operation = {
    key: `GET ${longPath}`,
    method: "GET",
    path: longPath,
    operationId: "longHealth",
    tags: ["diagnostic"],
    deprecated: false,
    structuralFingerprint: "a".repeat(64),
  };
  return {
    source: "runtime_fqgate_openapi",
    snapshot: {
      endpoint: "http://127.0.0.1:17281/openapi.json",
      openapiVersion: "3.1.0",
      info: { title: "FQGate API", version: "1.0.0" },
      fetchedAt: "2026-09-17T00:00:00.000Z",
      byteLength: 123,
      fingerprint: "f".repeat(64),
      operations: [operation],
      changes: { added: [], removed: [], changed: [] },
      cacheHit: false,
    },
    bridgeOperations: [
      {
        id: "bridge.status",
        method: "GET",
        path: "/api/v1/status",
        classification: "diagnostic",
        intent: "diagnostic",
        allowedContexts: ["local", "remote_human", "remote_admin"],
        requiresConfirmation: false,
        requiredCompatibility: "validated",
        documentationVisible: true,
      },
    ],
    upstreamOnlyOperations: [operation],
    contractCoverage: { required: [], missing: [] },
    note: "Reference only",
  };
}
