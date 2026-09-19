/* global AbortController, clearTimeout, console, document, fetch, process, setTimeout, TextDecoder */

import { createInterface } from "node:readline/promises";
import { chromium } from "@playwright/test";

// This companion harness never runs updates.apply; it only exercises safe
// request paths and non-activating confirmation failures.
const MAX_RESPONSE_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const EXPIRY_WAIT_LIMIT_MS = 75_000;
const ADMIN_INTENT_HEADER = "x-bridge-admin-intent";
const ADMIN_INTENT_VALUE = "fqgate-remote-bridge-admin-v1";

const options = parseArguments(process.argv.slice(2));
const ordinaryOrigin = parseOrigin(options["ordinary-url"], "ordinary");
const adminOrigin = parseOrigin(options["admin-url"], "admin");
const browserChannel = options["browser-channel"] ?? "msedge";
let failureCount = 0;

function parseArguments(argumentsList) {
  const parsed = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}

function parseOrigin(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} URL is required`);
  }
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`${label} URL must be an HTTPS origin`);
  }
  return parsed.origin;
}

function writeResult(id, label, state, detail) {
  if (state === "FAIL") failureCount += 1;
  const timestamp = new Date().toISOString();
  console.log(`[${state}] ${id} ${label}: ${detail} timestamp=${timestamp}`);
}

function statusDetail(result) {
  const status = Number.isInteger(result?.status) ? `HTTP ${result.status}` : "HTTP 0";
  const code =
    typeof result?.code === "string" && result.code.length > 0 ? ` code=${result.code}` : "";
  return `${status}${code}`;
}

function assertResponse(id, label, result, expectedStatus, expectedCode) {
  const matchesStatus = result?.status === expectedStatus;
  const matchesCode = expectedCode === undefined || result?.code === expectedCode;
  if (matchesStatus && matchesCode) {
    writeResult(id, label, "PASS", statusDetail(result));
    return true;
  }
  writeResult(id, label, "FAIL", statusDetail(result));
  return false;
}

async function waitForOperator(label) {
  if (!process.stdin.isTTY) {
    writeResult("AUTH", `${label} browser login`, "FAIL", "INTERACTIVE_TERMINAL_REQUIRED");
    return false;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await prompt.question(
      `[MANUAL] ${label}: complete the Access login and MFA in the opened browser, then press Enter. `,
    );
    return true;
  } finally {
    prompt.close();
  }
}

async function gotoPage(page, origin, path, expectedHeading) {
  try {
    const response = await page.goto(`${origin}${path}`, {
      timeout: REQUEST_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    const status = response?.status() ?? 0;
    if (status !== 200) return { ok: false, status, reason: "PAGE_STATUS" };
    await page.getByRole("heading", { name: expectedHeading, exact: true }).waitFor({
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, status };
  } catch {
    return { ok: false, status: 0, reason: "PAGE_LOAD" };
  }
}

async function requestJson(page, path, method = "GET", body, admin = false) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (admin) headers[ADMIN_INTENT_HEADER] = ADMIN_INTENT_VALUE;
  try {
    return await page.evaluate(
      async ({ requestPath, requestMethod, requestBody, requestHeaders, maxBytes, timeoutMs }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(requestPath, {
            method: requestMethod,
            headers: requestHeaders,
            body: requestBody,
            credentials: "include",
            redirect: "manual",
            signal: controller.signal,
          });
          const summary = await readResponseSummary(response, maxBytes);
          return { status: response.status, ...summary };
        } catch {
          return { status: 0, code: "NETWORK_ERROR" };
        } finally {
          clearTimeout(timeout);
        }

        async function readResponseSummary(response, responseMaxBytes) {
          if (response.body === null) return {};
          const reader = response.body.getReader();
          const chunks = [];
          let total = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              total += next.value.byteLength;
              if (total > responseMaxBytes) {
                await reader.cancel();
                return { code: "RESPONSE_TOO_LARGE" };
              }
              chunks.push(next.value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          let value;
          try {
            value = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            return {};
          }
          if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
          const record = value;
          const error = record.error;
          const plan = record.plan;
          return {
            ...(typeof error === "object" && error !== null && typeof error.code === "string"
              ? { code: error.code }
              : {}),
            ...(typeof plan === "object" && plan !== null
              ? {
                  ...(typeof plan.planId === "string" ? { planId: plan.planId } : {}),
                  ...(typeof plan.action === "string" ? { action: plan.action } : {}),
                }
              : {}),
            ...(typeof record.sessionId === "string" ? { sessionId: record.sessionId } : {}),
            ...(typeof record.confirmationGrant === "string"
              ? { confirmationGrant: record.confirmationGrant }
              : {}),
            ...(typeof record.expiresAt === "string" ? { expiresAt: record.expiresAt } : {}),
          };
        }
      },
      {
        requestPath: path,
        requestMethod: method,
        requestBody: body === undefined ? undefined : JSON.stringify(body),
        requestHeaders: headers,
        maxBytes: MAX_RESPONSE_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
      },
    );
  } catch {
    return { status: 0, code: "BROWSER_EVALUATION_ERROR" };
  }
}

async function checkRoutes(page, origin, routeChecks, id) {
  let allPassed = true;
  for (const routeCheck of routeChecks) {
    const pageResult = await gotoPage(page, origin, routeCheck.path, routeCheck.heading);
    if (pageResult.ok) {
      writeResult(id, routeCheck.label, "PASS", `HTTP ${pageResult.status}`);
    } else {
      allPassed = false;
      writeResult(
        id,
        routeCheck.label,
        "FAIL",
        `HTTP ${pageResult.status} code=${routeCheck.reason ?? pageResult.reason}`,
      );
    }
  }
  return allPassed;
}

async function checkOrdinaryHuman(page) {
  const routeChecks = [
    { path: "/", heading: "本机行情连接，一眼看清。", label: "ordinary dashboard" },
    { path: "/login", heading: "恢复行情会话。", label: "ordinary QR page" },
    { path: "/updates", heading: "FQGate 更新中心", label: "ordinary updates page" },
    { path: "/api-reference", heading: "API Reference", label: "ordinary API reference" },
  ];
  const pagesPassed = await checkRoutes(page, ordinaryOrigin, routeChecks, "T4");

  await page.goto(`${ordinaryOrigin}/updates`, {
    timeout: REQUEST_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  let updatesButtonAbsent = false;
  try {
    updatesButtonAbsent =
      (await page.getByRole("button", { name: "检查更新", exact: true }).count()) === 0;
  } catch {
    updatesButtonAbsent = false;
  }
  writeResult(
    "T4",
    "ordinary updates controls remain read-only",
    updatesButtonAbsent ? "PASS" : "FAIL",
    updatesButtonAbsent ? "read-only UI" : "maintenance control visible",
  );

  const safeGets = [
    ["/api/v1/version", "ordinary bridge.version"],
    ["/api/v1/capabilities", "ordinary bridge.capabilities"],
    ["/api/v1/status", "ordinary bridge.status"],
    ["/api/v1/updates/status", "ordinary updates.status"],
    ["/api/v1/openapi/catalog", "ordinary openapi.catalog"],
  ];
  for (const [path, label] of safeGets) {
    const result = await requestJson(page, path);
    assertResponse("T4", label, result, 200);
  }

  let qrResult;
  try {
    qrResult = await page.evaluate(
      async ({ maxBytes, timeoutMs }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const beginResponse = await fetch("/api/v1/session/qr/begin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            credentials: "include",
            redirect: "manual",
            signal: controller.signal,
          });
          const begin = await readResponseSummary(beginResponse, maxBytes);
          if (beginResponse.status !== 200 || typeof begin.sessionId !== "string") {
            return { begin: { status: beginResponse.status, ...begin }, poll: undefined };
          }
          const pollResponse = await fetch("/api/v1/session/qr/poll", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: begin.sessionId }),
            credentials: "include",
            redirect: "manual",
            signal: controller.signal,
          });
          const poll = await readResponseSummary(pollResponse, maxBytes);
          return {
            begin: { status: beginResponse.status, ...begin },
            poll: { status: pollResponse.status, ...poll },
          };
        } catch {
          return { begin: { status: 0, code: "NETWORK_ERROR" }, poll: undefined };
        } finally {
          clearTimeout(timeout);
        }

        async function readResponseSummary(response, responseMaxBytes) {
          if (response.body === null) return {};
          const reader = response.body.getReader();
          const chunks = [];
          let total = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              total += next.value.byteLength;
              if (total > responseMaxBytes) {
                await reader.cancel();
                return { code: "RESPONSE_TOO_LARGE" };
              }
              chunks.push(next.value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          let value;
          try {
            value = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            return {};
          }
          if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
          const record = value;
          const error = record.error;
          const plan = record.plan;
          return {
            ...(typeof error === "object" && error !== null && typeof error.code === "string"
              ? { code: error.code }
              : {}),
            ...(typeof plan === "object" && plan !== null
              ? {
                  ...(typeof plan.planId === "string" ? { planId: plan.planId } : {}),
                  ...(typeof plan.action === "string" ? { action: plan.action } : {}),
                }
              : {}),
            ...(typeof record.sessionId === "string" ? { sessionId: record.sessionId } : {}),
            ...(typeof record.confirmationGrant === "string"
              ? { confirmationGrant: record.confirmationGrant }
              : {}),
            ...(typeof record.expiresAt === "string" ? { expiresAt: record.expiresAt } : {}),
          };
        }
      },
      { maxBytes: MAX_RESPONSE_BYTES, timeoutMs: REQUEST_TIMEOUT_MS },
    );
  } catch {
    qrResult = { begin: { status: 0, code: "BROWSER_EVALUATION_ERROR" } };
  }
  const qrPassed = qrResult?.begin?.status === 200 && qrResult?.poll?.status === 200;
  writeResult(
    "T4",
    "ordinary session.qr.begin/poll",
    qrPassed ? "PASS" : "FAIL",
    qrPassed
      ? "begin=HTTP 200 poll=HTTP 200; QR/session data remained in browser memory"
      : `begin=${statusDetail(qrResult?.begin)} poll=${statusDetail(qrResult?.poll)}`,
  );

  const maintenancePaths = [
    "/api/v1/updates/check",
    "/api/v1/updates/plan",
    "/api/v1/updates/apply",
    "/api/v1/openapi/refresh",
  ];
  for (const path of maintenancePaths) {
    const result = await requestJson(page, path, "POST", {});
    assertResponse("T5", `ordinary denied ${path}`, result, 403, "OPERATION_FORBIDDEN");
  }

  return pagesPassed;
}

async function checkAdmin(page) {
  const routeChecks = [
    { path: "/", heading: "本机行情连接，一眼看清。", label: "admin dashboard" },
    { path: "/login", heading: "恢复行情会话。", label: "admin QR page" },
    { path: "/updates", heading: "FQGate 更新中心", label: "admin updates page" },
    { path: "/api-reference", heading: "API Reference", label: "admin API reference" },
  ];
  await checkRoutes(page, adminOrigin, routeChecks, "T8");

  await page.goto(`${adminOrigin}/updates`, {
    timeout: REQUEST_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  let adminButtonVisible = false;
  try {
    adminButtonVisible =
      (await page.getByRole("button", { name: "管理员检查更新", exact: true }).count()) > 0;
  } catch {
    adminButtonVisible = false;
  }
  writeResult(
    "T8",
    "admin maintenance control is context-gated",
    adminButtonVisible ? "PASS" : "FAIL",
    adminButtonVisible ? "admin control visible after server context" : "admin control missing",
  );

  const safeGets = [
    ["/api/v1/version", "admin bridge.version"],
    ["/api/v1/capabilities", "admin bridge.capabilities"],
    ["/api/v1/status", "admin bridge.status"],
    ["/api/v1/updates/status", "admin updates.status"],
    ["/api/v1/openapi/catalog", "admin openapi.catalog"],
  ];
  for (const [path, label] of safeGets) {
    const result = await requestJson(page, path);
    assertResponse("T9", label, result, 200);
  }

  const check = await requestJson(page, "/api/v1/updates/check", "POST", {}, true);
  const plan = await requestJson(page, "/api/v1/updates/plan", "POST", {}, true);
  const refresh = await requestJson(page, "/api/v1/openapi/refresh", "POST", {}, true);
  const maintenancePassed = check.status === 200 && plan.status === 200 && refresh.status === 200;
  writeResult(
    "T10",
    "admin check/plan/openapi.refresh",
    maintenancePassed ? "PASS" : "FAIL",
    `check=${statusDetail(check)} plan=${statusDetail(plan)} refresh=${statusDetail(refresh)}`,
  );

  const planId = typeof plan.planId === "string" ? plan.planId : "plan-not-available";
  const noGrant = await requestJson(page, "/api/v1/updates/apply", "POST", { planId }, true);
  assertResponse(
    "T11",
    "admin apply without confirmation",
    noGrant,
    400,
    "ADMIN_CONFIRMATION_REQUIRED",
  );

  const activatable =
    planId !== "plan-not-available" && (plan.action === "install" || plan.action === "update");
  if (!activatable) {
    writeResult(
      "T11",
      "admin safe confirmation negatives",
      "SKIP",
      "NO_ACTIVATABLE_CANDIDATE; deterministic suite covers expiry/replay/principal/operation/plan/race",
    );
    return;
  }

  const prepared = await requestJson(
    page,
    "/api/v1/updates/apply",
    "POST",
    { planId, phase: "prepare" },
    true,
  );
  if (prepared.status !== 200 || typeof prepared.confirmationGrant !== "string") {
    writeResult("T11", "admin confirmation prepare", "FAIL", statusDetail(prepared));
    return;
  }

  const wrongPlan = await requestJson(
    page,
    "/api/v1/updates/apply",
    "POST",
    {
      planId: `${planId}-mismatch`,
      phase: "execute",
      confirmationGrant: prepared.confirmationGrant,
    },
    true,
  );
  assertResponse(
    "T11",
    "admin stale-plan mismatch without activation",
    wrongPlan,
    409,
    "UPDATE_CONFIRMATION_STALE",
  );

  const expiryGrant = await requestJson(
    page,
    "/api/v1/updates/apply",
    "POST",
    { planId, phase: "prepare" },
    true,
  );
  const expiryAt =
    typeof expiryGrant.expiresAt === "string" ? Date.parse(expiryGrant.expiresAt) : NaN;
  if (
    expiryGrant.status !== 200 ||
    typeof expiryGrant.confirmationGrant !== "string" ||
    !Number.isFinite(expiryAt)
  ) {
    writeResult("T11", "admin expiry prepare", "FAIL", statusDetail(expiryGrant));
    return;
  }
  const waitMs = expiryAt - Date.now() + 250;
  if (waitMs < 0 || waitMs > EXPIRY_WAIT_LIMIT_MS) {
    writeResult("T11", "admin expiry bound", "FAIL", "CONFIRMATION_TTL_OUT_OF_BOUNDS");
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const expired = await requestJson(
    page,
    "/api/v1/updates/apply",
    "POST",
    { planId, phase: "execute", confirmationGrant: expiryGrant.confirmationGrant },
    true,
  );
  assertResponse(
    "T11",
    "admin expired confirmation without activation",
    expired,
    409,
    "ADMIN_CONFIRMATION_EXPIRED",
  );
  const replay = await requestJson(
    page,
    "/api/v1/updates/apply",
    "POST",
    { planId, phase: "execute", confirmationGrant: expiryGrant.confirmationGrant },
    true,
  );
  assertResponse(
    "T11",
    "admin expired confirmation replay",
    replay,
    400,
    "ADMIN_CONFIRMATION_INVALID",
  );
}

async function checkForbiddenRoutes(page, origin, contextLabel) {
  const rawPaths = [
    "/v1/market/health",
    "/v1/market/session/qr/begin",
    "/api/v1/cloudflared/install",
    "/api/v1/cloudflared/service/restart",
    "/api/v1/cloudflare/provision",
    "/api/v1/process/stop",
    "/api/v1/bridge/update",
    "/api/v1/market/quotes",
    "/api/v1/trading/orders",
  ];
  let opened;
  try {
    opened = await page.goto(`${origin}/`, {
      timeout: REQUEST_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
  } catch {
    opened = null;
  }
  if (opened === null || opened.status() >= 400) {
    writeResult(
      "T14/T15",
      `${contextLabel} authenticated raw-route context`,
      "FAIL",
      `HTTP ${opened?.status() ?? 0} code=AUTHENTICATED_CONTEXT_LOAD`,
    );
    return;
  }
  for (const path of rawPaths) {
    const result = await requestJson(page, path);
    assertResponse("T14/T15", `${contextLabel} unregistered route ${path}`, result, 404);
  }
}

async function checkAuthenticatedViewportSmoke(page, origin, contextLabel) {
  const viewports = [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
  ];
  let allPassed = true;
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const route = await gotoPage(page, origin, "/updates", "FQGate 更新中心");
    const dimensions = route.ok
      ? await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
        }))
      : undefined;
    const passed =
      route.ok &&
      dimensions !== undefined &&
      dimensions.documentWidth <= dimensions.clientWidth &&
      dimensions.bodyWidth <= dimensions.clientWidth;
    allPassed = allPassed && passed;
    writeResult(
      "T17",
      `${contextLabel} authenticated viewport ${width}x${height}`,
      passed ? "PASS" : "FAIL",
      passed ? "no document overflow" : `HTTP ${route.status} code=VIEWPORT_OVERFLOW_OR_PAGE_LOAD`,
    );
  }
  return allPassed;
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    ...(browserChannel === "chromium" ? {} : { channel: browserChannel }),
  });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  try {
    const ordinaryOpened = await page.goto(`${ordinaryOrigin}/`, {
      timeout: REQUEST_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    writeResult(
      "AUTH",
      "ordinary host browser opened",
      ordinaryOpened !== null && ordinaryOpened.status() < 400 ? "PASS" : "FAIL",
      `HTTP ${ordinaryOpened?.status() ?? 0}`,
    );
    if (!(await waitForOperator("ordinary host"))) return;
    await checkOrdinaryHuman(page);

    const adminOpened = await page.goto(`${adminOrigin}/`, {
      timeout: REQUEST_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    writeResult(
      "AUTH",
      "admin host browser opened",
      adminOpened !== null && adminOpened.status() < 400 ? "PASS" : "MANUAL",
      `HTTP ${adminOpened?.status() ?? 0}`,
    );
    if (!(await waitForOperator("admin host"))) return;
    await checkAdmin(page);
    await checkForbiddenRoutes(page, ordinaryOrigin, "ordinary");
    await checkForbiddenRoutes(page, adminOrigin, "admin");
    await checkAuthenticatedViewportSmoke(page, ordinaryOrigin, "ordinary");
    await checkAuthenticatedViewportSmoke(page, adminOrigin, "admin");
  } finally {
    await context.close();
    await browser.close();
  }
}

try {
  await main();
} catch {
  writeResult("AUTH", "authenticated browser harness", "FAIL", "BROWSER_HARNESS_ERROR");
}

if (failureCount > 0) process.exitCode = 1;
