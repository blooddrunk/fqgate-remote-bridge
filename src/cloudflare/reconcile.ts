import { createHash } from "node:crypto";
import {
  CLOUDFLARE_CONTEXTS,
  CLOUDFLARE_BRIDGE_ORIGIN,
  CLOUDFLARE_PLAN_SCHEMA_VERSION,
  type CloudflareApplicationObservation,
  type CloudflareContext,
  type CloudflareDesiredPolicy,
  type CloudflareDesiredState,
  type CloudflareDnsObservation,
  type CloudflareDriftAction,
  type CloudflareDriftCheck,
  type CloudflareDriftClassification,
  type CloudflareDriftSeverity,
  type CloudflareIngressObservation,
  type CloudflareObservedState,
  type CloudflarePolicyCollectionObservation,
  type CloudflarePolicyObservation,
  type CloudflareReadOnlyPlan,
  type CloudflareSelection,
  type JsonValue,
} from "./types.js";

export function reconcileCloudflareState(
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): CloudflareReadOnlyPlan {
  const checks: CloudflareDriftCheck[] = [];
  checkAccount(checks, desired, observed);
  checkZone(checks, desired, observed);
  checkTunnel(checks, desired, observed);
  checkTunnelConfiguration(checks, desired, observed);
  checkApplications(checks, desired, observed);
  checkApplicationIsolation(checks, observed);
  checkUnexpectedApplications(checks, desired, observed);
  checkDns(checks, desired, observed);
  checkPolicies(checks, desired, observed);

  const sortedChecks = [...checks].sort((left, right) => left.id.localeCompare(right.id));
  const summary = summarize(sortedChecks);
  const fingerprintInput = {
    schemaVersion: CLOUDFLARE_PLAN_SCHEMA_VERSION,
    phase: "6-A" as const,
    readOnly: true as const,
    mutationMethods: [] as const,
    desired,
    observed,
    checks: sortedChecks,
    summary,
  };
  const canonical = canonicalizeJson(fingerprintInput);
  assertCloudflarePlanSecretFree(canonical);
  const fingerprint = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { ...fingerprintInput, fingerprint };
}

export const buildCloudflareReadOnlyPlan = reconcileCloudflareState;

export function serializeCloudflarePlanForFingerprint(plan: CloudflareReadOnlyPlan): string {
  const withoutFingerprint = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "fingerprint"),
  );
  return canonicalizeJson(withoutFingerprint);
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function cloudflarePlanFingerprint(plan: CloudflareReadOnlyPlan): string {
  return createHash("sha256")
    .update(serializeCloudflarePlanForFingerprint(plan), "utf8")
    .digest("hex");
}

export function assertCloudflarePlanSecretFree(serializedPlan: string): void {
  const lower = serializedPlan.toLowerCase();
  const forbidden = [
    "authorization",
    "client_secret",
    "clientsecret",
    "access_assertion",
    "cf-access-jwt-assertion",
    "cookie",
    "jwt",
    "tunnel_token",
    "qr_image_base64",
  ];
  const hit = forbidden.find((marker) => lower.includes(marker));
  if (hit !== undefined) {
    throw new Error(`Cloudflare read-only plan contains a forbidden sensitive marker: ${hit}`);
  }
}

function checkAccount(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  checkSelection(
    checks,
    "account.identity",
    observed.account,
    { id: desired.account.id ?? null, name: desired.account.name },
    (value) => ({ id: value.id, name: value.name }),
    (value) =>
      value.name === desired.account.name &&
      (desired.account.id === undefined || value.id === desired.account.id)
        ? undefined
        : "account_identity_mismatch",
  );
}

function checkZone(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  checkSelection(
    checks,
    "zone.identity",
    observed.zone,
    { id: desired.zone.id ?? null, name: desired.zone.name, accountId: desired.account.id ?? null },
    (value) => ({ id: value.id, name: value.name, accountId: value.accountId }),
    (value) =>
      value.name === desired.zone.name &&
      (desired.zone.id === undefined || value.id === desired.zone.id) &&
      (value.accountId === null || observed.account.selected?.id === value.accountId)
        ? undefined
        : "zone_identity_mismatch",
    (value) =>
      value.accountId !== null && value.accountId !== observed.account.selected?.id
        ? "unsafe_conflict"
        : undefined,
  );
}

