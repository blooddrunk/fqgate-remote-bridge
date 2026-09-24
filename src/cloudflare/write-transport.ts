import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { cloudflarePlanFingerprint } from "./reconcile.js";
import {
  CLOUDFLARE_API_BASE_URL,
  type CloudflareApiTokenEnvironment,
  type CloudflareContext,
  type CloudflareReadOnlyPlan,
} from "./types.js";

export const CLOUDFLARE_DNS_WRITE_TOKEN_ENV = "CLOUDFLARE_DNS_WRITE_TOKEN" as const;
export const CLOUDFLARE_DNS_WRITE_TIMEOUT_MS = 15_000;
export const CLOUDFLARE_DNS_WRITE_MAX_RESPONSE_BYTES = 262_144;
export const CLOUDFLARE_B1_CANARY_PREFIX = "_fqgate-remote-bridge-phase6b-canary." as const;

const canaryEvidenceId = "P6B1-W3" as const;
const createdRecordHandleBrand: unique symbol = Symbol("created-cloudflare-dns-record");
const transportStates = new WeakMap<object, TransportState>();

export interface CloudflareCreatedDnsRecordHandle {
  readonly recordId: string;
  readonly [createdRecordHandleBrand]: true;
}

export interface CloudflareDnsRecordReceipt {
  readonly id: string;
  readonly name: string;
  readonly type: "CNAME" | "TXT";
  readonly content: string;
  readonly proxied: boolean | null;
  readonly handle: CloudflareCreatedDnsRecordHandle;
}

export interface CloudflareDnsApplyWriteTransport {
  createDesiredCname(
    currentPlan: CloudflareReadOnlyPlan,
    checkId: string,
  ): Promise<CloudflareDnsRecordReceipt>;
  rollbackCreatedRecord(handle: CloudflareCreatedDnsRecordHandle): Promise<void>;
}

export interface CloudflareDnsCanaryWriteTransport {
  createReservedCanary(
    currentPlan: CloudflareReadOnlyPlan,
    commitSha: string,
  ): Promise<{ readonly receipt: CloudflareDnsRecordReceipt; readonly content: string }>;
  deleteCanaryRecord(handle: CloudflareCreatedDnsRecordHandle): Promise<void>;
}

export interface CloudflareDnsWriteTransportOptions {
  readonly apiToken: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface CloudflareDnsWriteTokenEnvironment extends CloudflareApiTokenEnvironment {
  readonly CLOUDFLARE_DNS_WRITE_TOKEN?: string;
}

export function getCloudflareDnsWriteToken(
  environment: CloudflareDnsWriteTokenEnvironment = process.env,
): string {
  const token = environment[CLOUDFLARE_DNS_WRITE_TOKEN_ENV];
  if (!isValidToken(token)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_TOKEN_REQUIRED,
      "A short-lived, zone-scoped Cloudflare DNS write token is required; never use a Global API Key",
    );
  }
  return token;
}

abstract class BoundedCloudflareDnsWriteTransport {
  protected constructor(options: CloudflareDnsWriteTransportOptions) {
    if (!isValidToken(options.apiToken)) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_WRITE_TOKEN_REQUIRED,
        "The Cloudflare DNS write token is empty or invalid",
      );
    }
    const timeoutMs = options.timeoutMs ?? CLOUDFLARE_DNS_WRITE_TIMEOUT_MS;
    const maxResponseBytes = options.maxResponseBytes ?? CLOUDFLARE_DNS_WRITE_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Cloudflare DNS write timeout is out of bounds",
      );
    }
    if (
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1_024 ||
      maxResponseBytes > 8 * 1024 * 1024
    ) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "Cloudflare DNS write response limit is out of bounds",
      );
    }
    transportStates.set(this, {
      apiToken: options.apiToken,
      timeoutMs,
      maxResponseBytes,
      fetchImpl: options.fetchImpl ?? fetch,
      handles: new WeakMap<object, { readonly recordId: string; readonly zoneId: string }>(),
    });
  }
}

