import { expect, test, type Route } from "@playwright/test";

test.describe("Phase 4.5 remote administrator UI", () => {
  test("keeps admin maintenance deliberate and sends only the one-time apply grant", async ({
    page,
  }) => {
    let applied = false;
    const controlRequests: Array<{ path: string; headers: Record<string, string>; body: unknown }> =
      [];
    const plan = updatePlan();
    const confirmationGrant = "grant-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    await page.route("**/api/v1/capabilities", async (route) => {
      await json(route, {
        apiVersion: "v1",
        requestContext: "remote_admin",
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
    await page.route("**/api/v1/updates/status", async (route) => {
      await json(route, applied ? updateStatus({ applied }) : updateStatus({ plan }));
    });
    for (const path of ["**/api/v1/updates/check", "**/api/v1/updates/plan"]) {
      await page.route(path, async (route) => {
        controlRequests.push(await readRequest(route));
        await json(route, updateStatus({ plan }));
      });
    }
    await page.route("**/api/v1/updates/apply", async (route) => {
      const request = await readRequest(route);
      controlRequests.push(request);
      const body = request.body as Record<string, unknown>;
      if (body.phase === "prepare") {
        await json(route, {
          operationId: "updates.apply",
          planId: plan.planId,
          candidateId: plan.candidateId,
          confirmationGrant,
          expiresAt: "2099-09-17T00:01:00.000Z",
        });
        return;
      }
      applied = true;
      await json(route, updateStatus({ applied }));
    });

    await page.goto("/updates");
    await expect(page.getByText("远程管理员 · 强认证维护上下文")).toBeVisible();
    await expect(page.getByText("当前上下文：远程管理员（独立 Access / 强认证）")).toBeVisible();
    await expect(page.getByRole("button", { name: "管理员检查更新" })).toBeVisible();
    await expect(page.getByRole("button", { name: "确认安装 / 升级" })).toHaveCount(0);

    await page.getByRole("button", { name: "管理员检查更新" }).click();
    await expect(page.getByText("候选身份", { exact: true })).toBeVisible();
    await expect(page.getByText(plan.candidateId, { exact: true })).toBeVisible();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "申请一次性执行确认" }).click();
    await expect(page.getByText("一次性确认已准备")).toBeVisible();
    await expect(page.getByText(confirmationGrant, { exact: true })).toHaveCount(0);
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "第二次确认并执行" }).click();
    await expect(page.getByText("升级完成")).toBeVisible();

    const prepareRequest = controlRequests.find(
      (request) => (request.body as Record<string, unknown>).phase === "prepare",
    );
    const executeRequest = controlRequests.find(
      (request) => (request.body as Record<string, unknown>).phase === "execute",
    );
    expect(prepareRequest?.headers["x-bridge-admin-intent"]).toBe("fqgate-remote-bridge-admin-v1");
    expect(executeRequest?.headers["x-bridge-admin-intent"]).toBe("fqgate-remote-bridge-admin-v1");
    expect((executeRequest?.body as Record<string, unknown>).confirmationGrant).toBe(
      confirmationGrant,
    );
  });
});

async function readRequest(route: Route): Promise<{
  path: string;
  headers: Record<string, string>;
  body: unknown;
}> {
  const request = route.request();
  const bodyText = request.postData();
  return {
    path: new URL(request.url()).pathname,
    headers: request.headers(),
    body: bodyText === null ? {} : JSON.parse(bodyText),
  };
}

async function json(route: Route, value: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

function updatePlan() {
  return {
    planId: "plan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
      fileName: "FQGate-1.0.1-windows-x64.exe",
      size: 1024,
      sha256: "c".repeat(64),
    },
    releaseNotes: [],
    restartRequired: true,
  };
}

function updateStatus(
  options: { readonly plan?: ReturnType<typeof updatePlan>; readonly applied?: boolean } = {},
) {
  return {
    releaseSource: { id: "github", label: "GitHub · fixed official source" },
    lifecycle: "ready",
    installedVersion: options.applied ? "1.0.1" : "1.0.0",
    compatibility: {
      version: options.applied ? "1.0.1" : "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "fixture",
    },
    ...(options.plan === undefined || options.applied ? {} : { plan: options.plan }),
    transaction: options.applied ? { state: "succeeded" } : { state: "idle" },
    ...(options.applied
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