function checkTunnel(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  checkSelection(
    checks,
    "tunnel.identity",
    observed.tunnel,
    { id: desired.tunnel.id ?? null, name: desired.tunnel.name },
    (value) => ({ id: value.id, name: value.name }),
    (value) =>
      value.name === desired.tunnel.name &&
      (desired.tunnel.id === undefined || value.id === desired.tunnel.id)
        ? undefined
        : "tunnel_identity_mismatch",
  );
  const selected = observed.tunnel.selected;
  if (selected === undefined) {
    addBlockedOrSelectionChecks(checks, "tunnel.mode", observed.tunnel, "tunnel_not_selected");
    return;
  }
  if (selected.configSrc !== "cloudflare" || selected.remoteConfig === false) {
    addCheck(
      checks,
      "tunnel.mode",
      "unsafe_conflict",
      "none",
      "Tunnel must be remotely managed with config_src=cloudflare",
      {
        expected: { configSrc: "cloudflare" },
        observed: tunnelSummary(selected),
      },
    );
  } else {
    addCheck(checks, "tunnel.mode", "in_sync", "none", "remote_managed_tunnel");
  }
}

function checkTunnelConfiguration(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  const configuration = observed.tunnelConfiguration;
  if (configuration.status !== "found" || configuration.selected === undefined) {
    addBlockedOrSelectionChecks(
      checks,
      "tunnel.configuration",
      configuration,
      "tunnel_config_unavailable",
    );
    return;
  }
  const ingress = configuration.selected.ingress;
  if (
    configuration.selected.accountId !== null &&
    configuration.selected.accountId !== observed.account.selected?.id
  ) {
    addCheck(
      checks,
      "tunnel.configuration.account",
      "unsafe_conflict",
      "none",
      "tunnel_configuration_account_mismatch",
      {
        expected: { accountId: observed.account.selected?.id ?? null },
        observed: { accountId: configuration.selected.accountId },
      },
    );
  } else {
    addCheck(checks, "tunnel.configuration.account", "in_sync", "none", "tunnel_account_match");
  }
  const desiredHosts = new Set(
    CLOUDFLARE_CONTEXTS.map((context) => desired.access.applications[context].hostname),
  );
  for (const [index, route] of ingress.entries()) {
    const id = `tunnel.ingress.${String(index).padStart(3, "0")}.safety`;
    if (pointsAtFqgate(route.service)) {
      addCheck(checks, id, "unsafe_conflict", "none", "direct_fqgate_origin_17281", {
        expected: { service: CLOUDFLARE_BRIDGE_ORIGIN },
        observed: route.service,
      });
    } else if (isUnsafeBroadIngress(route)) {
      addCheck(checks, id, "unsafe_conflict", "none", "wildcard_or_broad_ingress", {
        expected: { hostname: "exact" },
        observed: ingressSummary(route),
      });
    } else {
      addCheck(checks, id, "in_sync", "none", "ingress_not_direct_or_broad");
    }
  }

  for (const context of CLOUDFLARE_CONTEXTS) {
    const application = desired.access.applications[context];
    const matching = ingress.filter((route) => route.hostname === application.hostname);
    const routeId = `tunnel.ingress.${context}.route`;
    if (matching.length === 0) {
      addCheck(checks, routeId, "missing", "create", "required_hostname_ingress_missing", {
        expected: { hostname: application.hostname, service: CLOUDFLARE_BRIDGE_ORIGIN },
      });
      continue;
    }
    if (matching.length !== 1) {
      addCheck(checks, routeId, "ambiguous", "none", "duplicate_hostname_ingress", {
        expected: { hostname: application.hostname },
        observed: matching.map(ingressSummary),
      });
      continue;
    }
    const route = matching[0];
    if (route === undefined) continue;
    const expected = {
      hostname: application.hostname,
      service: CLOUDFLARE_BRIDGE_ORIGIN,
      path: null,
      access: {
        required: true,
        teamName: desired.access.teamName,
        audienceTags: [application.audience],
      },
    };
    const observedSummary = ingressSummary(route);
    if (route.service !== CLOUDFLARE_BRIDGE_ORIGIN || route.path !== null) {
      addCheck(
        checks,
        `${routeId}.origin`,
        "unsafe_conflict",
        "none",
        pointsAtFqgate(route.service)
          ? "direct_fqgate_origin_17281"
          : "ingress_origin_or_path_mismatch",
        { expected: { service: CLOUDFLARE_BRIDGE_ORIGIN, path: null }, observed: observedSummary },
      );
    } else {
      addCheck(checks, `${routeId}.origin`, "in_sync", "none", "exact_bridge_origin");
    }
    if (route.access === null) {
      addCheck(
        checks,
        `${routeId}.access`,
        "unsafe_conflict",
        "none",
        "access_protection_missing",
        { expected: expected.access, observed: null },
      );
    } else if (
      route.access.required !== true ||
      normalizeTeamName(route.access.teamName) !== desired.access.teamName ||
      !sameStringArray(route.access.audienceTags, [application.audience])
    ) {
      addCheck(
        checks,
        `${routeId}.access`,
        "unsafe_conflict",
        "none",
        "access_protection_or_audience_mismatch",
        { expected: expected.access, observed: accessSummary(route.access) },
      );
    } else {
      addCheck(checks, `${routeId}.access`, "in_sync", "none", "exact_access_protection");
    }
  }

  const extras = ingress.filter(
    (route) =>
      route.hostname !== null && !desiredHosts.has(route.hostname) && !isSafeDenyCatchall(route),
  );
  if (extras.length > 0) {
    addCheck(
      checks,
      "tunnel.ingress.unexpected",
      "unsafe_conflict",
      "none",
      "unexpected_ingress_route",
      { expected: { hostnames: [...desiredHosts].sort() }, observed: extras.map(ingressSummary) },
    );
  } else {
    addCheck(checks, "tunnel.ingress.unexpected", "in_sync", "none", "no_unexpected_ingress_route");
  }
}

