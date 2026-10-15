import process from "node:process";
import { TextDecoder } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../dist/config/config.js";
import { createFqgateLayout } from "../../dist/fqgate/install/layout.js";
import { ChildProcessRunner } from "../../dist/fqgate/process/runner.js";
import { FetchHttpTransport } from "../../dist/fqgate/release/http.js";
import { FqgateV2QrAdapter } from "../../dist/bridge/qr/v2.js";
import { verifyV2QrIdentity } from "../../dist/bridge/qr/v2-identity.js";
import { verifyInstalledQrClient } from "../../dist/fqgate/diagnostics/qr-contract.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2),
  option = (k) => argv[argv.indexOf(k) + 1];
const gates = [],
  utc = new Date().toISOString(),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const add = (id, status, reason) => gates.push({ id, status, reason });
const known = new Set([
  "PROCESS_IDENTITY_MISMATCH",
  "FQGATE_INCOMPATIBLE",
  "OPENAPI_CONTRACT_MISSING",
  "QR_FLOW_EXPIRED",
  "QR_FLOW_REPLACED",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_RESPONSE_INVALID",
]);
let browser,
  context,
  evidenceDirectory,
  gitSha = "unknown",
  liveQrStarted = false,
  passed = false,
  browserVersion = "NOT_EXECUTED";