export class FetchCloudflareDnsApplyWriteTransport
  extends BoundedCloudflareDnsWriteTransport
  implements CloudflareDnsApplyWriteTransport
{
  constructor(options: CloudflareDnsWriteTransportOptions) {
    super(options);
  }

  async createDesiredCname(
    currentPlan: CloudflareReadOnlyPlan,
    checkId: string,
  ): Promise<CloudflareDnsRecordReceipt> {
    const payload = deriveDesiredCnamePayload(currentPlan, checkId);
    return createRecord(getTransportState(this), payload);
  }

  async rollbackCreatedRecord(handle: CloudflareCreatedDnsRecordHandle): Promise<void> {
    await deleteCreatedRecord(getTransportState(this), handle);
  }
}

export class FetchCloudflareDnsCanaryWriteTransport
  extends BoundedCloudflareDnsWriteTransport
  implements CloudflareDnsCanaryWriteTransport
{
  constructor(options: CloudflareDnsWriteTransportOptions) {
    super(options);
  }

  async createReservedCanary(
    currentPlan: CloudflareReadOnlyPlan,
    commitSha: string,
  ): Promise<{ readonly receipt: CloudflareDnsRecordReceipt; readonly content: string }> {
    const payload = deriveCanaryPayload(currentPlan, commitSha);
    return {
      receipt: await createRecord(getTransportState(this), payload),
      content: payload.content,
    };
  }

  async deleteCanaryRecord(handle: CloudflareCreatedDnsRecordHandle): Promise<void> {
    await deleteCreatedRecord(getTransportState(this), handle);
  }
}

interface TransportState {
  readonly apiToken: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly fetchImpl: typeof fetch;
  readonly handles: WeakMap<object, { readonly recordId: string; readonly zoneId: string }>;
}

interface DnsPayload {
  readonly zoneId: string;
  readonly name: string;
  readonly type: "CNAME" | "TXT";
  readonly content: string;
  readonly proxied: boolean;
}

function deriveDesiredCnamePayload(plan: CloudflareReadOnlyPlan, checkId: string): DnsPayload {
  assertPlanIntegrityAndSafety(plan);
  const context = contextForCheck(checkId);
  const matches = plan.checks.filter((check) => check.id === checkId);
  if (
    matches.length !== 1 ||
    matches[0]?.classification !== "missing" ||
    matches[0]?.action !== "create"
  ) {
    throw applyRejected("Selected check is not one missing desired DNS CNAME create action");
  }
  const zone = plan.observed.zone.selected;
  const tunnel = plan.observed.tunnel.selected;
  const selection = plan.observed.dns[context];
  const desiredZone = plan.desired.zone;
  const hostname = plan.desired.access.applications[context].hostname;
  if (
    zone === undefined ||
    tunnel === undefined ||
    selection.status !== "missing" ||
    selection.candidates.length !== 0 ||
    zone.name !== desiredZone.name ||
    (desiredZone.id !== undefined && desiredZone.id !== zone.id) ||
    !isHostnameWithinZone(hostname, desiredZone.name)
  ) {
    throw applyRejected("DNS create inputs are not uniquely derived from the selected plan");
  }
  const content = `${tunnel.id}.cfargotunnel.com`;
  if (plan.desired.tunnel.dnsTarget !== undefined && plan.desired.tunnel.dnsTarget !== content) {
    throw applyRejected("Desired DNS target does not match the selected Tunnel ID");
  }
  return {
    zoneId: validateResourceId(zone.id, "zone"),
    name: validateHostname(hostname, "DNS record name"),
    type: "CNAME",
    content: validateHostname(content, "Tunnel DNS target"),
    proxied: true,
  };
}

function deriveCanaryPayload(plan: CloudflareReadOnlyPlan, commitSha: string): DnsPayload {
  assertPlanIntegrityAndSafety(plan);
  const zone = plan.observed.zone.selected;
  if (zone === undefined || zone.name !== plan.desired.zone.name) {
    throw applyRejected("Canary zone is not uniquely selected from the desired plan");
  }
  if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "Canary commit metadata is invalid");
  }
  return {
    zoneId: validateResourceId(zone.id, "zone"),
    name: validateCanaryRecordName(`${CLOUDFLARE_B1_CANARY_PREFIX}${zone.name}`),
    type: "TXT",
    content: `phase6b1;commit=${commitSha.toLowerCase()};evidence=${canaryEvidenceId}`,
    proxied: false,
  };
}

