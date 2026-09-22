import type { BridgeErrorCode } from "../shared/errors.js";

export const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4" as const;
export const CLOUDFLARE_BRIDGE_ORIGIN = "http://127.0.0.1:17282" as const;
export const CLOUDFLARE_PLAN_SCHEMA_VERSION = "phase6a.v1" as const;

export const CLOUDFLARE_CONTEXTS = ["human", "admin", "machine"] as const;
export type CloudflareContext = (typeof CLOUDFLARE_CONTEXTS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface CloudflareDesiredAccount {
  readonly id?: string;
  readonly name: string;
}

export interface CloudflareDesiredZone {
  readonly id?: string;
  readonly name: string;
}

export interface CloudflareDesiredTunnel {
  readonly id?: string;
  readonly name: string;
  readonly origin: typeof CLOUDFLARE_BRIDGE_ORIGIN;
  readonly dnsTarget?: string;
}

export interface CloudflareDesiredApplication {
  readonly id?: string;
  readonly name: string;
  readonly hostname: string;
  readonly audience: string;
  readonly type: "self_hosted";
}

export interface CloudflareDesiredPolicy {
  readonly minimumCount: number;
  readonly requiredDecision: "allow" | "non_identity";
  readonly requireMfa: boolean;
  readonly exactNonIdentitySelectorCount: number;
}

export interface CloudflareDesiredAccess {
  readonly teamDomain: string;
  readonly teamName: string;
  readonly applications: Readonly<Record<CloudflareContext, CloudflareDesiredApplication>>;
  readonly policies: Readonly<Record<CloudflareContext, CloudflareDesiredPolicy>>;
}

export interface CloudflareDesiredState {
  readonly schemaVersion: typeof CLOUDFLARE_PLAN_SCHEMA_VERSION;
  readonly account: CloudflareDesiredAccount;
  readonly zone: CloudflareDesiredZone;
  readonly tunnel: CloudflareDesiredTunnel;
  readonly access: CloudflareDesiredAccess;
}

export interface CloudflareAccountObservation {
  readonly id: string;
  readonly name: string;
}

export interface CloudflareZoneObservation {
  readonly id: string;
  readonly name: string;
  readonly accountId: string | null;
}

export interface CloudflareTunnelObservation {
  readonly id: string;
  readonly name: string;
  readonly configSrc: string | null;
  readonly remoteConfig: boolean | null;
  readonly status: string | null;
}

export interface CloudflareTunnelAccessObservation {
  readonly required: boolean | null;
  readonly teamName: string | null;
  readonly audienceTags: readonly string[];
}

export interface CloudflareIngressObservation {
  readonly hostname: string | null;
  readonly path: string | null;
  readonly service: string;
  readonly access: CloudflareTunnelAccessObservation | null;
}

export interface CloudflareTunnelConfigurationObservation {
  readonly accountId: string | null;
  readonly version: number | null;
  readonly ingress: readonly CloudflareIngressObservation[];
}

export interface CloudflareDnsObservation {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly content: string;
  readonly proxied: boolean | null;
}

export interface CloudflareApplicationObservation {
  readonly id: string;
  readonly name: string | null;
  readonly domain: string | null;
  readonly audience: string | null;
  readonly type: string | null;
  readonly mfaDisabled: boolean | null;
}

export interface CloudflarePolicyObservation {
  readonly id: string;
  readonly name: string | null;
  readonly decision: string | null;
  readonly precedence: number | null;
  readonly includeKinds: readonly string[];
  readonly requireKinds: readonly string[];
  readonly excludeKinds: readonly string[];
  readonly broadSelector: boolean;
  readonly nonIdentitySelectorCount: number;
  readonly mfaDisabled: boolean | null;
  readonly sessionDuration: string | null;
}

export type CloudflareSelectionStatus = "found" | "missing" | "ambiguous" | "blocked";

export interface CloudflareSelection<T> {
  readonly status: CloudflareSelectionStatus;
  readonly candidates: readonly T[];
  readonly selected?: T;
}

export interface CloudflarePolicyCollectionObservation {
  readonly status: "found" | "blocked";
  readonly policies: readonly CloudflarePolicyObservation[];
}

export interface CloudflareObservedState {
  readonly account: CloudflareSelection<CloudflareAccountObservation>;
  readonly zone: CloudflareSelection<CloudflareZoneObservation>;
  readonly tunnel: CloudflareSelection<CloudflareTunnelObservation>;
  readonly tunnelConfiguration: CloudflareSelection<CloudflareTunnelConfigurationObservation>;
  readonly dns: Readonly<Record<CloudflareContext, CloudflareSelection<CloudflareDnsObservation>>>;
  readonly applications: Readonly<
    Record<CloudflareContext, CloudflareSelection<CloudflareApplicationObservation>>
  >;
  readonly unexpectedApplications: readonly CloudflareApplicationObservation[];
  readonly policies: Readonly<Record<CloudflareContext, CloudflarePolicyCollectionObservation>>;
}

export type CloudflareDriftClassification =
  | "in_sync"
  | "missing"
  | "unexpected"
  | "mismatch"
  | "ambiguous"
  | "unsafe_conflict"
  | "manual_required"
  | "blocked";

export type CloudflareDriftAction = "none" | "create" | "adopt" | "update" | "remove";
export type CloudflareDriftSeverity = "info" | "warning" | "conflict";

export interface CloudflareDriftCheck {
  readonly id: string;
  readonly classification: CloudflareDriftClassification;
  readonly action: CloudflareDriftAction;
  readonly severity: CloudflareDriftSeverity;
  readonly reason: string;
  readonly expected?: JsonValue;
  readonly observed?: JsonValue;
}

export interface CloudflarePlanSummary {
  readonly totalChecks: number;
  readonly passed: number;
  readonly drifted: number;
  readonly conflicts: number;
  readonly unsafeConflicts: number;
  readonly manualRequired: number;
}

export interface CloudflareReadOnlyPlan {
  readonly schemaVersion: typeof CLOUDFLARE_PLAN_SCHEMA_VERSION;
  readonly phase: "6-A";
  readonly readOnly: true;
  readonly mutationMethods: readonly [];
  readonly desired: CloudflareDesiredState;
  readonly observed: CloudflareObservedState;
  readonly checks: readonly CloudflareDriftCheck[];
  readonly summary: CloudflarePlanSummary;
  readonly fingerprint: string;
}

export interface CloudflareGetResponse {
  readonly status: number;
  readonly payload: unknown;
}

export interface CloudflareGetTransport {
  get(path: string, query?: Readonly<Record<string, string>>): Promise<CloudflareGetResponse>;
}

export interface CloudflareDiscoveryClient {
  listAccounts(): Promise<readonly unknown[]>;
  getAccount(accountId: string): Promise<unknown>;
  listZones(accountId: string): Promise<readonly unknown[]>;
  listTunnels(accountId: string): Promise<readonly unknown[]>;
  getTunnel(accountId: string, tunnelId: string): Promise<unknown>;
  getTunnelConfiguration(accountId: string, tunnelId: string): Promise<unknown>;
  listDnsRecords(zoneId: string, hostname: string): Promise<readonly unknown[]>;
  listAccessApplications(accountId: string): Promise<readonly unknown[]>;
  listAccessPolicies(accountId: string, applicationId: string): Promise<readonly unknown[]>;
}

export interface CloudflareApiClientOptions {
  readonly transport: CloudflareGetTransport;
  readonly maxPages?: number;
  readonly maxItems?: number;
}

export interface CloudflareApiTokenEnvironment {
  readonly CLOUDFLARE_API_TOKEN?: string;
}

export interface CloudflarePlanErrorDetails {
  readonly code: BridgeErrorCode;
  readonly resource?: string;
}