function checkApplications(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  for (const context of CLOUDFLARE_CONTEXTS) {
    const selection = observed.applications[context];
    const application = desired.access.applications[context];
    checkSelection(
      checks,
      `access.application.${context}.identity`,
      selection,
      { id: application.id ?? null, name: application.name, hostname: application.hostname },
      applicationSummary,
      (value) => {
        if (value.domain !== application.hostname) return "application_hostname_mismatch";
        if (value.audience !== application.audience) return "application_audience_mismatch";
        if (value.type !== application.type) return "application_type_mismatch";
        if (value.name !== application.name) return "application_name_mismatch";
        if (application.id !== undefined && value.id !== application.id)
          return "application_id_mismatch";
        return undefined;
      },
      (value) =>
        value.domain !== application.hostname ||
        value.audience !== application.audience ||
        value.type !== application.type
          ? "unsafe_conflict"
          : undefined,
    );
  }
}

function checkApplicationIsolation(
  checks: CloudflareDriftCheck[],
  observed: CloudflareObservedState,
): void {
  const selected = CLOUDFLARE_CONTEXTS.flatMap((context) => {
    const application = observed.applications[context].selected;
    return application === undefined ? [] : [{ context, application }];
  });
  const duplicateIds = duplicateValues(selected.map((item) => item.application.id));
  const duplicateAudiences = duplicateValues(
    selected
      .map((item) => item.application.audience)
      .filter((audience): audience is string => audience !== null),
  );
  if (duplicateIds.length > 0) {
    addCheck(
      checks,
      "access.application.isolation.ids",
      "unsafe_conflict",
      "none",
      "access_applications_share_an_id",
      { observed: duplicateIds },
    );
  } else {
    addCheck(
      checks,
      "access.application.isolation.ids",
      "in_sync",
      "none",
      "distinct_application_ids",
    );
  }
  if (duplicateAudiences.length > 0) {
    addCheck(
      checks,
      "access.application.isolation.audiences",
      "unsafe_conflict",
      "none",
      "access_applications_share_an_audience",
      { observed: duplicateAudiences },
    );
  } else {
    addCheck(
      checks,
      "access.application.isolation.audiences",
      "in_sync",
      "none",
      "distinct_access_audiences",
    );
  }
}