function assertPlanIntegrityAndSafety(plan: CloudflareReadOnlyPlan): void {
  if (
    plan.phase !== "6-A" ||
    plan.readOnly !== true ||
    plan.mutationMethods.length !== 0 ||
    !/^[a-f0-9]{64}$/.test(plan.fingerprint) ||
    cloudflarePlanFingerprint(plan) !== plan.fingerprint
  ) {
    throw applyRejected("Cloudflare write requires an intact current Phase 6-A plan");
  }
  const rejected = plan.checks.find((check) =>
    new Set(["unsafe_conflict", "ambiguous", "blocked", "manual_required"]).has(
      check.classification,
    ),
  );
  if (rejected !== undefined) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_UNSAFE_CONFLICT,
      "Cloudflare DNS write is blocked by the current Phase 6-A plan",
      { checkId: rejected.id.slice(0, 128), classification: rejected.classification },
    );
  }
}

async function createRecord(
  state: TransportState,
  payload: DnsPayload,
): Promise<CloudflareDnsRecordReceipt> {
  const name =
    payload.type === "TXT"
      ? validateCanaryRecordName(payload.name)
      : validateHostname(payload.name, "DNS record name");
  const result = await requestCloudflareDns(state, "POST", dnsCollectionPath(payload.zoneId), {
    type: payload.type,
    name,
    content: validateRecordContent(payload.content),
    proxied: payload.proxied,
  });
  const parsed = parseCreatedRecord(result, payload);
  const handle = Object.freeze({
    recordId: parsed.id,
    [createdRecordHandleBrand]: true as const,
  });
  state.handles.set(handle, { recordId: parsed.id, zoneId: payload.zoneId });
  return { ...parsed, handle };
}

async function deleteCreatedRecord(
  state: TransportState,
  handle: CloudflareCreatedDnsRecordHandle,
): Promise<void> {
  const binding = state.handles.get(handle);
  if (binding === undefined || binding.recordId !== handle.recordId) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      "Cloudflare rollback target was not created by this write invocation",
    );
  }
  const result = await requestCloudflareDns(
    state,
    "DELETE",
    dnsRecordPath(binding.zoneId, binding.recordId),
  );
  if (!isRecord(result) || result.id !== binding.recordId) {
    throw invalidWriteResponse("delete result did not identify the created record");
  }
  state.handles.delete(handle);
}

async function requestCloudflareDns(
  state: TransportState,
  method: "POST" | "DELETE",
  path: string,
  body?: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const url = buildDnsWriteUrl(path);
  const action = method === "POST" ? "create" : "delete";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), state.timeoutMs);
  try {
    const response = await state.fetchImpl(url, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${state.apiToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const bytes = await readBoundedBody(response, state.maxResponseBytes, controller.signal);
    if (response.status < 200 || response.status >= 300) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
        `Cloudflare DNS ${action} returned an unsuccessful status`,
        { action, status: response.status },
      );
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw invalidWriteResponse("response was not JSON");
    }
    if (!isRecord(envelope) || envelope.success !== true || !("result" in envelope)) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
        `Cloudflare DNS ${action} was not successful`,
        {
          action,
          status: response.status,
          errorCodes: boundedErrorCodes(isRecord(envelope) ? envelope.errors : undefined),
        },
      );
    }
    return envelope.result;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
        `Cloudflare DNS ${action} timed out after ${state.timeoutMs}ms`,
        { action },
      );
    }
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      `Cloudflare DNS ${action} request failed`,
      { action },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function getTransportState(transport: object): TransportState {
  const state = transportStates.get(transport);
  if (state === undefined) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      "Cloudflare DNS write transport is invalid",
    );
  }
  return state;
}

