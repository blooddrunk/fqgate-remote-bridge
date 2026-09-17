import { expect, test, type Route } from "@playwright/test";

test.describe("Phase 4 remote-human UI policy", () => {
  test("keeps the update center read-only for remote humans", async ({ page }) => {
    await page.route("**/api/v1/capabilities", async (route) => {
      await json(route, { requestContext: "remote_human" });
    });
    await page.route("**/api/v1/updates/status", async (route) => {
      await json(route, updateStatusPayload());
    });

    await page.goto("/updates");
    await expect(
      page.getByText("远程人工访问为只读；更新检查、预览和执行仅限本机维护"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "检查更新" })).toHaveCount(0);
    await expect(page.getByText(/updates\.status/)).toBeVisible();
  });

  test("keeps Runtime OpenAPI refresh local-only while showing the catalog", async ({ page }) => {
    await page.route("**/api/v1/capabilities", async (route) => {
      await json(route, { requestContext: "remote_human" });
    });
    await page.route("**/api/v1/openapi/catalog", async (route) => {
      await json(route, catalogPayload());
    });

    await page.goto("/api-reference");
    await expect(page.getByText("远程仅查看 API Catalog；OpenAPI 刷新仅限本机维护")).toBeVisible();
    await expect(page.getByRole("button", { name: "刷新 Runtime OpenAPI" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Upstream FQGate Reference" })).toBeVisible();
  });
});

async function json(route: Route, value: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
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
      reason: "validated",
    },
    transaction: { state: "idle" },
  };
}

function catalogPayload() {
  return {
    source: "runtime_fqgate_openapi",
    snapshot: {
      endpoint: "http://127.0.0.1:17281/openapi.json",
      openapiVersion: "3.1.0",
      info: { title: "FQGate API", version: "1.0.0" },
      fetchedAt: "2026-09-17T00:00:00.000Z",
      byteLength: 123,
      fingerprint: "a".repeat(64),
      operations: [],
      changes: { added: [], removed: [], changed: [] },
      cacheHit: false,
    },
    bridgeOperations: [],
    upstreamOnlyOperations: [],
    contractCoverage: { required: [], missing: [] },
    note: "Reference only",
  };
}
