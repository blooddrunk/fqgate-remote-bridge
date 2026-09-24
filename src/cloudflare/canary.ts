import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import { CloudflareDiscoveryService } from "./discovery.js";
import { reconcileCloudflareState } from "./reconcile.js";
import type {
  CloudflareDesiredState,
  CloudflareDiscoveryClient,
  CloudflareReadOnlyPlan,
} from "./types.js";
import type {
  CloudflareDnsCanaryWriteTransport,
  CloudflareDnsRecordReceipt,
} from "./write-transport.js";
import { CLOUDFLARE_B1_CANARY_PREFIX } from "./write-transport.js";

const forbiddenPlanClassifications = new Set([
  "unsafe_conflict",
  "ambiguous",
  "blocked",
  "manual_required",
]);

export interface CloudflareDnsCanaryOptions {
  readonly desired: CloudflareDesiredState;
  readonly discoveryClient: CloudflareDiscoveryClient;
  readonly writeTransport: CloudflareDnsCanaryWriteTransport;
  readonly commitSha: string;
}

export interface CloudflareDnsCanaryResult {
  readonly status: "created_and_cleaned";
  readonly name: string;
  readonly type: "TXT";
  readonly recordId: string;
  readonly cleanupVerified: true;
}

export async function runCloudflareDnsCanary(
  options: CloudflareDnsCanaryOptions,
): Promise<CloudflareDnsCanaryResult> {
  const discovery = new CloudflareDiscoveryService(options.discoveryClient);
  const initialPlan = await discoverPlan(discovery, options.desired);
  assertPlanSafe(initialPlan);
  const zone = initialPlan.observed.zone.selected;
  if (zone === undefined || zone.name !== options.desired.zone.name) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_CANARY_FAILED,
      "Cloudflare canary requires the uniquely selected desired zone",
    );
  }

  const name = `${CLOUDFLARE_B1_CANARY_PREFIX}${zone.name}`;
  const before = await options.discoveryClient.listDnsRecords(zone.id, name);
  if (before.length !== 0) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_CANARY_COLLISION,
      "Reserved Cloudflare DNS canary name already exists; no record was changed",
      { name, count: before.length },
    );
  }

  const { receipt, content } = await options.writeTransport.createReservedCanary(
    initialPlan,
    options.commitSha,
  );
  let verificationError: unknown;
  try {
    const afterCreate = await options.discoveryClient.listDnsRecords(zone.id, name);
    if (!matchesSingleCanary(afterCreate, receipt, name, content)) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARE_CANARY_FAILED,
        "Cloudflare DNS canary create could not be verified",
        { name, recordId: receipt.id },
      );
    }
  } catch (error) {
    verificationError = error;
  }

  let deleteError: unknown;
  try {
    await options.writeTransport.deleteCanaryRecord(receipt.handle);
  } catch (error) {
    deleteError = error;
  }

  let absenceVerified = false;
  let absenceError: unknown;
  try {
    absenceVerified = (await options.discoveryClient.listDnsRecords(zone.id, name)).length === 0;
  } catch (error) {
    absenceError = error;
  }
  if (!absenceVerified) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_CANARY_FAILED,
      "Cloudflare DNS canary cleanup could not be proven; inspect the reserved name before retrying",
      {
        name,
        recordId: receipt.id,
        verificationCode: errorCode(verificationError),
        deleteCode: errorCode(deleteError),
        absenceCode: errorCode(absenceError),
      },
    );
  }
  if (verificationError !== undefined) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_CANARY_FAILED,
      "Cloudflare DNS canary verification failed; cleanup was verified",
      { name, recordId: receipt.id, reasonCode: errorCode(verificationError) },
    );
  }
  return {
    status: "created_and_cleaned",
    name,
    type: "TXT",
    recordId: receipt.id,
    cleanupVerified: true,
  };
}

async function discoverPlan(
  discovery: CloudflareDiscoveryService,
  desired: CloudflareDesiredState,
): Promise<CloudflareReadOnlyPlan> {
  return reconcileCloudflareState(desired, await discovery.discover(desired));
}

function assertPlanSafe(plan: CloudflareReadOnlyPlan): void {
  const rejected = plan.checks.find((check) =>
    forbiddenPlanClassifications.has(check.classification),
  );
  if (rejected !== undefined) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_UNSAFE_CONFLICT,
      "Cloudflare canary is blocked by the current Phase 6-A plan",
      { checkId: rejected.id.slice(0, 128), classification: rejected.classification },
    );
  }
}

function matchesSingleCanary(
  values: readonly unknown[],
  receipt: CloudflareDnsRecordReceipt,
  name: string,
  content: string,
): boolean {
  if (values.length !== 1) return false;
  const value = values[0];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.id === receipt.id &&
    typeof record.name === "string" &&
    record.name.toLowerCase().replace(/\.$/, "") === name &&
    record.type === "TXT" &&
    record.content === content &&
    record.proxied === false &&
    receipt.name === name &&
    receipt.type === "TXT" &&
    receipt.content === content &&
    receipt.proxied === false
  );
}

function errorCode(error: unknown): string | null {
  return error instanceof BridgeError ? error.code : error === undefined ? null : "UNEXPECTED";
}