function parseCreatedRecord(
  value: unknown,
  expected: DnsPayload,
): Omit<CloudflareDnsRecordReceipt, "handle"> {
  if (!isRecord(value)) throw invalidWriteResponse("create result is not a DNS record");
  const { id, name, type, content, proxied } = value;
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof content !== "string" ||
    (proxied !== null && typeof proxied !== "boolean")
  ) {
    throw invalidWriteResponse("create result fields are invalid");
  }
  const normalizedName = name.toLowerCase().replace(/\.$/, "");
  if (
    normalizedName !== expected.name ||
    type.toUpperCase() !== expected.type ||
    content !== expected.content ||
    proxied !== expected.proxied
  ) {
    throw invalidWriteResponse("create result does not match the fixed DNS payload");
  }
  return { id, name: normalizedName, type: expected.type, content, proxied };
}

function dnsCollectionPath(zoneId: string): string {
  return `/zones/${encodeURIComponent(validateResourceId(zoneId, "zone"))}/dns_records`;
}

function dnsRecordPath(zoneId: string, recordId: string): string {
  return `${dnsCollectionPath(zoneId)}/${encodeURIComponent(validateResourceId(recordId, "record"))}`;
}

function buildDnsWriteUrl(path: string): string {
  const allowed = /^\/zones\/[A-Za-z0-9_-]+\/dns_records(?:\/[A-Za-z0-9_-]+)?$/;
  if (!allowed.test(path)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      "Cloudflare DNS write path is invalid",
    );
  }
  const url = new URL(`${CLOUDFLARE_API_BASE_URL}${path}`);
  if (url.origin !== new URL(CLOUDFLARE_API_BASE_URL).origin) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      "Cloudflare DNS write origin is invalid",
    );
  }
  return url.toString();
}

function validateResourceId(value: string, resource: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
      `Cloudflare ${resource} ID is invalid`,
    );
  }
  return value;
}

function validateHostname(value: string, resource: string): string {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    value !== value.toLowerCase() ||
    value.endsWith(".") ||
    value.includes("*")
  ) {
    throw new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, `Cloudflare ${resource} is invalid`);
  }
  const labels = value.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, `Cloudflare ${resource} is invalid`);
  }
  return value;
}

function validateCanaryRecordName(value: string): string {
  if (!value.startsWith(CLOUDFLARE_B1_CANARY_PREFIX) || value.length > 253) {
    throw new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, "Cloudflare canary name is invalid");
  }
  const zoneName = value.slice(CLOUDFLARE_B1_CANARY_PREFIX.length);
  validateHostname(zoneName, "canary zone");
  return `${CLOUDFLARE_B1_CANARY_PREFIX}${zoneName}`;
}

function validateRecordContent(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    hasControlCharacter(value)
  ) {
    throw new BridgeError(ERROR_CODES.CLOUDFLARE_WRITE_FAILED, "Cloudflare DNS content is invalid");
  }
  return value;
}

async function readBoundedBody(
  response: Response,
  maximum: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_API_RESPONSE_TOO_LARGE,
          "Cloudflare DNS write response exceeds the configured size limit",
        );
      }
      chunks.push(next.value);
      if (signal.aborted) {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARE_WRITE_FAILED,
          "Cloudflare DNS write timed out",
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function contextForCheck(checkId: string): CloudflareContext {
  const context = /^dns\.(human|admin|machine)\.record$/.exec(checkId)?.[1];
  if (context !== "human" && context !== "admin" && context !== "machine") {
    throw applyRejected("Only one exact desired DNS check is supported");
  }
  return context;
}

function isHostnameWithinZone(hostname: string, zone: string): boolean {
  return hostname === zone || hostname.endsWith(`.${zone}`);
}

function applyRejected(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.CLOUDFLARE_APPLY_REJECTED, message);
}

function invalidWriteResponse(reason: string): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID,
    `Cloudflare DNS write response is invalid: ${reason}`,
  );
}

function boundedErrorCodes(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .flatMap((entry) =>
      isRecord(entry) && typeof entry.code === "number" && Number.isSafeInteger(entry.code)
        ? [entry.code]
        : [],
    );
}

function isValidToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= 4_096 &&
    token.trim() === token &&
    !hasControlCharacter(token)
  );
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
