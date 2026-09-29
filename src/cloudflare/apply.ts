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
import { parseCloudflareB2Profile, type CloudflareB2Profile } from "./b2-profile.js";
import type { CloudflareB2WriteTransport } from "./b2-write-transport.js";

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

export interface CloudflareB2ApplyOptions {
  readonly desired: CloudflareDesiredState;
  readonly expectedFingerprint: string;
  readonly checkId: string;
  readonly discoveryClient: CloudflareDiscoveryClient;
  readonly profile: CloudflareB2Profile;
  readonly expectedProfileFingerprint: string;
  readonly createWriteTransport: (
    plan: CloudflareReadOnlyPlan,
  ) => CloudflareB2WriteTransport | Promise<CloudflareB2WriteTransport>;
  readonly verifyRequiredRegression: (input: {
    readonly expectedFingerprint: string;
    readonly checkId: string;
  }) => Promise<void>;
}

export interface CloudflareB2ApplyResult {
  readonly status: "applied";
  readonly checkId: string;
  readonly resourceType: "tunnel_ingress" | "access_application" | "access_policy";
  readonly resourceId: string;
  readonly fingerprintBefore: string;
  readonly fingerprintAfter: string;
  readonly mutationCount: 1;
}

/** A credential-free live proof that an exact in-sync plan cannot trigger a B2 write. */
export async function refuseCloudflareB2InSyncApply(input: {
  readonly desired: CloudflareDesiredState;
  readonly expectedFingerprint: string;
  readonly checkId: string;
  readonly discoveryClient: CloudflareDiscoveryClient;
}): Promise<never> {
  validateExpectedFingerprint(input.expectedFingerprint);
  if (
    !/^(?:tunnel\.ingress\.(?:human|admin|machine)\.(?:route|access)|access\.application\.(?:human|admin|machine)\.identity|access\.policy\.(?:human|admin|machine)\.shape|access\.policy\.admin\.mfa)$/.test(
      input.checkId,
    )
  ) {
    throw applyRejected("Selected check is outside the exact Phase 6-B2 surface");
  }
  const plan = await discoverPlan(
    new CloudflareDiscoveryService(input.discoveryClient),
    input.desired,
  );
  assertExpectedFingerprint(plan, input.expectedFingerprint);
  if (plan.checks.every((check) => check.classification === "in_sync")) {
    throw applyRejected(
      "Cloudflare B2 apply refused: current plan is already in sync; zero writes",
    );
  }
  throw applyRejected(
    "Cloudflare B2 drift requires an exact reviewed write profile and separate scoped credentials",
  );
}

type B2Action =
  | { readonly kind: "tunnel_create" | "tunnel_protect"; readonly context: CloudflareContext }
  | {
      readonly kind: "application_create" | "application_rename";
      readonly context: CloudflareContext;
    }
  | { readonly kind: "policy_create" | "policy_tighten"; readonly context: CloudflareContext };

