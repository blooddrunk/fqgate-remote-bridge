import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import {
  CLOUDFLARE_CONTEXTS,
  type CloudflareAccountObservation,
  type CloudflareApplicationObservation,
  type CloudflareContext,
  type CloudflareDesiredState,
  type CloudflareDiscoveryClient,
  type CloudflareDnsObservation,
  type CloudflareIngressObservation,
  type CloudflareObservedState,
  type CloudflarePolicyObservation,
  type CloudflareSelection,
  type CloudflareTunnelConfigurationObservation,
  type CloudflareTunnelObservation,
  type CloudflareZoneObservation,
} from "./types.js";

const CLOUDFLARE_TEAM_SUFFIX = ".cloudflareaccess.com";

export class CloudflareDiscoveryService {
  private readonly client: CloudflareDiscoveryClient;

  constructor(client: CloudflareDiscoveryClient) {
    this.client = client;
  }

  async discover(desired: CloudflareDesiredState): Promise<CloudflareObservedState> {
    const accountCandidates =
      desired.account.id === undefined
        ? (await this.client.listAccounts())
            .map((value) => parseAccount(value))
            .sort(compareByStableId)
        : [parseAccount(await this.client.getAccount(desired.account.id))];
    const account = selectByIdentity(
      accountCandidates,
      desired.account.id,
      desired.account.name,
      (value) => value.id,
      (value) => value.name,
    );

    const zone = await this.discoverZone(account, desired);
    const tunnel = await this.discoverTunnel(account, desired);
    const tunnelConfiguration = await this.discoverTunnelConfiguration(account, tunnel);
    const applicationDiscovery = await this.discoverApplications(account, desired);
    const dns = await this.discoverDns(zone, desired);
    const policies = await this.discoverPolicies(account, applicationDiscovery.selections);

    return {
      account,
      zone,
      tunnel,
      tunnelConfiguration,
      dns,
      applications: applicationDiscovery.selections,
      unexpectedApplications: applicationDiscovery.unexpected,
      policies,
    };
  }

  private async discoverZone(
    account: CloudflareSelection<CloudflareAccountObservation>,
    desired: CloudflareDesiredState,
  ): Promise<CloudflareSelection<CloudflareZoneObservation>> {
    if (account.status !== "found" || account.selected === undefined) {
      return blockedSelection();
    }
    const candidates = (await this.client.listZones(account.selected.id))
      .map((value) => parseZone(value))
      .sort(compareByStableId);
    return selectByIdentity(
      candidates,
      desired.zone.id,
      desired.zone.name,
      (value) => value.id,
      (value) => value.name,
    );
  }

  private async discoverTunnel(
    account: CloudflareSelection<CloudflareAccountObservation>,
    desired: CloudflareDesiredState,
  ): Promise<CloudflareSelection<CloudflareTunnelObservation>> {
    if (account.status !== "found" || account.selected === undefined) {
      return blockedSelection();
    }
    const candidates = (await this.client.listTunnels(account.selected.id))
      .map((value) => parseTunnel(value))
      .sort(compareByStableId);
    const selected = selectByIdentity(
      candidates,
      desired.tunnel.id,
      desired.tunnel.name,
      (value) => value.id,
      (value) => value.name,
    );
    if (selected.status !== "found" || selected.selected === undefined) return selected;
    const detail = parseTunnel(
      await this.client.getTunnel(account.selected.id, selected.selected.id),
    );
    const merged: CloudflareTunnelObservation = {
      ...selected.selected,
      ...detail,
    };
    return { status: "found", candidates: [merged], selected: merged };
  }

  private async discoverTunnelConfiguration(
    account: CloudflareSelection<CloudflareAccountObservation>,
    tunnel: CloudflareSelection<CloudflareTunnelObservation>,
  ): Promise<CloudflareSelection<CloudflareTunnelConfigurationObservation>> {
    if (
      account.status !== "found" ||
      account.selected === undefined ||
      tunnel.status !== "found" ||
      tunnel.selected === undefined
    ) {
      return blockedSelection();
    }
    const configuration = parseTunnelConfiguration(
      await this.client.getTunnelConfiguration(account.selected.id, tunnel.selected.id),
    );
    return { status: "found", candidates: [configuration], selected: configuration };
  }

