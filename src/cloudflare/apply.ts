import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { CloudflareDiscoveryService } from "./discovery.js";
import { reconcileCloudflareState } from "./reconcile.js";
import type {
  CloudflareContext,
  CloudflareDesiredState,
  CloudflareDiscoveryClient,
  CloudflareReadOnlyPlan,
} from "./types.js";
import type {
  CloudflareDnsApplyWriteTransport,
  CloudflareDnsRecordReceipt,
} from "./write-transport.js";

const forbiddenPlanClassifications = new Set([
  "unsafe_conflict",
  "ambiguous",
  "blocked",
  "manual_required",
]);

export interface CloudflareDnsApplyOptions {
  readonly desired: CloudflareDesiredState;
  readonly expectedFingerprint: string;
  readonly checkId: string;
  readonly discoveryClient: CloudflareDiscoveryClient;
  readonly createWriteTransport: () =>
    CloudflareDnsApplyWriteTransport | Promise<CloudflareDnsApplyWriteTransport>;
  readonly verifyRequiredRegression: (input: {
    readonly expectedFingerprint: string;
    readonly checkId: string;
  }) => Promise<void>;
}

export interface CloudflareDnsApplyResult {
  readonly status: "applied";
  readonly checkId: string;
  readonly recordId: string;
  readonly hostname: string;
  readonly type: "CNAME";
  readonly content: string;
  readonly proxied: true;
  readonly fingerprintBefore: string;
  readonly fingerprintAfter: string;
  readonly oldFingerprintInvalidated: true;
}

export async function applyCloudflareDnsCheck(
  options: CloudflareDnsApplyOptions,
): Promise<CloudflareDnsApplyResult> {
  validateExpectedFingerprint(options.expectedFingerprint);
  validateCheckId(options.checkId);

  const discovery = new CloudflareDiscoveryService(options.discoveryClient);
  const firstPlan = await discoverPlan(discovery, options.desired);
  assertPlanCanApply(firstPlan);
  assertExpectedFingerprint(firstPlan, options.expectedFingerprint);
  const context = contextForCheck(options.checkId);
  assertSelectedCheckIsMissingCreate(firstPlan, context);

  const secondPlan = await discoverPlan(discovery, options.desired);
  assertPlanCanApply(secondPlan);
  assertExpectedFingerprint(secondPlan, options.expectedFingerprint);
  assertSelectedCheckIsMissingCreate(secondPlan, context);

  const selection = secondPlan.observed.dns[context];
  const zone = secondPlan.observed.zone.selected;
  const tunnel = secondPlan.observed.tunnel.selected;
  const hostname = options.desired.access.applications[context].hostname;
  if (
    selection.status !== "missing" ||
    selection.candidates.length !== 0 ||
    zone === undefined ||
    tunnel === undefined ||
    !isHostnameWithinZone(hostname, options.desired.zone.name) ||
    (options.desired.zone.id !== undefined && zone.id !== options.desired.zone.id) ||
    zone.name !== options.desired.zone.name
  ) {
    throw applyRejected("Selected DNS check is not an exact missing desired record");
  }

  const content = `${tunnel.id}.cfargotunnel.com`;
  if (
    options.desired.tunnel.dnsTarget !== undefined &&
    options.desired.tunnel.dnsTarget !== content
  ) {
    throw applyRejected("Desired DNS target does not match the selected Tunnel ID");
  }

  const writeTransport = await options.createWriteTransport();
  const receipt = await writeTransport.createDesiredCname(secondPlan, options.checkId);

  try {
    const afterPlan = await discoverPlan(discovery, options.desired);
    assertPostcondition(afterPlan, secondPlan, context, receipt);
    await options.verifyRequiredRegression({
      expectedFingerprint: secondPlan.fingerprint,
      checkId: options.checkId,
    });
    return {
      status: "applied",
      checkId: options.checkId,
      recordId: receipt.id,
      hostname,
      type: "CNAME",
      content,
      proxied: true,
      fingerprintBefore: secondPlan.fingerprint,
      fingerprintAfter: afterPlan.fingerprint,
      oldFingerprintInvalidated: true,
    };
  } catch (error) {
    return await rollbackAndProveRestored({
      writeTransport,
      discovery,
      desired: options.desired,
      expectedRestoredFingerprint: secondPlan.fingerprint,
      receipt,
      originalError: error,
    });
  }
}

async function discoverPlan(
  discovery: CloudflareDiscoveryService,
  desired: CloudflareDesiredState,
): Promise<CloudflareReadOnlyPlan> {
  const observed = await discovery.discover(desired);
  return reconcileCloudflareState(desired, observed);
}

function assertPlanCanApply(plan: CloudflareReadOnlyPlan): void {
  const rejected = plan.checks.find((check) =>
    forbiddenPlanClassifications.has(check.classification),
  );
  if (rejected !== undefined) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_UNSAFE_CONFLICT,
      "Cloudflare apply is blocked by the current Phase 6-A plan",
      { checkId: boundedId(rejected.id), classification: rejected.classification },
    );
  }
}