export async function applyCloudflareB2Check(
  options: CloudflareB2ApplyOptions,
): Promise<CloudflareB2ApplyResult> {
  validateExpectedFingerprint(options.expectedFingerprint);
  const profile = parseCloudflareB2Profile({
    schemaVersion: "phase6b2.v1",
    policies: options.profile.policies,
  });
  if (
    profile.fingerprint !== options.profile.fingerprint ||
    profile.fingerprint !== options.expectedProfileFingerprint ||
    !/^[a-f0-9]{64}$/.test(options.expectedProfileFingerprint)
  ) {
    throw applyRejected("B2 policy profile fingerprint is stale or invalid");
  }
  const discovery = new CloudflareDiscoveryService(options.discoveryClient);
  const firstPlan = await discoverPlan(discovery, options.desired);
  const action = b2ActionForCheck(options.checkId, firstPlan);
  assertB2Plan(firstPlan, options.expectedFingerprint, options.checkId, action);
  const secondPlan = await discoverPlan(discovery, options.desired);
  assertB2Plan(secondPlan, options.expectedFingerprint, options.checkId, action);
  await assertB2IdentityIsolation(options.discoveryClient, secondPlan, action, profile);
  const transport = await options.createWriteTransport(secondPlan);
  const immediatePlan = await discoverPlan(discovery, options.desired);
  assertB2Plan(immediatePlan, options.expectedFingerprint, options.checkId, action);
  await assertB2IdentityIsolation(options.discoveryClient, immediatePlan, action, profile);
  let resourceType: CloudflareB2ApplyResult["resourceType"];
  let resourceId = "";
  let attempted = false;
  try {
    if (action.kind === "tunnel_create" || action.kind === "tunnel_protect") {
      const routes = await deriveExactIngressWrite(options.discoveryClient, secondPlan, action);
      attempted = true;
      await transport.replaceExactTunnelIngress(secondPlan, routes);
      resourceType = "tunnel_ingress";
      resourceId = secondPlan.observed.tunnel.selected!.id;
    } else if (action.kind === "application_create") {
      if (secondPlan.desired.access.applications[action.context].id !== undefined)
        throw applyRejected("Cloudflare-generated application ID cannot be recreated");
      attempted = true;
      resourceId = await transport.createExactApplication(secondPlan, action.context, profile);
      resourceType = "access_application";
    } else if (action.kind === "application_rename") {
      const accountId = secondPlan.observed.account.selected!.id;
      const appId = secondPlan.observed.applications[action.context].selected!.id;
      const rawApplications = await options.discoveryClient.listAccessApplications(accountId);
      const rawApplication = rawApplications.find(
        (item) => isPlainRecord(item) && item.id === appId,
      );
      attempted = true;
      await transport.correctExactApplicationName(secondPlan, action.context, rawApplication);
      resourceId = appId;
      resourceType = "access_application";
    } else if (action.kind === "policy_tighten") {
      resourceId = secondPlan.observed.policies.admin.policies[0]!.id;
      attempted = true;
      await transport.tightenExactPolicy(secondPlan, "admin", resourceId, profile);
      resourceType = "access_policy";
    } else {
      attempted = true;
      resourceId = await transport.createExactPolicy(secondPlan, action.context, profile);
      resourceType = "access_policy";
    }
    const afterPlan = await discoverPlan(discovery, options.desired);
    assertB2Postcondition(secondPlan, afterPlan, action, resourceId);
    await assertB2IdentityIsolation(options.discoveryClient, afterPlan, action, profile, true);
    await options.verifyRequiredRegression({
      expectedFingerprint: secondPlan.fingerprint,
      checkId: options.checkId,
    });
    return {
      status: "applied",
      checkId: options.checkId,
      resourceType,
      resourceId,
      fingerprintBefore: secondPlan.fingerprint,
      fingerprintAfter: afterPlan.fingerprint,
      mutationCount: 1,
    };
  } catch (error) {
    if (!attempted) throw error;
    const expectedResourceType = action.kind.startsWith("tunnel")
      ? "tunnel_ingress"
      : action.kind.startsWith("application")
        ? "access_application"
        : "access_policy";
    const knownResourceId =
      resourceId ||
      (expectedResourceType === "tunnel_ingress"
        ? secondPlan.observed.tunnel.selected?.id
        : expectedResourceType === "access_application"
          ? secondPlan.observed.applications[action.context].selected?.id
          : secondPlan.observed.policies[action.context].policies[0]?.id);
    const loginRequired = error instanceof BridgeError && /\bLOGIN_REQUIRED\b/.test(error.message);
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_MANUAL_REQUIRED,
      `MANUAL_REQUIRED: Cloudflare ${expectedResourceType} ${knownResourceId ?? "response ID unavailable"} write/postcondition is uncertain; inspect the exact Dashboard resource and field for ${options.checkId}, keep other Tunnel/Access resources unchanged, then rerun the documented Phase 6-B2 acceptance command to rediscover before any retry${loginRequired ? "; Phase 5-C returned LOGIN_REQUIRED: physically approve the existing local QR flow before read-only verification" : ""}`,
      {
        checkId: options.checkId,
        resourceType: expectedResourceType,
        resourceId: knownResourceId ?? null,
        reasonCode: errorCode(error),
      },
    );
  }
}

function b2ActionForCheck(checkId: string, plan: CloudflareReadOnlyPlan): B2Action {
  const tunnel = /^tunnel\.ingress\.(human|admin|machine)\.(route|access)$/.exec(checkId);
  if (tunnel)
    return {
      kind: tunnel[2] === "route" ? "tunnel_create" : "tunnel_protect",
      context: tunnel[1] as CloudflareContext,
    };
  const app = /^access\.application\.(human|admin|machine)\.identity$/.exec(checkId);
  if (app) {
    const check = plan.checks.find((item) => item.id === checkId);
    return {
      kind:
        check?.classification === "mismatch" && check.reason === "application_name_mismatch"
          ? "application_rename"
          : "application_create",
      context: app[1] as CloudflareContext,
    };
  }
  const policy = /^access\.policy\.(human|admin|machine)\.shape$/.exec(checkId);
  if (policy) return { kind: "policy_create", context: policy[1] as CloudflareContext };
  if (checkId === "access.policy.admin.mfa") return { kind: "policy_tighten", context: "admin" };
  throw applyRejected("Selected check is outside the exact Phase 6-B2 mutation surface");
}