  private async discoverApplications(
    account: CloudflareSelection<CloudflareAccountObservation>,
    desired: CloudflareDesiredState,
  ): Promise<{
    readonly selections: CloudflareObservedState["applications"];
    readonly unexpected: readonly CloudflareApplicationObservation[];
  }> {
    if (account.status !== "found" || account.selected === undefined) {
      return { selections: contextRecord(() => blockedSelection()), unexpected: [] };
    }
    const candidates = (await this.client.listAccessApplications(account.selected.id))
      .map((value) => parseApplication(value))
      .sort(compareByStableId);
    const selections = contextRecord((context: CloudflareContext) => {
      const expected = desired.access.applications[context];
      return selectByIdentity(
        candidates.filter((candidate) =>
          expected.id === undefined
            ? candidate.domain === expected.hostname
            : candidate.id === expected.id,
        ),
        expected.id,
        expected.hostname,
        (value) => value.id,
        (value) => value.domain ?? "",
      );
    });
    const expectedApplications = CLOUDFLARE_CONTEXTS.map(
      (context) => desired.access.applications[context],
    );
    const unexpected = candidates.filter((candidate) => {
      const expectedIdentity = expectedApplications.some(
        (expected) =>
          (expected.id !== undefined && candidate.id === expected.id) ||
          (expected.id === undefined && candidate.domain === expected.hostname),
      );
      const duplicateExpectedHostname = expectedApplications.some(
        (expected) =>
          candidate.domain === expected.hostname &&
          expected.id !== undefined &&
          candidate.id !== expected.id,
      );
      const duplicateExpectedAudience = expectedApplications.some(
        (expected) => candidate.audience === expected.audience && !expectedIdentity,
      );
      return duplicateExpectedHostname || duplicateExpectedAudience;
    });
    return { selections, unexpected };
  }

  private async discoverDns(
    zone: CloudflareSelection<CloudflareZoneObservation>,
    desired: CloudflareDesiredState,
  ): Promise<CloudflareObservedState["dns"]> {
    if (zone.status !== "found" || zone.selected === undefined) {
      return contextRecord(() => blockedSelection());
    }
    return contextRecordAsync(async (context) => {
      const hostname = desired.access.applications[context].hostname;
      const records = (await this.client.listDnsRecords(zone.selected!.id, hostname))
        .map((value) => parseDnsRecord(value))
        .sort(compareByStableId);
      const exact = records.filter((record) => record.name === hostname);
      return selectDnsRecords(exact);
    });
  }

  private async discoverPolicies(
    account: CloudflareSelection<CloudflareAccountObservation>,
    applications: CloudflareObservedState["applications"],
  ): Promise<CloudflareObservedState["policies"]> {
    if (account.status !== "found" || account.selected === undefined) {
      return contextRecord(() => ({ status: "blocked", policies: [] }));
    }
    return contextRecordAsync(async (context) => {
      const application = applications[context];
      if (application.status !== "found" || application.selected === undefined) {
        return { status: "blocked", policies: [] };
      }
      const policies = (
        await this.client.listAccessPolicies(account.selected!.id, application.selected.id)
      ).map((value) => parsePolicy(value));
      return { status: "found", policies: sortPolicies(policies) };
    });
  }
}

export async function discoverCloudflareState(
  client: CloudflareDiscoveryClient,
  desired: CloudflareDesiredState,
): Promise<CloudflareObservedState> {
  return new CloudflareDiscoveryService(client).discover(desired);
}

function parseAccount(value: unknown): CloudflareAccountObservation {
  const record = requiredRecord(value, "account");
  return {
    id: requiredString(record.id, "account.id", 128),
    name: requiredString(record.name, "account.name", 100),
  };
}