function checkUnexpectedApplications(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  const duplicateHostnameApplications = observed.unexpectedApplications.filter((candidate) =>
    CLOUDFLARE_CONTEXTS.some((context) => {
      const expected = desired.access.applications[context];
      return (
        candidate.domain === expected.hostname &&
        expected.id !== undefined &&
        candidate.id !== expected.id
      );
    }),
  );
  if (duplicateHostnameApplications.length === 0) {
    addCheck(
      checks,
      "access.application.unexpected-hostname",
      "in_sync",
      "none",
      "no_duplicate_expected_hostname_application",
    );
  } else {
    addCheck(
      checks,
      "access.application.unexpected-hostname",
      "unsafe_conflict",
      "none",
      "duplicate_expected_hostname_application",
      {
        expected: {
          hostnames: CLOUDFLARE_CONTEXTS.map(
            (context) => desired.access.applications[context].hostname,
          ).sort(),
        },
        observed: duplicateHostnameApplications.map(applicationSummary),
      },
    );
  }
  const expectedAudiences = new Set(
    CLOUDFLARE_CONTEXTS.map((context) => desired.access.applications[context].audience),
  );
  const unexpectedAudienceApplications = observed.unexpectedApplications.filter(
    (candidate) =>
      candidate.audience !== null &&
      expectedAudiences.has(candidate.audience) &&
      !CLOUDFLARE_CONTEXTS.some((context) => {
        const expected = desired.access.applications[context];
        return (
          (expected.id !== undefined && candidate.id === expected.id) ||
          (expected.id === undefined && candidate.domain === expected.hostname)
        );
      }),
  );
  if (unexpectedAudienceApplications.length === 0) {
    addCheck(
      checks,
      "access.application.unexpected-audience",
      "in_sync",
      "none",
      "no_unexpected_access_audience_application",
    );
  } else {
    addCheck(
      checks,
      "access.application.unexpected-audience",
      "unsafe_conflict",
      "none",
      "unexpected_access_audience_application",
      { observed: unexpectedAudienceApplications.map(applicationSummary) },
    );
  }
}

function checkDns(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  const target =
    desired.tunnel.dnsTarget ??
    (observed.tunnel.selected === undefined
      ? desired.tunnel.id === undefined
        ? null
        : `${desired.tunnel.id}.cfargotunnel.com`
      : `${observed.tunnel.selected.id}.cfargotunnel.com`);
  for (const context of CLOUDFLARE_CONTEXTS) {
    const hostname = desired.access.applications[context].hostname;
    const selection = observed.dns[context];
    const id = `dns.${context}.record`;
    if (target === null) {
      addCheck(checks, id, "manual_required", "none", "dns_target_cannot_be_derived", {
        expected: { hostname, type: "CNAME", proxied: true },
      });
      continue;
    }
    checkSelection(
      checks,
      id,
      selection,
      { name: hostname, type: "CNAME", content: target, proxied: true },
      (value) => dnsSummary(value),
      (value) => {
        if (value.name !== hostname || value.type !== "CNAME" || value.proxied !== true) {
          return "dns_record_type_or_proxy_mismatch";
        }
        return value.content === target ? undefined : "dns_record_target_mismatch";
      },
      (value) =>
        value.type !== "CNAME" || value.proxied !== true || value.content !== target
          ? "unsafe_conflict"
          : undefined,
    );
  }
}

function checkPolicies(
  checks: CloudflareDriftCheck[],
  desired: CloudflareDesiredState,
  observed: CloudflareObservedState,
): void {
  for (const context of CLOUDFLARE_CONTEXTS) {
    const collection = observed.policies[context];
    const requirement = desired.access.policies[context];
    checkPolicyCollection(
      checks,
      context,
      collection,
      requirement,
      observed.applications[context].selected,
    );
  }
}