function assertExpectedFingerprint(plan: CloudflareReadOnlyPlan, expected: string): void {
  if (plan.fingerprint !== expected) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_APPLY_STALE,
      "Cloudflare plan fingerprint is stale; discover and plan again before applying",
      { expectedFingerprint: expected, currentFingerprint: plan.fingerprint },
    );
  }
}

function assertSelectedCheckIsMissingCreate(
  plan: CloudflareReadOnlyPlan,
  context: CloudflareContext,
): void {
  const checkId = `dns.${context}.record`;
  const matches = plan.checks.filter((check) => check.id === checkId);
  if (matches.length !== 1) {
    throw applyRejected("Selected DNS check is not unique in the current plan");
  }
  const check = matches[0];
  if (check === undefined || check.classification !== "missing" || check.action !== "create") {
    throw applyRejected("Selected check is not a missing DNS CNAME create action");
  }
}

function assertPostcondition(
  afterPlan: CloudflareReadOnlyPlan,
  beforePlan: CloudflareReadOnlyPlan,
  context: CloudflareContext,
  receipt: CloudflareDnsRecordReceipt,
): void {
  assertPlanCanApply(afterPlan);
  const selectedCheck = afterPlan.checks.find((check) => check.id === `dns.${context}.record`);
  const record = afterPlan.observed.dns[context].selected;
  if (
    selectedCheck?.classification !== "in_sync" ||
    selectedCheck.action !== "none" ||
    record === undefined ||
    record.id !== receipt.id ||
    record.name !== receipt.name ||
    record.type !== "CNAME" ||
    record.content !== receipt.content ||
    record.proxied !== true ||
    receipt.type !== "CNAME" ||
    receipt.proxied !== true
  ) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
      "Cloudflare DNS create did not produce the exact desired record",
      { checkId: `dns.${context}.record`, recordId: receipt.id },
    );
  }

  const beforeOtherChecks = beforePlan.checks.filter(
    (check) => check.id !== `dns.${context}.record`,
  );
  const afterOtherChecks = afterPlan.checks.filter((check) => check.id !== `dns.${context}.record`);
  if (canonicalize(beforeOtherChecks) !== canonicalize(afterOtherChecks)) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
      "Cloudflare DNS create changed a non-target Phase 6-A check",
      { checkId: `dns.${context}.record`, recordId: receipt.id },
    );
  }
}

async function rollbackAndProveRestored(input: {
  readonly writeTransport: CloudflareDnsApplyWriteTransport;
  readonly discovery: CloudflareDiscoveryService;
  readonly desired: CloudflareDesiredState;
  readonly expectedRestoredFingerprint: string;
  readonly receipt: CloudflareDnsRecordReceipt;
  readonly originalError: unknown;
}): Promise<never> {
  let deleteError: unknown;
  try {
    await input.writeTransport.rollbackCreatedRecord(input.receipt.handle);
  } catch (error) {
    deleteError = error;
  }

  let restored = false;
  let proofError: unknown;
  try {
    const restoredPlan = await discoverPlan(input.discovery, input.desired);
    restored = restoredPlan.fingerprint === input.expectedRestoredFingerprint;
  } catch (error) {
    proofError = error;
  }

  if (!restored) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_ROLLBACK_FAILED,
      "Cloudflare DNS rollback could not be proven; inspect the bounded record metadata before retrying",
      {
        recordId: input.receipt.id,
        reasonCode: errorCode(input.originalError),
        rollbackCode: errorCode(deleteError),
        proofCode: errorCode(proofError),
      },
    );
  }

  if (input.originalError instanceof BridgeError) {
    throw new BridgeError(input.originalError.code, input.originalError.message, {
      ...(input.originalError.details ?? {}),
      recordId: input.receipt.id,
      rolledBack: true,
    });
  }
  throw new BridgeError(
    ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
    "Cloudflare DNS mutation failed verification and was rolled back",
    { recordId: input.receipt.id, rolledBack: true, rollbackCode: errorCode(deleteError) },
  );
}

function validateExpectedFingerprint(value: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw applyRejected("Expected plan fingerprint must be a lowercase SHA-256 value");
  }
}

function validateCheckId(value: string): void {
  if (!/^dns\.(human|admin|machine)\.record$/.test(value)) {
    throw applyRejected("Only one exact desired DNS record check may be selected");
  }
}

function contextForCheck(checkId: string): CloudflareContext {
  const context = /^dns\.(human|admin|machine)\.record$/.exec(checkId)?.[1];
  if (context !== "human" && context !== "admin" && context !== "machine") {
    throw applyRejected("Selected check is not a supported DNS record check");
  }
  return context;
}

function isHostnameWithinZone(hostname: string, zone: string): boolean {
  return hostname === zone || hostname.endsWith(`.${zone}`);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

function applyRejected(message: string): BridgeError {
  return new BridgeError(ERROR_CODES.CLOUDFLARE_APPLY_REJECTED, message);
}

function errorCode(error: unknown): string | null {
  return error instanceof BridgeError ? error.code : error === undefined ? null : "UNEXPECTED";
}

function boundedId(value: string): string {
  return value.length > 128 ? value.slice(0, 128) : value;
}