function assertB2Plan(
  plan: CloudflareReadOnlyPlan,
  expected: string,
  checkId: string,
  action: B2Action,
): void {
  assertExpectedFingerprint(plan, expected);
  const matches = plan.checks.filter((check) => check.id === checkId);
  if (matches.length !== 1) throw applyRejected("Selected B2 check is not unique");
  const check = matches[0]!;
  if (
    action.kind === "tunnel_create" ||
    action.kind === "application_create" ||
    action.kind === "policy_create"
  ) {
    if (check.classification !== "missing" || check.action !== "create")
      throw applyRejected("Selected B2 check is not an exact missing create action");
  } else if (action.kind === "tunnel_protect") {
    if (check.classification !== "unsafe_conflict" || check.reason !== "access_protection_missing")
      throw applyRejected("Tunnel protection correction is not an exact tightening action");
  } else if (action.kind === "application_rename") {
    if (
      check.classification !== "mismatch" ||
      check.action !== "update" ||
      check.reason !== "application_name_mismatch"
    )
      throw applyRejected("Application correction is not an exact name change");
  } else if (
    check.classification !== "unsafe_conflict" ||
    check.reason !== "administrator_mfa_explicitly_disabled"
  ) {
    throw applyRejected("Policy correction is not an exact MFA tightening action");
  }
  for (const item of plan.checks) {
    if (!forbiddenPlanClassifications.has(item.classification)) continue;
    if (
      action.kind === "application_create" &&
      item.id.startsWith(`access.policy.${action.context}.`)
    )
      continue;
    if (
      action.kind === "policy_create" &&
      item.id.startsWith(`access.policy.${action.context}.`) &&
      item.id !== `access.policy.${action.context}.broad` &&
      item.id !== `access.policy.${action.context}.bypass`
    )
      continue;
    if (action.kind === "tunnel_protect" && item.id === checkId) continue;
    if (action.kind === "policy_tighten" && item.id === checkId) continue;
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_UNSAFE_CONFLICT,
      "Cloudflare B2 apply is blocked by a non-target conflict",
      { checkId: boundedId(item.id), classification: item.classification },
    );
  }
  if (
    plan.observed.account.status !== "found" ||
    plan.observed.zone.status !== "found" ||
    plan.observed.tunnel.status !== "found" ||
    plan.observed.tunnelConfiguration.status !== "found"
  )
    throw applyRejected("Cloudflare B2 base identities are incomplete");
  if (
    action.kind === "application_create" &&
    plan.observed.applications[action.context].status !== "missing"
  )
    throw applyRejected("Access application is not uniquely missing");
  if (
    action.kind === "policy_create" &&
    (plan.observed.applications[action.context].status !== "found" ||
      plan.observed.policies[action.context].policies.length !== 0)
  )
    throw applyRejected("Access policy is not uniquely missing");
}

