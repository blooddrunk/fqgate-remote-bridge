import { request as nativeRequest } from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { FetchHttpTransport, decodeResponseText } from "../../dist/fqgate/release/http.js";
import { listBridgeOperations } from "../../dist/bridge/policy/registry.js";
import { MACHINE_OPENAPI_MAX_BYTES } from "../../dist/bridge/openapi/machine.js";

const local = process.argv.includes("--local");
const results = [];
const http = new FetchHttpTransport();
const allowedErrors = new Set([
  "OPERATION_FORBIDDEN",
  "ACCESS_ASSERTION_REQUIRED",
  "ACCESS_ASSERTION_INVALID",
  "HOST_NOT_ALLOWED",
  "REQUEST_INVALID",
  "REQUEST_TOO_LARGE",
  "ROUTE_NOT_FOUND",
  "LOGIN_REQUIRED",
  "MARKET_PERMISSION_REQUIRED",
  "FQGATE_INCOMPATIBLE",
  "COMPATIBILITY_PROBE_FAILED",
  "OPENAPI_CONTRACT_MISSING",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_RESPONSE_INVALID",
]);
const challenges = new Set([302, 303, 307, 308, 401, 403]);
const credentialHeaders = local
  ? {}
  : {
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET,
    };

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function baseUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("HOST_CONFIG_INVALID");
  return url.origin;
}