function checkPolicyCollection(
  checks: CloudflareDriftCheck[],
  context: CloudflareContext,
  collection: CloudflarePolicyCollectionObservation,
  requirement: CloudflareDesiredPolicy,
  application: CloudflareApplicationObservation | undefined,
): void {
  const id = `access.policy.${context}.shape`;
  if (collection.status === "blocked") {
    addCheck(checks, id, "blocked", "none", "policy_lookup_blocked_by_missing_application");
    return;
  }
  const policies = collection.policies;
  if (policies.length < requirement.minimumCount) {
    addCheck(checks, id, "missing", "create", "required_access_policy_missing", {
      expected: { minimumCount: requirement.minimumCount },
      observed: { count: policies.length },
    });
  } else {
    addCheck(checks, id, "in_sync", "none", "minimum_access_policy_count_present");
  }

  const broad = policies.filter((policy) => policy.broadSelector);
  if (broad.length > 0) {
    addCheck(
      checks,
      `access.policy.${context}.broad`,
      "unsafe_conflict",
      "none",
      "broad_or_widening_selector",
      { observed: broad.map(policySummary) },
    );
  } else {
    addCheck(checks, `access.policy.${context}.broad`, "in_sync", "none", "no_broad_selector");
  }

  const bypass = policies.filter((policy) => policy.decision?.toLowerCase() === "bypass");
  if (bypass.length > 0) {
    addCheck(
      checks,
      `access.policy.${context}.bypass`,
      "unsafe_conflict",
      "none",
      "bypass_policy_present",
      { observed: bypass.map(policySummary) },
    );
  } else {
    addCheck(checks, `access.policy.${context}.bypass`, "in_sync", "none", "no_bypass_policy");
  }

  const required = policies.filter(
    (policy) => policy.decision?.toLowerCase() === requirement.requiredDecision,
  );
  if (required.length < requirement.minimumCount) {
    addCheck(
      checks,
      `access.policy.${context}.decision`,
      context === "machine" ? "unsafe_conflict" : "mismatch",
      "none",
      "required_policy_decision_missing",
      {
        expected: { decision: requirement.requiredDecision },
        observed: policies.map(policySummary),
      },
    );
  } else {
    addCheck(
      checks,
      `access.policy.${context}.decision`,
      "in_sync",
      "none",
      `required_${requirement.requiredDecision}_policy_present`,
    );
  }

  const nonIdentitySelectorCount = policies.reduce(
    (total, policy) => total + policy.nonIdentitySelectorCount,
    0,
  );
  if (nonIdentitySelectorCount !== requirement.exactNonIdentitySelectorCount) {
    addCheck(
      checks,
      `access.policy.${context}.selector-isolation`,
      "unsafe_conflict",
      "none",
      "non_identity_selector_count_mismatch",
      {
        expected: { count: requirement.exactNonIdentitySelectorCount },
        observed: { count: nonIdentitySelectorCount },
      },
    );
  } else {
    addCheck(
      checks,
      `access.policy.${context}.selector-isolation`,
      "in_sync",
      "none",
      "non_identity_selector_shape_isolated",
    );
  }

  if (context === "machine") {
    const unsafeMachinePolicy = policies.filter(
      (policy) =>
        policy.decision?.toLowerCase() === "non_identity" &&
        (policy.includeKinds.length !== 1 ||
          policy.includeKinds[0]?.toLowerCase() !== "service_token" ||
          policy.requireKinds.length !== 0 ||
          policy.excludeKinds.length !== 0),
    );
    if (unsafeMachinePolicy.length > 0) {
      addCheck(
        checks,
        "access.policy.machine.service-token",
        "unsafe_conflict",
        "none",
        "machine_policy_is_not_scoped_to_a_specific_service_token",
        { observed: unsafeMachinePolicy.map(policySummary) },
      );
    } else {
      addCheck(
        checks,
        "access.policy.machine.service-token",
        "in_sync",
        "none",
        "specific_service_token_selector_present",
      );
    }
    const humanDecision = policies.filter((policy) => policy.decision?.toLowerCase() === "allow");
    if (humanDecision.length > 0) {
      addCheck(
        checks,
        "access.policy.machine.human-isolation",
        "unsafe_conflict",
        "none",
        "machine_application_has_human_allow_policy",
        { observed: humanDecision.map(policySummary) },
      );
    } else {
      addCheck(
        checks,
        "access.policy.machine.human-isolation",
        "in_sync",
        "none",
        "no_human_allow_policy",
      );
    }
  } else {
    const nonIdentityPolicies = policies.filter(
      (policy) =>
        policy.decision?.toLowerCase() === "non_identity" || policy.nonIdentitySelectorCount > 0,
    );
    if (nonIdentityPolicies.length > 0) {
      addCheck(
        checks,
        `access.policy.${context}.machine-isolation`,
        "unsafe_conflict",
        "none",
        "human_application_has_machine_service_auth_policy",
        { observed: nonIdentityPolicies.map(policySummary) },
      );
    } else {
      addCheck(
        checks,
        `access.policy.${context}.machine-isolation`,
        "in_sync",
        "none",
        "no_machine_service_auth_policy",
      );
    }
  }

  if (context === "admin" && requirement.requireMfa) {
    const provenEnabled =
      application?.mfaDisabled === false || policies.some((policy) => policy.mfaDisabled === false);
    const explicitlyDisabled =
      application?.mfaDisabled === true || policies.some((policy) => policy.mfaDisabled === true);
    if (explicitlyDisabled) {
      addCheck(
        checks,
        "access.policy.admin.mfa",
        "unsafe_conflict",
        "none",
        "administrator_mfa_explicitly_disabled",
      );
    } else if (provenEnabled) {
      addCheck(checks, "access.policy.admin.mfa", "in_sync", "none", "administrator_mfa_enabled");
    } else {
      addCheck(
        checks,
        "access.policy.admin.mfa",
        "manual_required",
        "none",
        "api_response_does_not_prove_administrator_mfa",
      );
    }
  } else if (context === "admin") {
    addCheck(checks, "access.policy.admin.mfa", "in_sync", "none", "mfa_requirement_not_requested");
  }
}