function parseZone(value: unknown): CloudflareZoneObservation {
  const record = requiredRecord(value, "zone");
  const account = record.account;
  return {
    id: requiredString(record.id, "zone.id", 128),
    name: normalizeHostname(requiredString(record.name, "zone.name", 253)),
    accountId:
      account === undefined || account === null
        ? null
        : requiredRecord(account, "zone.account").id === undefined
          ? null
          : requiredString(requiredRecord(account, "zone.account").id, "zone.account.id", 128),
  };
}

function parseTunnel(value: unknown): CloudflareTunnelObservation {
  const record = requiredRecord(value, "tunnel");
  return {
    id: requiredString(record.id, "tunnel.id", 128),
    name: requiredString(record.name, "tunnel.name", 128),
    configSrc: nullableString(record.config_src, "tunnel.config_src", 64),
    remoteConfig: nullableBoolean(record.remote_config, "tunnel.remote_config"),
    status: nullableString(record.status, "tunnel.status", 64),
  };
}

function parseTunnelConfiguration(value: unknown): CloudflareTunnelConfigurationObservation {
  const record = requiredRecord(value, "tunnel configuration");
  const config = record.config;
  const configRecord =
    config === undefined || config === null ? {} : requiredRecord(config, "tunnel.config");
  const ingressValue = configRecord.ingress;
  if (ingressValue !== undefined && !Array.isArray(ingressValue)) {
    throw invalidResponse("tunnel configuration", "config.ingress is not an array");
  }
  const ingress = (ingressValue ?? []).map((item) => parseIngress(item)).sort(compareIngress);
  return {
    accountId: nullableString(record.account_id, "tunnel configuration.account_id", 128),
    version: nullableInteger(record.version, "tunnel configuration.version"),
    ingress,
  };
}

function parseIngress(value: unknown): CloudflareIngressObservation {
  const record = requiredRecord(value, "tunnel ingress");
  const accessValue = record.originRequest;
  const originRequest =
    accessValue === undefined || accessValue === null
      ? null
      : requiredRecord(accessValue, "originRequest");
  const accessValueNested = originRequest?.access;
  const access =
    accessValueNested === undefined || accessValueNested === null
      ? null
      : parseTunnelAccess(accessValueNested);
  return {
    hostname:
      record.hostname === undefined || record.hostname === null
        ? null
        : normalizeHostname(requiredString(record.hostname, "tunnel ingress.hostname", 253)),
    path: nullableString(record.path, "tunnel ingress.path", 512),
    service: requiredString(record.service, "tunnel ingress.service", 512),
    access,
  };
}

function parseTunnelAccess(value: unknown) {
  const record = requiredRecord(value, "tunnel ingress access");
  const audienceTags = record.audTag;
  if (audienceTags !== undefined && !Array.isArray(audienceTags)) {
    throw invalidResponse("tunnel ingress access", "audTag is not an array");
  }
  return {
    required: nullableBoolean(record.required, "tunnel ingress access.required"),
    teamName: normalizeNullableTeamName(record.teamName),
    audienceTags: (audienceTags ?? [])
      .map((audience) => requiredString(audience, "audTag", 256))
      .sort(),
  };
}

function parseDnsRecord(value: unknown): CloudflareDnsObservation {
  const record = requiredRecord(value, "DNS record");
  return {
    id: requiredString(record.id, "DNS record.id", 128),
    name: normalizeHostname(requiredString(record.name, "DNS record.name", 253)),
    type: requiredString(record.type, "DNS record.type", 32).toUpperCase(),
    content: requiredString(record.content, "DNS record.content", 512),
    proxied: nullableBoolean(record.proxied, "DNS record.proxied"),
  };
}