async function deriveExactIngressWrite(
  client: CloudflareDiscoveryClient,
  plan: CloudflareReadOnlyPlan,
  action: Extract<B2Action, { readonly kind: "tunnel_create" | "tunnel_protect" }>,
) {
  const accountId = plan.observed.account.selected!.id;
  const tunnelId = plan.observed.tunnel.selected!.id;
  const raw = await client.getTunnelConfiguration(accountId, tunnelId);
  if (
    !isPlainRecord(raw) ||
    raw.account_id !== accountId ||
    raw.version !== plan.observed.tunnelConfiguration.selected?.version ||
    !isPlainRecord(raw.config) ||
    Object.keys(raw.config).join(",") !== "ingress" ||
    !Array.isArray(raw.config.ingress)
  )
    throw applyRejected("Tunnel raw configuration cannot be safely preserved");
  const desiredHosts = new Map(
    (["human", "admin", "machine"] as const).map((context) => [
      plan.desired.access.applications[context].hostname,
      context,
    ]),
  );
  const routes: Array<{
    hostname?: string;
    service: string;
    originRequest?: { access: { required: true; teamName: string; audTag: string[] } };
  }> = [];
  let fallbackCount = 0;
  const seen = new Set<string>();
  for (const candidate of raw.config.ingress) {
    if (!isPlainRecord(candidate)) throw applyRejected("Tunnel ingress has an unsupported route");
    if (
      candidate.hostname === undefined &&
      candidate.service === "http_status:404" &&
      Object.keys(candidate).join(",") === "service"
    ) {
      fallbackCount += 1;
      continue;
    }
    if (
      typeof candidate.hostname !== "string" ||
      !desiredHosts.has(candidate.hostname) ||
      seen.has(candidate.hostname) ||
      candidate.service !== "http://127.0.0.1:17282" ||
      Object.keys(candidate).sort().join(",") !==
        (candidate.originRequest === undefined
          ? "hostname,service"
          : "hostname,originRequest,service")
    )
      throw applyRejected("Tunnel ingress route is not exact and safe");
    const context = desiredHosts.get(candidate.hostname)!;
    if (candidate.originRequest === undefined) {
      if (action.kind !== "tunnel_protect" || context !== action.context)
        throw applyRejected("Tunnel ingress has an unprotected non-target route");
    } else if (
      !isPlainRecord(candidate.originRequest) ||
      Object.keys(candidate.originRequest).join(",") !== "access" ||
      !isPlainRecord(candidate.originRequest.access) ||
      candidate.originRequest.access.required !== true ||
      candidate.originRequest.access.teamName !== plan.desired.access.teamName ||
      JSON.stringify(candidate.originRequest.access.audTag) !==
        JSON.stringify([plan.desired.access.applications[context].audience])
    ) {
      throw applyRejected("Tunnel ingress Access binding is not exact");
    }
    seen.add(candidate.hostname);
    routes.push(candidate as (typeof routes)[number]);
  }
  if (
    fallbackCount !== 1 ||
    (action.kind === "tunnel_create" &&
      seen.has(plan.desired.access.applications[action.context].hostname)) ||
    (action.kind === "tunnel_protect" &&
      !seen.has(plan.desired.access.applications[action.context].hostname))
  )
    throw applyRejected("Tunnel ingress target is not uniquely actionable");
  const expectedRoute = {
    hostname: plan.desired.access.applications[action.context].hostname,
    service: "http://127.0.0.1:17282",
    originRequest: {
      access: {
        required: true as const,
        teamName: plan.desired.access.teamName,
        audTag: [plan.desired.access.applications[action.context].audience],
      },
    },
  };
  if (action.kind === "tunnel_create") routes.push(expectedRoute);
  else {
    const index = routes.findIndex((route) => route.hostname === expectedRoute.hostname);
    routes[index] = expectedRoute;
  }
  routes.sort((left, right) => left.hostname!.localeCompare(right.hostname!));
  routes.push({ service: "http_status:404" });
  return routes;
}

function assertB2Postcondition(
  before: CloudflareReadOnlyPlan,
  after: CloudflareReadOnlyPlan,
  action: B2Action,
  resourceId: string,
): void {
  if (action.kind === "tunnel_create" || action.kind === "tunnel_protect") {
    const route = after.observed.tunnelConfiguration.selected?.ingress.filter(
      (item) => item.hostname === before.desired.access.applications[action.context].hostname,
    );
    if (
      route?.length !== 1 ||
      route[0]?.service !== "http://127.0.0.1:17282" ||
      route[0].access?.required !== true ||
      route[0].access.teamName !== before.desired.access.teamName ||
      JSON.stringify(route[0].access.audienceTags) !==
        JSON.stringify([before.desired.access.applications[action.context].audience])
    )
      throw postcondition();
  } else if (action.kind === "application_create" || action.kind === "application_rename") {
    const app = after.observed.applications[action.context].selected;
    if (
      !app ||
      app.id !== resourceId ||
      app.name !== before.desired.access.applications[action.context].name ||
      app.domain !== before.desired.access.applications[action.context].hostname ||
      app.audience !== before.desired.access.applications[action.context].audience ||
      app.type !== "self_hosted" ||
      app.mfaDisabled !== false ||
      after.observed.policies[action.context].policies.length !== 1
    )
      throw postcondition();
  } else {
    const collection = after.observed.policies[action.context];
    if (
      collection.policies.length !== 1 ||
      collection.policies[0]?.id !== resourceId ||
      collection.policies[0].decision !==
        before.desired.access.policies[action.context].requiredDecision ||
      (action.kind === "policy_tighten" && collection.policies[0].mfaDisabled !== false)
    )
      throw postcondition();
  }
  const strip = (plan: CloudflareReadOnlyPlan) => {
    const observation = plan.observed;
    if (action.kind.startsWith("tunnel")) {
      return canonicalize({ ...observation, tunnelConfiguration: null });
    }
    if (action.kind === "application_create") {
      return canonicalize({
        ...observation,
        applications: { ...observation.applications, [action.context]: null },
        policies: { ...observation.policies, [action.context]: null },
      });
    }
    if (action.kind === "application_rename")
      return canonicalize({
        ...observation,
        applications: { ...observation.applications, [action.context]: null },
      });
    return canonicalize({
      ...observation,
      policies: { ...observation.policies, [action.context]: null },
    });
  };
  if (strip(before) !== strip(after)) throw postcondition();
  const rejected = after.checks.find((check) =>
    forbiddenPlanClassifications.has(check.classification),
  );
  if (rejected) throw postcondition();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function postcondition(): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_POSTCONDITION_FAILED,
    "Cloudflare B2 exact postcondition was not proven",
  );
}