function checkSelection<T>(
  checks: CloudflareDriftCheck[],
  id: string,
  selection: CloudflareSelection<T>,
  expected: JsonValue,
  summarize: (value: T) => JsonValue,
  mismatch: (value: T) => string | undefined,
  mismatchClassification?: (value: T) => CloudflareDriftClassification | undefined,
): void {
  if (selection.status === "blocked") {
    addCheck(checks, id, "blocked", "none", "resource_lookup_blocked");
    return;
  }
  if (selection.status === "missing") {
    addCheck(checks, id, "missing", "create", "resource_missing", { expected });
    return;
  }
  if (selection.status === "ambiguous") {
    addCheck(checks, id, "ambiguous", "none", "duplicate_or_ambiguous_resource", {
      expected,
      observed: selection.candidates.map(summarize),
    });
    return;
  }
  const selected = selection.selected;
  if (selected === undefined) {
    addCheck(checks, id, "blocked", "none", "selected_resource_missing");
    return;
  }
  const reason = mismatch(selected);
  if (reason === undefined) {
    addCheck(checks, id, "in_sync", "none", "exact_resource_match");
    return;
  }
  addCheck(
    checks,
    id,
    mismatchClassification?.(selected) ?? "mismatch",
    mismatchClassification?.(selected) === "unsafe_conflict" ? "none" : "update",
    reason,
    { expected, observed: summarize(selected) },
  );
}

function addBlockedOrSelectionChecks<T>(
  checks: CloudflareDriftCheck[],
  id: string,
  selection: CloudflareSelection<T>,
  reason: string,
): void {
  const classification: CloudflareDriftClassification =
    selection.status === "ambiguous"
      ? "ambiguous"
      : selection.status === "missing"
        ? "missing"
        : "blocked";
  addCheck(checks, id, classification, classification === "missing" ? "create" : "none", reason);
}