function emit(id, pass, metadata = {}) {
  results.push(pass);
  process.stdout.write(
    JSON.stringify({
      id,
      result: pass ? "PASS" : "FAIL",
      ...metadata,
      host: local ? "local" : "remote",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
}

function validLookup(value) {
  return (
    value &&
    Object.keys(value).join(",") === "items" &&
    Array.isArray(value.items) &&
    value.items.length >= 1 &&
    value.items.length <= 16 &&
    value.items.every(
      (item) =>
        item &&
        Object.keys(item).sort().join(",") === "code,instrumentId,market,name" &&
        item.code === "600000" &&
        typeof item.market === "string" &&
        item.market.length <= 16 &&
        typeof item.name === "string" &&
        item.name.length <= 128 &&
        typeof item.instrumentId === "string" &&
        item.instrumentId.length <= 32,
    )
  );
}

function validMachineDocument(value, bytes) {
  if (!value || bytes > MACHINE_OPENAPI_MAX_BYTES) return false;
  const paths = Object.keys(value.paths ?? {});
  const schemas = Object.keys(value.components?.schemas ?? {});
  const text = JSON.stringify(value);
  return (
    value.openapi === "3.1.0" &&
    paths.join(",") === "/api/v1/instruments/lookup,/api/v1/openapi/machine" &&
    value.paths?.["/api/v1/instruments/lookup"]?.post?.operationId ===
      "market.instruments.lookup" &&
    value.paths?.["/api/v1/openapi/machine"]?.get?.operationId === "openapi.machine" &&
    schemas.join(",") ===
      "BridgeError,InstrumentLookupItem,InstrumentLookupRequest,InstrumentLookupResponse,MachineOpenApiDocument" &&
    ![
      "/v1/market/",
      "session.qr",
      "updates.",
      "openapi.refresh",
      "fingerprint",
      "teamDomain",
      "audience",
      "clientSecret",
      "127.0.0.1:17281",
    ].some((forbidden) => text.includes(forbidden))
  );
}

async function check(id, origin, path, method, body, expected, headers = credentialHeaders) {
  let status = 0;
  let code = "HARNESS_ERROR";
  let routeCount;
  let schemaCount;
  let count;
  let pass = false;
  let attempts = 0;
  const maximumAttempts = !local && expected === "document" ? 2 : 1;
  while (attempts < maximumAttempts && !pass) {
    attempts += 1;
    try {
      const response = await http.request(`${origin}${path}`, {
        method,
        timeoutMs: 20000,
        maxBytes: MACHINE_OPENAPI_MAX_BYTES,
        redirect: "manual",
        headers: { ...headers, "content-type": "application/json" },
        ...(body === undefined ? {} : { body }),
      });
      status = response.status;
      let value;
      try {
        value = JSON.parse(decodeResponseText(response));
      } catch {
        value = undefined;
      }
      code = allowedErrors.has(value?.error?.code) ? value.error.code : "NO_BRIDGE_ERROR";
      if (expected === "document") {
        pass = status === 200 && validMachineDocument(value, response.body.byteLength);
        if (pass) {
          routeCount = Object.keys(value.paths).length;
          schemaCount = Object.keys(value.components.schemas).length;
        }
      } else if (expected === "lookup") {
        pass = status === 200 && validLookup(value);
        if (pass) count = value.items.length;
      } else if (expected === "challenge") pass = challenges.has(status);
      else
        pass =
          status === expected.status && (expected.code === undefined || code === expected.code);
    } catch {
      // Never emit exception text, response bodies, headers, or credentials.
    }
    const retryColdJwkFetch =
      !pass && attempts < maximumAttempts && status === 403 && code === "ACCESS_ASSERTION_INVALID";
    if (!retryColdJwkFetch) break;
    await delay(250);
  }
  emit(id, pass, {
    status,
    code,
    attempts,
    ...(routeCount === undefined ? {} : { routeCount }),
    ...(schemaCount === undefined ? {} : { schemaCount }),
    ...(count === undefined ? {} : { count }),
  });
}

async function checkLocalHostSpoof(origin) {
  const status = await new Promise((resolve) => {
    const request = nativeRequest(
      `${origin}/api/v1/openapi/machine`,
      {
        method: "GET",
        headers: { host: "unknown.example.com", "x-forwarded-host": "127.0.0.1:17282" },
        timeout: 5000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(0));
    request.end();
  });
  emit("P5C-L7", status === 421, {
    status,
    code: status === 421 ? "HOST_NOT_ALLOWED" : "NO_BRIDGE_ERROR",
  });
}

try {
  if (
    !local &&
    (!credentialHeaders["CF-Access-Client-Id"] || !credentialHeaders["CF-Access-Client-Secret"])
  )
    throw new Error("SECRET_ENTRY_REQUIRED");
  const origin = local ? "http://127.0.0.1:17282" : baseUrl(option("--machine-url"));
  const prefix = local ? "P5C-L" : "P5C-R";
  if (!local)
    await check(`${prefix}1`, origin, "/api/v1/openapi/machine", "GET", undefined, "challenge", {});
  await check(`${prefix}2`, origin, "/api/v1/openapi/machine", "GET", undefined, "document");
  await check(
    `${prefix}3`,
    origin,
    "/api/v1/instruments/lookup",
    "POST",
    '{"code":"600000"}',
    "lookup",
  );
  await check(
    `${prefix}4`,
    origin,
    "/api/v1/instruments/lookup",
    "POST",
    '{"code":"600000","path":"/arbitrary"}',
    { status: 400, code: "REQUEST_INVALID" },
  );
  await check(`${prefix}5`, origin, "/api/v1/instruments/lookup", "POST", " ".repeat(257), {
    status: 413,
    code: "REQUEST_TOO_LARGE",
  });
  await check(`${prefix}6`, origin, "/v1/market/health", "GET", undefined, {
    status: local ? 404 : 403,
    ...(local ? {} : { code: "OPERATION_FORBIDDEN" }),
  });
  if (local) await checkLocalHostSpoof(origin);
  else {
    for (const operation of listBridgeOperations().filter(
      (candidate) =>
        !candidate.allowedContexts.includes("remote_machine") && candidate.id !== "updates.apply",
    )) {
      await check(
        `${prefix}-deny-${operation.id}`,
        origin,
        operation.path,
        operation.method,
        operation.method === "POST" ? '{"phase5cDenialProbe":true}' : undefined,
        { status: 403, code: "OPERATION_FORBIDDEN" },
      );
    }
    for (const path of ["/", "/assets/probe.js", "/api/v1/unregistered"])
      await check(`${prefix}-page-${path}`, origin, path, "GET", undefined, {
        status: 403,
        code: "OPERATION_FORBIDDEN",
      });
    for (const label of ["human", "admin"]) {
      const target = baseUrl(option(`--${label}-url`));
      await check(`${prefix}-${label}`, target, "/api/v1/version", "GET", undefined, "challenge");
    }
  }
} catch {
  emit("P5C-MATRIX", false, { status: 0, code: "HARNESS_CONFIGURATION_OR_SECRET_ENTRY_REQUIRED" });
} finally {
  const passed = results.filter(Boolean).length;
  process.stdout.write(
    JSON.stringify({
      id: "P5C-SUMMARY",
      result: passed === results.length ? "PASS" : "FAIL",
      total: results.length,
      passed,
      failed: results.length - passed,
      host: local ? "local" : "remote",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
  delete process.env.CF_ACCESS_CLIENT_ID;
  delete process.env.CF_ACCESS_CLIENT_SECRET;
  for (const key of Object.keys(credentialHeaders)) delete credentialHeaders[key];
  if (passed !== results.length) process.exitCode = 1;
}