async function assertB2IdentityIsolation(
  client: CloudflareDiscoveryClient,
  plan: CloudflareReadOnlyPlan,
  action: B2Action,
  profile: CloudflareB2Profile,
  afterWrite = false,
): Promise<void> {
  const accountId = plan.observed.account.selected!.id;
  const tunnels = await client.listTunnels(accountId);
  const intendedTunnel = plan.observed.tunnel.selected!;
  if (
    tunnels.filter(
      (entry) =>
        isPlainRecord(entry) &&
        (entry.id === intendedTunnel.id || entry.name === intendedTunnel.name),
    ).length !== 1
  )
    throw applyRejected("Duplicate Tunnel identity is not safe for B2 apply");
  const applications = await client.listAccessApplications(accountId);
  const policyIds = new Set<string>();
  for (const context of ["human", "admin", "machine"] as const) {
    const desired = plan.desired.access.applications[context];
    const matches = applications.filter(
      (entry) =>
        isPlainRecord(entry) &&
        (entry.domain === desired.hostname ||
          entry.aud === desired.audience ||
          entry.id === desired.id ||
          entry.name === desired.name),
    );
    if (
      matches.length !==
      (action.kind === "application_create" && action.context === context && !afterWrite ? 0 : 1)
    )
      throw applyRejected(
        "Duplicate or missing Access application identity is not safe for B2 apply",
      );
    const app = plan.observed.applications[context].selected;
    if (action.kind === "application_create" && action.context === context && !afterWrite) continue;
    if (
      !app ||
      !isPlainRecord(matches[0]) ||
      matches[0].id !== app.id ||
      matches[0].domain !== desired.hostname ||
      matches[0].aud !== desired.audience
    )
      throw applyRejected("Access application hostname or audience mismatch");
    const policies = await client.listAccessPolicies(accountId, app.id);
    if (
      action.kind === "policy_create" &&
      action.context === context &&
      policies.length === 0 &&
      !afterWrite
    )
      continue;
    if (policies.length !== 1 || !isPlainRecord(policies[0]))
      throw applyRejected("Access policy identity is ambiguous");
    const policy = policies[0];
    if (typeof policy.id !== "string" || policyIds.has(policy.id))
      throw applyRejected("Access policy ID is reused across profiles");
    policyIds.add(policy.id);
    const selector = profile.policies[context].selector;
    const expectedSelector =
      selector.kind === "email"
        ? { email: { email: selector.value } }
        : selector.kind === "group"
          ? { group: { id: selector.value } }
          : { service_token: { token_id: selector.value } };
    if (
      policy.name !== profile.policies[context].name ||
      policy.session_duration !== profile.policies[context].sessionDuration ||
      policy.decision !== (context === "machine" ? "non_identity" : "allow") ||
      JSON.stringify(policy.include) !== JSON.stringify([expectedSelector]) ||
      !Array.isArray(policy.require) ||
      policy.require.length !== 0 ||
      !Array.isArray(policy.exclude) ||
      policy.exclude.length !== 0 ||
      policy.id !== plan.observed.policies[context].policies[0]?.id
    )
      throw applyRejected("Access policy exact selector binding is not proven");
    if (
      context === "admin" &&
      (!isPlainRecord(policy.mfa_config) ||
        policy.mfa_config.mfa_disabled !==
          (action.kind === "policy_tighten" && !afterWrite ? true : false))
    )
      throw applyRejected("Administrator MFA policy state is not exact");
  }
}
