import { fingerprintJson } from "../openapi/catalog.js";
import { operationContractFingerprint } from "../market/contract.js";
import type { HttpTransport } from "../release/http.js";

import { QR_CENSUS_CONTRACTS, V2_QR_FINGERPRINT } from "./qr-contract.js";
export { QR_CENSUS_CONTRACTS } from "./qr-contract.js";
// Observation only. No value from this module grants QR compatibility or mutation authority.
export interface QrDiagnosticGate {
  readonly id: string;
  readonly status: "PASS" | "BLOCKED" | "NOT_EXECUTED";
  readonly reason: string;
  readonly evidence: Readonly<Record<string, string | number | boolean>>;
  readonly impact: string;
  readonly recovery: string;
}
const AUTH = "/v2/source-instances/{instance_id}/authentication";
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
  return value as Record<string, unknown>;
}
const STATES = new Set(["connected", "disconnected", "unknown", "not_applicable"]);
const MODES = new Set(["guest", "local_client", "app_qr", "sms_code", "username_password"]);
function safeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

/** Fixed GET-only census. Raw source/account/OpenAPI values never leave this function. */
export async function inspectQrPrerequisites(options: {
  readonly http: HttpTransport;
  readonly nowMs?: () => number;
  readonly staticClientVerified?: boolean;
  readonly instanceNumber?: number;
}): Promise<readonly QrDiagnosticGate[]> {
  const gates: QrDiagnosticGate[] = [];
  const add = (
    id: string,
    status: QrDiagnosticGate["status"],
    reason: string,
    evidence: QrDiagnosticGate["evidence"] = {},
    recovery = "Repeat Preflight after independently resolving this prerequisite; no automatic repair.",
  ) => gates.push({ id, status, reason, evidence, impact: "v2 QR remains unavailable.", recovery });
  const now = options.nowMs ?? Date.now;
  const deadline = now() + 15_000;
  const get = async (path: string, maxBytes = 65_536) => {
    const remaining = Math.min(5_000, deadline - now());
    if (remaining <= 0) throw Error();
    const response = await options.http.request(`http://127.0.0.1:17281${path}`, {
      method: "GET",
      redirect: "error",
      timeoutMs: remaining,
      maxBytes,
      headers: { accept: "application/json", "X-Request-Timeout-Ms": String(remaining) },
    });
    if (now() >= deadline || response.status !== 200 || response.body.byteLength > maxBytes)
      throw Error();
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)));
  };
  let before: string | undefined;
  const sourceSnapshot = async () => {
    const inventory = await get("/v2/source-instances");
    if (!Array.isArray(inventory.instances) || inventory.instances.length > 16) throw Error();
    const seen = new Set<string>();
    const sources = inventory.instances.map((v: unknown) => {
      const s = record(v);
      if (
        typeof s.instanceId !== "string" ||
        !/^[A-Za-z0-9_+=.-]{1,128}$/.test(s.instanceId) ||
        [".", ".."].includes(s.instanceId) ||
        seen.has(s.instanceId) ||
        typeof s.providerId !== "string" ||
        s.providerId.length > 128 ||
        !safeInteger(s.pid) ||
        s.pid === 0 ||
        !safeInteger(s.instanceNo) ||
        !safeInteger(s.restartCount) ||
        s.workerState !== "ready" ||
        !STATES.has(String(record(s.session).state)) ||
        typeof record(s.session).state !== "string"
      )
        throw Error();
      seen.add(s.instanceId);
      return {
        id: s.instanceId,
        provider: s.providerId,
        pid: s.pid,
        number: s.instanceNo,
        restarts: s.restartCount,
        state: record(s.session).state,
      };
    });
    const snapshots = [];
    let eligible = 0;
    let boundEligible = 0;
    for (const s of sources) {
      const path = `/v2/source-instances/${encodeURIComponent(s.id)}`;
      const account = await get(`${path}/account`);
      const descriptor = record(account.descriptor),
        snapshot = record(account.snapshot);
      if (
        typeof descriptor.session_supported !== "boolean" ||
        typeof snapshot.state !== "string" ||
        !STATES.has(snapshot.state) ||
        snapshot.state !== s.state
      )
        throw Error();
      const auth = await get(`${path}/authentication`);
      if (
        !Array.isArray(auth.modes) ||
        auth.modes.length > MODES.size ||
        auth.modes.some((m) => typeof m !== "string" || !MODES.has(m)) ||
        new Set(auth.modes).size !== auth.modes.length
      )
        throw Error();
      if (
        s.provider === "tonghuashun" &&
        descriptor.session_supported &&
        auth.modes.includes("app_qr")
      ) {
        eligible++;
        if (s.number === options.instanceNumber) boundEligible++;
      }
      // Includes account changes internally; no digest or identifier is included in evidence.
      snapshots.push({
        source: s,
        descriptor,
        snapshot: { ...snapshot, observed_at: undefined },
        modes: auth.modes,
      });
    }
    snapshots.sort((a, b) => a.source.id.localeCompare(b.source.id));
    return {
      identity: fingerprintJson(snapshots),
      count: sources.length,
      eligible: options.instanceNumber === undefined ? eligible : boundEligible,
      connected: sources.filter((s) => s.state === "connected").length,
    };
  };
  try {
    const version = await get("/v2/system/version"),
      health = await get("/v2/system/health");
    if (
      version.version !== "2.0.5" ||
      version.product !== "FQGate" ||
      version.api_version !== "2.0" ||
      version.platform !== "windows" ||
      version.architecture !== "x86_64" ||
      health.status !== "ready"
    )
      throw Error();
    before = fingerprintJson({ version, health: health.status });
    add("VERSION_HEALTH", "PASS", "EXACT_205_READY", { version: "2.0.5", health: "ready" });
  } catch {
    add("VERSION_HEALTH", "BLOCKED", "VERSION_HEALTH_UNVERIFIED");
  }
  let contract: string | undefined;
  try {
    const doc = await get("/openapi.json", 4 * 1024 * 1024);
    contract = operationContractFingerprint(doc, QR_CENSUS_CONTRACTS);
    const schemas = record(record(doc.components).schemas);
    const request = record(schemas.AuthenticationRequest),
      result = record(schemas.AuthenticationResult);
    const variants = request.oneOf;
    if (!Array.isArray(variants)) throw Error();
    const actions = variants.map((v) => record(record(record(v).properties).action).const);
    const data = record(record(result.properties).data),
      fields = record(data.properties);
    const post = record(record(record(doc.paths)[AUTH]).post);
    const errors = JSON.stringify(post.responses);
    const hasStatusEnum = Array.isArray(record(fields.status).enum);
    add(
      "QR_CONTRACT",
      options.staticClientVerified === true && contract === V2_QR_FINGERPRINT ? "PASS" : "BLOCKED",
      options.staticClientVerified === true && contract === V2_QR_FINGERPRINT
        ? "EXACT_STATIC_CLIENT_AND_OPENAPI_REVIEWED"
        : "BLOCKED_UPSTREAM_QR_CONTRACT",
      {
        fingerprint: contract,
        beginActionDeclared: actions.includes("app_qr_begin"),
        pollActionDeclared: actions.includes("app_qr_poll"),
        statusEnumDeclared: hasStatusEnum,
        expiredErrorDeclared: /qr_flow_expired|flow_expired/i.test(errors),
        replacedErrorDeclared: /qr_flow_replaced|flow_replaced/i.test(errors),
        adapterImplemented: true,
        staticClientVerified: options.staticClientVerified === true,
        liveWireVerified: false,
      },
      "Verify the pinned installed client and reviewed OpenAPI together, then repeat Preflight. Static evidence is not live QR acceptance; cancellation only abandons local polling.",
    );
  } catch {
    add("QR_CONTRACT", "BLOCKED", "BLOCKED_UPSTREAM_QR_CONTRACT");
  }
  try {
    const initial = await sourceSnapshot();
    add(
      "QR_SOURCE_SELECTION",
      initial.eligible === 1 ? "PASS" : "BLOCKED",
      initial.eligible === 1
        ? "UNIQUE_ELIGIBLE_SOURCE_OBSERVED"
        : initial.eligible === 0
          ? "NO_ELIGIBLE_SOURCE"
          : "AMBIGUOUS_ELIGIBLE_SOURCES",
      {
        sourceCount: initial.count,
        eligibleCount: initial.eligible,
        connectedCount: initial.connected,
      },
      "A reviewed server-side policy must uniquely select a QR-capable source without assuming it is connected; do not change accounts during diagnosis.",
    );
    const final = await sourceSnapshot();
    if (final.identity !== initial.identity) throw Error();
    add("SOURCE_ACCOUNT_CONTINUITY", "PASS", "SAMPLED_SOURCE_ACCOUNT_UNCHANGED", { samples: 2 });
  } catch {
    if (!gates.some((g) => g.id === "QR_SOURCE_SELECTION"))
      add("QR_SOURCE_SELECTION", "BLOCKED", "SOURCE_SELECTION_UNVERIFIED");
    add("SOURCE_ACCOUNT_CONTINUITY", "BLOCKED", "SOURCE_ACCOUNT_CHANGED_OR_UNVERIFIED");
  }
  try {
    const version = await get("/v2/system/version"),
      health = await get("/v2/system/health");
    const doc = await get("/openapi.json", 4 * 1024 * 1024);
    if (
      !before ||
      !contract ||
      fingerprintJson({ version, health: health.status }) !== before ||
      operationContractFingerprint(doc, QR_CENSUS_CONTRACTS) !== contract
    )
      throw Error();
    add("PROTOCOL_CONTINUITY", "PASS", "SAMPLED_VERSION_CONTRACT_UNCHANGED", { samples: 2 });
  } catch {
    add("PROTOCOL_CONTINUITY", "BLOCKED", "VERSION_CONTRACT_CHANGED_OR_UNVERIFIED");
  }
  add(
    "LIVE_QR",
    "NOT_EXECUTED",
    "EXPLICIT_LIVE_AUTHORIZATION_REQUIRED",
    {},
    "Live begin may replace the current login. Implement and verify the contract first, then obtain explicit operator approval; do not begin QR to discover the contract.",
  );
  return gates;
}