function parseApplication(value: unknown): CloudflareApplicationObservation {
  const record = requiredRecord(value, "Access application");
  const mfaConfig = record.mfa_config;
  return {
    id: requiredString(record.id, "Access application.id", 128),
    name: nullableString(record.name, "Access application.name", 200),
    domain:
      record.domain === undefined || record.domain === null
        ? null
        : normalizeAccessDomain(requiredString(record.domain, "Access application.domain", 512)),
    audience: nullableString(record.aud, "Access application.aud", 256),
    type: nullableString(record.type, "Access application.type", 64),
    mfaDisabled:
      mfaConfig === undefined || mfaConfig === null
        ? null
        : nullableBoolean(
            requiredRecord(mfaConfig, "Access application.mfa_config").mfa_disabled,
            "Access application.mfa_config.mfa_disabled",
          ),
  };
}

function parsePolicy(value: unknown): CloudflarePolicyObservation {
  const record = requiredRecord(value, "Access policy");
  const includeKinds = selectorKinds(record.include, "Access policy.include");
  const requireKinds = selectorKinds(record.require, "Access policy.require");
  const excludeKinds = selectorKinds(record.exclude, "Access policy.exclude");
  const mfaConfig = record.mfa_config;
  const allKinds = [...includeKinds, ...requireKinds, ...excludeKinds];
  return {
    id: requiredString(record.id, "Access policy.id", 128),
    name: nullableString(record.name, "Access policy.name", 200),
    decision: nullableString(record.decision, "Access policy.decision", 64),
    precedence: nullableInteger(record.precedence, "Access policy.precedence"),
    includeKinds,
    requireKinds,
    excludeKinds,
    broadSelector: allKinds.some(isBroadSelector),
    nonIdentitySelectorCount: allKinds.filter(isNonIdentitySelector).length,
    mfaDisabled:
      mfaConfig === undefined || mfaConfig === null
        ? null
        : nullableBoolean(
            requiredRecord(mfaConfig, "Access policy.mfa_config").mfa_disabled,
            "Access policy.mfa_config.mfa_disabled",
          ),
    sessionDuration: nullableString(record.session_duration, "Access policy.session_duration", 64),
  };
}

function selectorKinds(value: unknown, scope: string): readonly string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidResponse("Access policy", `${scope} is not an array`);
  return value
    .map((item) => {
      const record = requiredRecord(item, scope);
      const keys = Object.keys(record).sort();
      if (keys.length === 0) return "empty";
      if (keys.length > 1) return "multiple_selector_kinds";
      return keys[0] ?? "empty";
    })
    .sort();
}

function isBroadSelector(kind: string): boolean {
  return new Set([
    "everyone",
    "any_valid_service_token",
    "any_service_token",
    "all_users",
    "login_methods",
    "multiple_selector_kinds",
  ]).has(kind.toLowerCase());
}

function isNonIdentitySelector(kind: string): boolean {
  return new Set([
    "service_token",
    "any_valid_service_token",
    "any_service_token",
    "linked_app_token",
  ]).has(kind.toLowerCase());
}

function selectDnsRecords(
  candidates: readonly CloudflareDnsObservation[],
): CloudflareSelection<CloudflareDnsObservation> {
  const ordered = [...candidates].sort(compareByStableId);
  if (ordered.length === 0) return { status: "missing", candidates: [] };
  if (ordered.length !== 1) return { status: "ambiguous", candidates: ordered };
  const selected = ordered[0];
  if (selected === undefined) return { status: "missing", candidates: [] };
  return { status: "found", candidates: ordered, selected };
}

