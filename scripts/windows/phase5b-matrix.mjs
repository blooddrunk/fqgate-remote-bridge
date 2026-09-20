import process from "node:process";
import { FetchHttpTransport, decodeResponseText } from "../../dist/fqgate/release/http.js";
import { listBridgeOperations } from "../../dist/bridge/policy/registry.js";

// Shared local/remote shape check; credentials never enter output or argv.
const local = process.argv.includes("--local");
function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
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
  "OPENAPI_CONTRACT_MISSING",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_RESPONSE_INVALID",
]);
const challenges = new Set([302, 303, 307, 308, 401, 403]);
const headers = local
  ? {}
  : {
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET,
    };

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
function validShape(value) {
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
        /^[A-Za-z0-9_]{1,16}$/.test(item.market) &&
        typeof item.name === "string" &&
        item.name.length >= 1 &&
        item.name.length <= 128 &&
        !/[\p{Cc}\p{Cf}]/u.test(item.name) &&
        typeof item.instrumentId === "string" &&
        /^[A-Za-z0-9_.-]{1,32}$/.test(item.instrumentId),
    )
  );
}
async function check(id, origin, path, method, body, expected, customHeaders = headers) {
  let status = 0;
  let code = "HARNESS_ERROR";
  let count;
  let pass = false;
  try {
    // Manual redirects preserve Access challenges; the shared transport bounds
    // the complete body and deadline without forwarding credentials on redirects.
    const response = await http.request(`${origin}${path}`, {
      method,
      timeoutMs: 20000,
      maxBytes: 65536,
      redirect: "manual",
      headers: { ...customHeaders, "content-type": "application/json" },
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
    if (expected === "success") {
      pass = status === 200 && validShape(value);
      if (pass) count = value.items.length;
    } else if (expected === "challenge") pass = challenges.has(status);
    else pass = status === expected.status && code === expected.code;
  } catch {
    /* output never contains an exception/body/header */
  }
  results.push(pass);
  process.stdout.write(
    JSON.stringify({
      id,
      result: pass ? "PASS" : "FAIL",
      status,
      code,
      ...(count === undefined ? {} : { count }),
      host: local ? "local" : "remote",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
}
try {
  if (!local && (!headers["CF-Access-Client-Id"] || !headers["CF-Access-Client-Secret"]))
    throw new Error("SECRET_ENTRY_REQUIRED");
  const origin = local ? "http://127.0.0.1:17282" : baseUrl(option("--machine-url"));
  const prefix = local ? "P5B-L" : "P5B-R";
  if (!local)
    await check(
      `${prefix}1`,
      origin,
      "/api/v1/instruments/lookup",
      "POST",
      '{"code":"600000"}',
      "challenge",
      {},
    );
  await check(
    `${prefix}2`,
    origin,
    "/api/v1/instruments/lookup",
    "POST",
    '{"code":"600000"}',
    "success",
  );
  await check(
    `${prefix}3`,
    origin,
    "/api/v1/instruments/lookup",
    "POST",
    '{"code":"600000","path":"/arbitrary"}',
    { status: 400, code: "REQUEST_INVALID" },
  );
  await check(`${prefix}4`, origin, "/api/v1/instruments/lookup", "POST", " ".repeat(257), {
    status: 413,
    code: "REQUEST_TOO_LARGE",
  });
  await check(`${prefix}5`, origin, "/v1/market/health", "GET", undefined, {
    status: local ? 404 : 403,
    code: local ? "ROUTE_NOT_FOUND" : "OPERATION_FORBIDDEN",
  });
  if (local)
    await check(
      `${prefix}6`,
      origin,
      "/api/v1/version",
      "GET",
      undefined,
      { status: 421, code: "HOST_NOT_ALLOWED" },
      { host: "unknown.example.com", "x-forwarded-host": "127.0.0.1:17282" },
    );
  else {
    // Invalid bodies additionally prevent side effects if authorization regresses.
    // Never live-call updates.apply; its complete denial is deterministic evidence.
    for (const operation of listBridgeOperations().filter(
      (o) => o.id !== "market.instruments.lookup" && o.id !== "updates.apply",
    ))
      await check(
        `${prefix}-deny-${operation.id}`,
        origin,
        operation.path,
        operation.method,
        operation.method === "POST" ? '{"phase5bDenialProbe":true}' : undefined,
        { status: 403, code: "OPERATION_FORBIDDEN" },
      );
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
  if (results.some((pass) => !pass)) process.exitCode = 1;
} catch {
  process.stdout.write("P5B-MATRIX FAIL HARNESS_CONFIGURATION_OR_SECRET_ENTRY_REQUIRED\n");
  process.exitCode = 2;
} finally {
  delete process.env.CF_ACCESS_CLIENT_ID;
  delete process.env.CF_ACCESS_CLIENT_SECRET;
  for (const key of Object.keys(headers)) delete headers[key];
}
