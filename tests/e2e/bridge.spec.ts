import { expect, test, type Page } from "@playwright/test";

const sessionId = "11111111-1111-4111-8111-111111111111";
const imageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("local bridge QR flow", () => {
  test("moves from disconnected to QR connected and refreshes the dashboard", async ({ page }) => {
    let pollCalls = 0;
    let connected = false;
    await installFakeBridge(page, {
      status: () => statusPayload(connected),
      begin: () => ({
        sessionId,
        qr: { mediaType: "image/png", imageBase64 },
        status: "waiting_for_scan",
        createdAt: "2026-09-16T00:00:00.000Z",
        expiresAt: "2026-09-16T00:02:00.000Z",
      }),
      poll: () => {
        pollCalls += 1;
        if (pollCalls >= 3) connected = true;
        return pollCalls === 1
          ? { sessionId, status: "waiting_for_scan", connected: false }
          : pollCalls === 2
            ? { sessionId, status: "waiting_for_confirmation", connected: false }
            : { sessionId, status: "connected", connected: true, loginMethod: "formal" };
      },
    });

    await page.goto("/");
    await expect(page.getByText("需要登录")).toBeVisible();
    await page.getByRole("button", { name: "切换为深色主题" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("link", { name: "使用扫码登录" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "生成 QR 码" }).click();
    await expect(page.getByRole("img", { name: "FQGate 扫码登录二维码" })).toBeVisible();
    await expect(page.getByText("请在手机上确认")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("行情会话已连接")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("link", { name: "返回总览" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("行情会话已连接", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows an expired flow and offers a deliberate retry", async ({ page }) => {
    await installFakeBridge(page, {
      status: () => statusPayload(false),
      begin: () => ({
        sessionId,
        qr: { mediaType: "image/png", imageBase64 },
        status: "waiting_for_scan",
        createdAt: "2026-09-16T00:00:00.000Z",
        expiresAt: "2026-09-16T00:02:00.000Z",
      }),
      poll: () => ({
        error: true,
        code: "QR_FLOW_EXPIRED",
        message: "The QR login flow expired. Start a new flow.",
        requestId: "fake-request",
      }),
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "生成 QR 码" }).click();
    await expect(page.getByText("二维码已过期")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "生成新的二维码" })).toBeVisible();
  });

  test("shows a replaced flow and offers a deliberate retry", async ({ page }) => {
    await installFakeBridge(page, {
      status: () => statusPayload(false),
      begin: () => ({
        sessionId,
        qr: { mediaType: "image/png", imageBase64 },
        status: "waiting_for_scan",
        createdAt: "2026-09-16T00:00:00.000Z",
        expiresAt: "2026-09-16T00:02:00.000Z",
      }),
      poll: () => ({
        error: true,
        code: "QR_FLOW_REPLACED",
        message: "The QR login flow was replaced. Start a new flow.",
        requestId: "fake-request",
      }),
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "生成 QR 码" }).click();
    await expect(page.getByText("二维码已被替换")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "生成新的二维码" })).toBeVisible();
  });
});

async function installFakeBridge(
  page: Page,
  options: {
    readonly status: () => unknown;
    readonly begin: () => unknown;
    readonly poll: () => unknown;
  },
) {
  await page.route("**/api/v1/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.status()),
    });
  });
  await page.route("**/api/v1/session/qr/begin", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.begin()),
    });
  });
  await page.route("**/api/v1/session/qr/poll", async (route) => {
    const value = options.poll();
    if (isErrorPayload(value)) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: value }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
}

function statusPayload(connected: boolean) {
  return {
    bridge: { state: "ready", version: "0.1.0", checkedAt: "2026-09-16T00:00:00.000Z" },
    fqgate: {
      lifecycle: connected ? "ready" : "unhealthy",
      process: { state: "running", running: true, pid: 12 },
      version: "1.0.0",
      compatibility: {
        version: "1.0.0",
        status: "validated",
        supported: true,
        validated: true,
        reason: "test",
      },
      health: {
        available: true,
        validPayload: true,
        httpStatus: 200,
        networkReady: true,
        connected,
        session: connected ? "connected" : "login_required",
        status: "ok",
        loginMethod: connected ? "formal" : null,
        level2Permission: null,
        reason: null,
        activeSubscriptions: 0,
      },
    },
    session: {
      state: connected ? "connected" : "login_required",
      loginMethod: connected ? "formal" : null,
    },
    lastCheckedAt: "2026-09-16T00:00:00.000Z",
  };
}

function isErrorPayload(value: unknown): value is {
  readonly error: boolean;
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
} {
  return typeof value === "object" && value !== null && "error" in value;
}