function selectByIdentity<T>(
  candidates: readonly T[],
  expectedId: string | undefined,
  expectedName: string,
  getId: (value: T) => string,
  getName: (value: T) => string,
): CloudflareSelection<T> {
  const matching =
    expectedId === undefined
      ? candidates.filter((candidate) => getName(candidate) === expectedName)
      : candidates.filter((candidate) => getId(candidate) === expectedId);
  const ordered = [...matching].sort(
    (left, right) =>
      getId(left).localeCompare(getId(right)) ||
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  if (ordered.length === 0) return { status: "missing", candidates: [] };
  if (ordered.length !== 1) return { status: "ambiguous", candidates: ordered };
  const selected = ordered[0];
  if (selected === undefined) return { status: "missing", candidates: [] };
  return { status: "found", candidates: ordered, selected };
}

function compareIngress(
  left: CloudflareIngressObservation,
  right: CloudflareIngressObservation,
): number {
  return (
    (left.hostname ?? "").localeCompare(right.hostname ?? "") ||
    (left.path ?? "").localeCompare(right.path ?? "") ||
    left.service.localeCompare(right.service) ||
    (left.access?.required === true ? 1 : 0) - (right.access?.required === true ? 1 : 0) ||
    (left.access?.teamName ?? "").localeCompare(right.access?.teamName ?? "") ||
    accessAudienceKey(left).localeCompare(accessAudienceKey(right)) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function sortPolicies(
  policies: readonly CloudflarePolicyObservation[],
): readonly CloudflarePolicyObservation[] {
  return [...policies].sort((left, right) => {
    const leftPrecedence = left.precedence ?? Number.MAX_SAFE_INTEGER;
    const rightPrecedence = right.precedence ?? Number.MAX_SAFE_INTEGER;
    return (
      leftPrecedence - rightPrecedence ||
      left.id.localeCompare(right.id) ||
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
  });
}

function compareByStableId<T extends { readonly id: string }>(left: T, right: T): number {
  return (
    left.id.localeCompare(right.id) || JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function accessAudienceKey(value: CloudflareIngressObservation): string {
  return value.access?.audienceTags.join("\u0000") ?? "";
}

function contextRecord<T>(factory: () => T): Record<CloudflareContext, T>;
function contextRecord<T>(factory: (context: CloudflareContext) => T): Record<CloudflareContext, T>;
function contextRecord<T>(
  factory: (context: CloudflareContext) => T,
): Record<CloudflareContext, T> {
  const [human, admin, machine] = CLOUDFLARE_CONTEXTS.map((context) => factory(context)) as [
    T,
    T,
    T,
  ];
  return { human, admin, machine };
}

async function contextRecordAsync<T>(
  factory: (context: CloudflareContext) => Promise<T>,
): Promise<Record<CloudflareContext, T>> {
  const values = (await Promise.all(CLOUDFLARE_CONTEXTS.map((context) => factory(context)))) as [
    T,
    T,
    T,
  ];
  const [human, admin, machine] = values;
  return { human, admin, machine };
}

function blockedSelection<T>(): CloudflareSelection<T> {
  return { status: "blocked", candidates: [] };
}

function requiredRecord(value: unknown, resource: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(resource, "resource is not an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw invalidResponse(field, "string field is invalid");
  }
  return value;
}

function nullableString(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, field, maximum);
}

function nullableBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw invalidResponse(field, "boolean field is invalid");
  return value;
}

function nullableInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(field, "integer field is invalid");
  }
  return value;
}

function normalizeHostname(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}

function normalizeAccessDomain(value: string): string {
  try {
    if (value.includes("://")) {
      const url = new URL(value);
      return `${url.hostname.toLowerCase()}${url.pathname === "/" ? "" : url.pathname}`;
    }
  } catch {
    return value.toLowerCase();
  }
  return normalizeHostname(value);
}

function normalizeTeamName(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.endsWith(CLOUDFLARE_TEAM_SUFFIX)
    ? normalized.slice(0, -CLOUDFLARE_TEAM_SUFFIX.length)
    : normalized;
}

function normalizeNullableTeamName(value: unknown): string | null {
  const teamName = nullableString(value, "tunnel ingress access.teamName", 128);
  return teamName === null ? null : normalizeTeamName(teamName);
}

function invalidResponse(resource: string, reason: string): BridgeError {
  return new BridgeError(
    ERROR_CODES.CLOUDFLARE_API_RESPONSE_INVALID,
    `Cloudflare ${resource} response is invalid: ${reason}`,
    { resource },
  );
}