try {
  if (
    process.platform !== "win32" ||
    argv.length !== 6 ||
    argv.filter((_, i) => i % 2 === 0).join() !== "--config,--evidence,--allow-live"
  )
    throw Error("ARGUMENTS_INVALID");
  evidenceDirectory = resolve(option("--evidence"));
  const rel = relative(root, evidenceDirectory);
  if (!rel || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)))
    throw Error("EVIDENCE_MUST_BE_EXTERNAL");
  if (option("--allow-live") !== "True") {
    add("LIVE_QR", "NOT_EXECUTED", "EXPLICIT_APPROVAL_ABSENT");
  } else {
    const config = await loadConfig(option("--config")),
      layout = createFqgateLayout(config.installDirectory),
      runner = new ChildProcessRunner(),
      http = new FetchHttpTransport();
    const git = await runner.run(
      "git.exe",
      ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "rev-parse", "HEAD"],
      { timeoutMs: 5000, maxOutputBytes: 1024 },
    );
    if (git.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim()))
      throw Error("BUILD_SHA_UNAVAILABLE");
    gitSha = git.stdout.trim();
    const preflight = await runner.run(
      process.execPath,
      [
        resolve(root, "scripts/windows/fqgate205-qr-preflight.mjs"),
        "--config",
        option("--config"),
        "--evidence",
        evidenceDirectory,
        "--mode",
        "Preflight",
        "--allow-live",
        "False",
      ],
      { timeoutMs: 60000, maxOutputBytes: 131072 },
    );
    if (preflight.exitCode !== 0 || preflight.timedOut || preflight.truncated)
      throw Error("PREFLIGHT_NOT_READY");
    add("PREFLIGHT", "PASS", "ALL_READONLY_GATES_PASSED");
    const versionResponse = await http.request("http://127.0.0.1:17282/api/v1/version", {
      method: "GET",
      redirect: "error",
      timeoutMs: 5000,
      maxBytes: 4096,
    });
    const version = JSON.parse(
      new TextDecoder("utf8", { fatal: true }).decode(versionResponse.body),
    );
    if (versionResponse.status !== 200 || version.commit !== gitSha)
      throw Error("RUNNING_BRIDGE_BUILD_MISMATCH");
    add("RUNNING_BUILD", "PASS", "EXACT_CHECKOUT_BUILD");
    await verifyInstalledQrClient(layout.currentExecutable);
    const adapter = new FqgateV2QrAdapter({
      http,
      identity: () => verifyV2QrIdentity(layout, runner),
      ...(config.qrV2 === undefined ? {} : { instanceNumber: config.qrV2.instanceNumber }),
    });
    const before = await adapter.inspect();
    add("READINESS", "PASS", "EXACT_PROCESS_CONTRACT_UNIQUE_TARGET");
    process.stdout.write(
      JSON.stringify({
        id: "LIVE_WARNING",
        utc: new Date().toISOString(),
        selectedClassification: before.source.connected
          ? "EXISTING_CONNECTED_TARGET"
          : "DISCONNECTED_TARGET",
        mayReplaceSelectedLogin: true,
        mayCreateSecondConnectedSource: !before.source.connected,
        qrSaved: false,
      }) + "\n",
    );
    delete process.env.DEBUG;
    delete process.env.PWDEBUG;
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({ headless: false });
    browserVersion = browser.version();
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
    const page = await context.newPage();
    let sessionId,
      deadline = Date.now() + 120000,
      terminal,
      connected = false,
      pollCount = 0;
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== "http://127.0.0.1:17282") {
        terminal = "UNEXPECTED_BROWSER_ORIGIN";
        await route.abort();
        return;
      }
      if (req.method() === "POST") {
        if (
          url.pathname !== "/api/v1/session/qr/begin" &&
          url.pathname !== "/api/v1/session/qr/poll"
        ) {
          terminal = "UNEXPECTED_BROWSER_MUTATION";
          await route.abort();
          return;
        }
        if (url.pathname.endsWith("/poll")) {
          let body;
          try {
            body = req.postDataJSON();
          } catch {
            terminal = "INVALID_POLL_REQUEST";
            await route.abort();
            return;
          }
          for (let attempt = 0; !sessionId && !terminal && attempt < 50; attempt++)
            await delay(100);
          if (
            !sessionId ||
            body.sessionId !== sessionId ||
            Object.keys(body).join() !== "sessionId"
          ) {
            terminal = "FLOW_IDENTITY_MISMATCH";
            await route.abort();
            return;
          }
        } else if (liveQrStarted) {
          terminal = "UNEXPECTED_SECOND_BEGIN";
          await route.abort();
          return;
        } else liveQrStarted = true;
      }
      await route.continue();
    });
    page.on("response", (response) => {
      void (async () => {
        const path = new URL(response.url()).pathname;
        if (path !== "/api/v1/session/qr/begin" && path !== "/api/v1/session/qr/poll") return;
        const value = await response.json();
        if (response.status() !== 200) {
          terminal = known.has(value?.code) ? value.code : "LIVE_BRIDGE_REQUEST_FAILED";
          return;
        }
        if (path.endsWith("/begin")) {
          if (
            typeof value.sessionId !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
              value.sessionId,
            ) ||
            !Number.isFinite(Date.parse(value.expiresAt))
          ) {
            terminal = "INVALID_BRIDGE_SESSION";
            return;
          }
          sessionId = value.sessionId;
          deadline = Math.min(deadline, Date.parse(value.expiresAt));
        } else {
          pollCount++;
          if (value.sessionId !== sessionId || pollCount > 80) {
            terminal = "FLOW_IDENTITY_MISMATCH";
            return;
          }
          if (value.connected === true && value.status === "connected") connected = true;
          else if (
            value.connected !== false ||
            !["waiting_for_scan", "waiting_for_confirmation"].includes(value.status)
          )
            terminal = "INVALID_BRIDGE_POLL";
        }
      })().catch(() => {
        terminal = "LIVE_RESPONSE_UNVERIFIED";
      });
    });
    await page.goto("http://127.0.0.1:17282/login", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.getByRole("button", { name: "生成 QR 码", exact: true }).click({ timeout: 15000 });
    while (!connected && !terminal && Date.now() < deadline) {
      if (page.isClosed()) {
        terminal = "OPERATOR_CANCELLED";
        break;
      }
      if (
        sessionId &&
        (await page
          .getByRole("button", { name: "生成 QR 码", exact: true })
          .isVisible()
          .catch(() => false))
      ) {
        terminal = "OPERATOR_CANCELLED";
        break;
      }
      await delay(250);
    }
    await context.close();
    context = undefined;
    if (terminal || !connected) throw Error(terminal ?? "LIVE_QR_TIMEOUT");
    const after = await adapter.inspect();
    if (
      after.process !== before.process ||
      after.source.worker !== before.source.worker ||
      !after.source.connected ||
      after.source.session !== "connected"
    )
      throw Error("POST_LOGIN_IDENTITY_OR_SESSION_MISMATCH");
    for (const [id, args] of [
      [
        "POST_LOGIN_LOCAL_LOOKUP",
        [
          resolve(root, "scripts/windows/fqgate205-readonly-probe.mjs"),
          "--config",
          option("--config"),
        ],
      ],
      ["POST_LOGIN_LOCAL_MATRIX", [resolve(root, "scripts/windows/phase5c-matrix.mjs"), "--local"]],
    ]) {
      const check = await runner.run(process.execPath, args, {
        timeoutMs: 60000,
        maxOutputBytes: 16384,
      });
      if (check.exitCode !== 0 || check.timedOut || check.truncated)
        throw Error("POST_LOGIN_REGRESSION_FAILED");
      add(id, "PASS", "READONLY_REGRESSION_EXIT_ZERO");
    }
    add("LIVE_QR", "PASS", "EXACT_BRIDGE_FLOW_CONNECTED");
    add("POST_LOGIN_IDENTITY", "PASS", "SAME_SOURCE_WORKER_PROCESS_CONNECTED");
    passed = true;
  }
} catch (error) {
  const safe = new Set([
    ...known,
    "ARGUMENTS_INVALID",
    "EVIDENCE_MUST_BE_EXTERNAL",
    "BUILD_SHA_UNAVAILABLE",
    "PREFLIGHT_NOT_READY",
    "POST_LOGIN_REGRESSION_FAILED",
    "RUNNING_BRIDGE_BUILD_MISMATCH",
    "UNEXPECTED_BROWSER_ORIGIN",
    "UNEXPECTED_BROWSER_MUTATION",
    "INVALID_POLL_REQUEST",
    "FLOW_IDENTITY_MISMATCH",
    "UNEXPECTED_SECOND_BEGIN",
    "LIVE_BRIDGE_REQUEST_FAILED",
    "INVALID_BRIDGE_SESSION",
    "INVALID_BRIDGE_POLL",
    "LIVE_RESPONSE_UNVERIFIED",
    "OPERATOR_CANCELLED",
    "LIVE_QR_TIMEOUT",
    "POST_LOGIN_IDENTITY_OR_SESSION_MISMATCH",
  ]);
  const code = known.has(error?.code)
    ? error.code
    : safe.has(error?.message)
      ? error.message
      : "LIVE_AUTOMATION_UNAVAILABLE";
  add("LIVE_QR", liveQrStarted ? "BLOCKED" : "NOT_EXECUTED", code);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
const report = {
  schemaVersion: 1,
  utc,
  gitSha,
  environment: { platform: process.platform, node: process.version, browserVersion },
  command: "fqgate205-qr-acceptance.ps1 -Mode Live",
  exitCode: passed ? 0 : 1,
  liveQrStarted,
  humanApproval: option("--allow-live") === "True" ? "EXPLICIT_FLAG" : "NOT_COLLECTED",
  humanScan: passed ? "CONNECTED_OBSERVED_NO_INDEPENDENT_MFA_ATTESTATION" : "NOT_PROVEN",
  qrOrSessionMaterialSaved: false,
  gates,
  totals: {
    total: gates.length,
    passed: gates.filter((g) => g.status === "PASS").length,
    blocked: gates.filter((g) => g.status === "BLOCKED").length,
    notExecuted: gates.filter((g) => g.status === "NOT_EXECUTED").length,
  },
  retry: String.raw`Set-Location D:\code\research\fqgate-remote-bridge; powershell.exe -NoProfile -File .\scripts\windows\fqgate205-qr-acceptance.ps1 -Mode Preflight -Config D:\code\research\fqgate-acceptance-config.json`,
};
let saved = false;
try {
  if (!evidenceDirectory) throw Error();
  await mkdir(evidenceDirectory, { recursive: true });
  const name = `live-${Date.now()}.json`,
    bytes = JSON.stringify(report, null, 2) + "\n";
  await writeFile(resolve(evidenceDirectory, name), bytes, { flag: "wx" });
  await writeFile(resolve(evidenceDirectory, `${name}.sha256`), hash(bytes) + "\n", { flag: "wx" });
  saved = true;
  process.stdout.write(
    JSON.stringify({ ...report, receiptFile: name, receiptSha256: hash(bytes) }) + "\n",
  );
} catch {
  process.stdout.write(JSON.stringify({ ...report, receiptSaved: false }) + "\n");
}
process.exitCode = saved ? report.exitCode : 2;
