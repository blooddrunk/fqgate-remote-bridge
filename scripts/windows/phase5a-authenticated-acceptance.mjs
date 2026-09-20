/* global AbortController, clearTimeout, console, fetch, setTimeout, TextDecoder */

import process from "node:process";

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TRANSIENT_ATTEMPTS = 3;
const TRANSIENT_RETRY_DELAY_MS = 750;
const ACCESS_CHALLENGE_STATUSES = new Set([302, 303, 307, 308, 401, 403]);
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

if (
  typeof clientId !== "string" ||
  clientId.length === 0 ||
  typeof clientSecret !== "string" ||
  clientSecret.length === 0
) {
  console.error(
    "Phase 5-A service-token credentials were not provided through the hidden environment boundary.",
  );
  process.exitCode = 2;
} else {
  const args = parseArguments(process.argv.slice(2));
  const results = [];
  const machineUrl = normalizeBaseUrl(args.machineUrl, "machine");
  const humanUrl = normalizeOptionalBaseUrl(args.humanUrl, "human");
  const adminUrl = normalizeOptionalBaseUrl(args.adminUrl, "admin");
  const machineHeaders = {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };

  await record(
    results,
    "P5A-R1",
    "machine hostname without service credential is challenged",
    async () => {
      const response = await request("GET", `${machineUrl}/api/v1/version`);
      return expectAccessChallenge(response);
    },
    machineUrl,
  );

  await record(
    results,
    "P5A-R2",
    "valid service credential reaches Bridge and remains zero privilege",
    async () => {
      const response = await request("GET", `${machineUrl}/api/v1/version`, machineHeaders);
      return expectBridgeForbidden(response);
    },
    machineUrl,
  );

  await record(
    results,
    "P5A-R3",
    "machine raw FQGate path is unavailable",
    async () => {
      const response = await request("GET", `${machineUrl}/v1/market/health`, machineHeaders);
      return expectMachineRouteDenied(response);
    },
    machineUrl,
  );

  if (humanUrl !== undefined) {
    await record(
      results,
      "P5A-R4",
      "machine credential cannot obtain ordinary-human privilege",
      async () => {
        const response = await request("GET", `${humanUrl}/api/v1/version`, machineHeaders);
        return expectAccessChallenge(response);
      },
      humanUrl,
    );
  } else {
    results.push(
      result(
        "P5A-R4",
        "machine credential cannot obtain ordinary-human privilege",
        "SKIP",
        0,
        "human hostname not configured",
        "human",
      ),
    );
  }

  if (adminUrl !== undefined) {
    await record(
      results,
      "P5A-R5",
      "machine credential cannot obtain remote-admin privilege",
      async () => {
        const response = await request("GET", `${adminUrl}/api/v1/version`, machineHeaders);
        return expectAccessChallenge(response);
      },
      adminUrl,
    );
  } else {
    results.push(
      result(
        "P5A-R5",
        "machine credential cannot obtain remote-admin privilege",
        "SKIP",
        0,
        "admin hostname not configured",
        "admin",
      ),
    );
  }

  await record(
    results,
    "P5A-R6",
    "machine hostname reaches Bridge origin rather than FQGate",
    async () => {
      const response = await request("GET", `${machineUrl}/v1/market/health`, machineHeaders);
      return expectMachineRouteDenied(response);
    },
    machineUrl,
  );

  for (const item of results) {
    const code = item.code === "" ? "-" : item.code;
    console.log(
      `[${item.state}] ${item.id} - ${item.name}: HTTP ${item.status}; code=${code}; host=${item.host}`,
    );
  }

  if (results.some((item) => item.state === "FAIL")) process.exitCode = 1;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) {
      throw new Error("Phase 5-A harness arguments are invalid");
    }
    values.set(key.slice(2), argv[index + 1]);
    index += 1;
  }
  if (!values.has("machine-url")) throw new Error("--machine-url is required");
  return {
    machineUrl: values.get("machine-url"),
    humanUrl: values.get("human-url"),
    adminUrl: values.get("admin-url"),
  };
}

function normalizeBaseUrl(value, label) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error(
      `${label} hostname must be an HTTPS origin without credentials, path, query, or fragment`,
    );
  }
  return parsed.origin;
}

function normalizeOptionalBaseUrl(value, label) {
  return value === undefined || value === "" ? undefined : normalizeBaseUrl(value, label);
}

async function record(results, id, name, operation, hostUrl) {
  try {
    const outcome = await operation();
    results.push(
      result(id, name, outcome.state, outcome.status, outcome.code, new URL(hostUrl).hostname),
    );
  } catch {
    results.push(result(id, name, "FAIL", 0, "HARNESS_ERROR", new URL(hostUrl).hostname));
  }
}

function result(id, name, state, status, code, host) {
  return { id, name, state, status, code, host };
}

async function request(method, url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method,
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      const body = await readBoundedText(response);
      const result = { status: response.status, code: readErrorCode(body) };
      if (!TRANSIENT_STATUSES.has(result.status) || attempt + 1 === MAX_TRANSIENT_ATTEMPTS) {
        return result;
      }
    } catch (error) {
      lastError = error;
      if (attempt + 1 === MAX_TRANSIENT_ATTEMPTS) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
  }
  throw lastError ?? new Error("bounded request retry exhausted");
}

async function readBoundedText(response) {
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    return "";
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) return "";
      chunks.push(item.value);
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
  return new TextDecoder().decode(bytes);
}

function readErrorCode(body) {
  if (body === "") return "";
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.error?.code === "string" && parsed.error.code.length <= 64
      ? parsed.error.code
      : "";
  } catch {
    return "";
  }
}

function expectAccessChallenge(response) {
  return ACCESS_CHALLENGE_STATUSES.has(response.status) && response.status !== 200
    ? { state: "PASS", status: response.status, code: response.code }
    : { state: "FAIL", status: response.status, code: response.code || "ACCESS_NOT_REJECTED" };
}

function expectBridgeForbidden(response) {
  return response.status === 403 && response.code === "OPERATION_FORBIDDEN"
    ? { state: "PASS", status: response.status, code: response.code }
    : {
        state: "FAIL",
        status: response.status,
        code: response.code || "BRIDGE_NOT_REACHED_OR_PRIVILEGE_GRANTED",
      };
}

function expectMachineRouteDenied(response) {
  return (response.status === 403 && response.code === "OPERATION_FORBIDDEN") ||
    response.status === 404
    ? { state: "PASS", status: response.status, code: response.code }
    : { state: "FAIL", status: response.status, code: response.code || "RAW_ROUTE_REACHED" };
}