function addCheck(
  checks: CloudflareDriftCheck[],
  id: string,
  classification: CloudflareDriftClassification,
  action: CloudflareDriftAction,
  reason: string,
  values: { readonly expected?: JsonValue; readonly observed?: JsonValue } = {},
): void {
  const severity: CloudflareDriftSeverity =
    classification === "in_sync"
      ? "info"
      : classification === "ambiguous" ||
          classification === "unsafe_conflict" ||
          classification === "manual_required" ||
          classification === "blocked"
        ? "conflict"
        : "warning";
  checks.push({
    id,
    classification,
    action,
    severity,
    reason,
    ...(values.expected === undefined ? {} : { expected: values.expected }),
    ...(values.observed === undefined ? {} : { observed: values.observed }),
  });
}

function summarize(checks: readonly CloudflareDriftCheck[]) {
  return {
    totalChecks: checks.length,
    passed: checks.filter((check) => check.classification === "in_sync").length,
    drifted: checks.filter((check) => check.classification !== "in_sync").length,
    conflicts: checks.filter(
      (check) => check.classification === "ambiguous" || check.classification === "unsafe_conflict",
    ).length,
    unsafeConflicts: checks.filter((check) => check.classification === "unsafe_conflict").length,
    manualRequired: checks.filter((check) => check.classification === "manual_required").length,
  };
}

function applicationSummary(value: CloudflareApplicationObservation): JsonValue {
  return {
    id: value.id,
    name: value.name,
    domain: value.domain,
    audience: value.audience,
    type: value.type,
    mfaDisabled: value.mfaDisabled,
  };
}

function tunnelSummary(value: {
  readonly id: string;
  readonly name: string;
  readonly configSrc: string | null;
  readonly remoteConfig: boolean | null;
  readonly status: string | null;
}): JsonValue {
  return {
    id: value.id,
    name: value.name,
    configSrc: value.configSrc,
    remoteConfig: value.remoteConfig,
    status: value.status,
  };
}

function accessSummary(value: {
  readonly required: boolean | null;
  readonly teamName: string | null;
  readonly audienceTags: readonly string[];
}): JsonValue {
  return {
    required: value.required,
    teamName: value.teamName,
    audienceTags: value.audienceTags,
  };
}

function dnsSummary(value: CloudflareDnsObservation): JsonValue {
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    content: value.content,
    proxied: value.proxied,
  };
}

function policySummary(value: CloudflarePolicyObservation): JsonValue {
  return {
    id: value.id,
    name: value.name,
    decision: value.decision,
    precedence: value.precedence,
    includeKinds: value.includeKinds,
    requireKinds: value.requireKinds,
    excludeKinds: value.excludeKinds,
    broadSelector: value.broadSelector,
    nonIdentitySelectorCount: value.nonIdentitySelectorCount,
    mfaDisabled: value.mfaDisabled,
    sessionDuration: value.sessionDuration,
  };
}

function ingressSummary(value: CloudflareIngressObservation): JsonValue {
  return {
    hostname: value.hostname,
    path: value.path,
    service: value.service,
    access: value.access === null ? null : accessSummary(value.access),
  };
}

function pointsAtFqgate(service: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\[[^\]]+\]|[^/:\s]+):17281(?:[/?#]|$)/i.test(
    service.trim(),
  );
}

function isUnsafeBroadIngress(route: CloudflareIngressObservation): boolean {
  if (route.hostname?.includes("*") === true) return true;
  return route.hostname === null && !isSafeDenyCatchall(route);
}

function isSafeDenyCatchall(route: CloudflareIngressObservation): boolean {
  return route.hostname === null && /^http_status:[45]\d\d$/i.test(route.service.trim());
}

function normalizeTeamName(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.toLowerCase();
  return normalized.endsWith(".cloudflareaccess.com")
    ? normalized.slice(0, -".cloudflareaccess.com".length)
    : normalized;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

function duplicateValues(values: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function canonicalizeValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot canonicalize a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) output[key] = canonicalizeValue(entry);
    }
    return output;
  }
  throw new Error("Cannot canonicalize an unsupported value");
}
