import { readFile } from "node:fs/promises";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import {
  CLOUDFLARE_CONTEXTS,
  CLOUDFLARE_BRIDGE_ORIGIN,
  CLOUDFLARE_PLAN_SCHEMA_VERSION,
  type CloudflareContext,
  type CloudflareDesiredAccess,
  type CloudflareDesiredApplication,
  type CloudflareDesiredPolicy,
  type CloudflareDesiredState,
} from "./types.js";

const CLOUDFLARE_TEAM_SUFFIX = ".cloudflareaccess.com";
export const CLOUDFLARE_MAX_DESIRED_STATE_BYTES = 64 * 1024;

export function parseCloudflareDesiredState(input: unknown): CloudflareDesiredState {
  if (!isRecord(input)) invalid("desired state must be a JSON object");
  rejectUnknownKeys(
    input,
    new Set(["schemaVersion", "account", "zone", "tunnel", "access"]),
    "desired",
  );

  const schemaVersion = input.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== CLOUDFLARE_PLAN_SCHEMA_VERSION) {
    invalid(`desired.schemaVersion must be ${CLOUDFLARE_PLAN_SCHEMA_VERSION}`);
  }

  const account = parseAccount(input.account);
  const zone = parseZone(input.zone);
  const tunnel = parseTunnel(input.tunnel);
  const access = parseAccess(input.access);

  const applications = Object.values(access.applications);
  const audiences = applications.map((application) => application.audience);
  const hostnames = applications.map((application) => application.hostname);
  const identifiers = applications
    .map((application) => application.id)
    .filter((id): id is string => id !== undefined);
  if (new Set(audiences).size !== audiences.length) {
    invalid("access applications must have distinct audiences");
  }
  if (new Set(hostnames).size !== hostnames.length) {
    invalid("access applications must have distinct hostnames");
  }
  if (new Set(identifiers).size !== identifiers.length) {
    invalid("access applications must have distinct ids");
  }
  for (const application of applications) {
    if (application.hostname !== zone.name && !application.hostname.endsWith(`.${zone.name}`)) {
      invalid(`access application hostname is outside the desired zone: ${application.hostname}`);
    }
  }

  return {
    schemaVersion: CLOUDFLARE_PLAN_SCHEMA_VERSION,
    account,
    zone,
    tunnel,
    access,
  };
}

export async function loadCloudflareDesiredState(
  filePath: string,
): Promise<CloudflareDesiredState> {
  if (filePath.trim().length === 0) {
    invalid("desired state path must not be empty");
  }

  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_DESIRED_STATE_INVALID,
      "Unable to read the repo-external Cloudflare desired-state file",
      undefined,
      { cause: error },
    );
  }
  if (new TextEncoder().encode(contents).byteLength > CLOUDFLARE_MAX_DESIRED_STATE_BYTES) {
    invalid("The Cloudflare desired-state file exceeds the bounded 64 KiB limit");
  }

  try {
    return parseCloudflareDesiredState(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARE_DESIRED_STATE_INVALID,
      "The Cloudflare desired-state file is not valid JSON",
      undefined,
      { cause: error },
    );
  }
}

function parseAccount(value: unknown): CloudflareDesiredState["account"] {
  const record = requiredRecord(value, "desired.account");
  rejectUnknownKeys(record, new Set(["id", "name"]), "desired.account");
  const name = requiredBoundedString(record, "name", "desired.account", 1, 100);
  const id = optionalIdentifier(record.id, "desired.account.id");
  if (id === undefined && name.length === 0) invalid("desired.account needs an id or name");
  return id === undefined ? { name } : { id, name };
}

function parseZone(value: unknown): CloudflareDesiredState["zone"] {
  const record = requiredRecord(value, "desired.zone");
  rejectUnknownKeys(record, new Set(["id", "name"]), "desired.zone");
  const name = validateHostname(
    requiredBoundedString(record, "name", "desired.zone", 1, 253),
    "desired.zone.name",
  );
  const id = optionalIdentifier(record.id, "desired.zone.id");
  return id === undefined ? { name } : { id, name };
}

function parseTunnel(value: unknown): CloudflareDesiredState["tunnel"] {
  const record = requiredRecord(value, "desired.tunnel");
  rejectUnknownKeys(record, new Set(["id", "name", "origin", "dnsTarget"]), "desired.tunnel");
  const name = requiredBoundedString(record, "name", "desired.tunnel", 1, 128);
  const origin = record.origin;
  if (origin !== undefined && origin !== CLOUDFLARE_BRIDGE_ORIGIN) {
    invalid(`desired.tunnel.origin must be exactly ${CLOUDFLARE_BRIDGE_ORIGIN}`);
  }
  const id = optionalIdentifier(record.id, "desired.tunnel.id");
  const dnsTargetValue = record.dnsTarget;
  let dnsTarget: string | undefined;
  if (dnsTargetValue !== undefined) {
    dnsTarget = validateHostname(
      requiredStringValue(dnsTargetValue, "desired.tunnel.dnsTarget"),
      "desired.tunnel.dnsTarget",
    );
  }
  return {
    ...(id === undefined ? {} : { id }),
    name,
    origin: CLOUDFLARE_BRIDGE_ORIGIN,
    ...(dnsTarget === undefined ? {} : { dnsTarget }),
  };
}

function parseAccess(value: unknown): CloudflareDesiredAccess {
  const record = requiredRecord(value, "desired.access");
  rejectUnknownKeys(
    record,
    new Set(["teamDomain", "teamName", "applications", "policies"]),
    "desired.access",
  );
  const teamDomain = validateTeamDomain(
    requiredBoundedString(record, "teamDomain", "desired.access", 1, 253),
  );
  const configuredTeamName = record.teamName;
  const teamName =
    configuredTeamName === undefined
      ? teamDomain.slice(0, -CLOUDFLARE_TEAM_SUFFIX.length)
      : requiredStringValue(configuredTeamName, "desired.access.teamName", 1, 100);
  if (teamName.includes(".") && teamName !== teamDomain) {
    invalid("desired.access.teamName must be a team label or the exact team domain");
  }

  const applicationRecord = requiredRecord(record.applications, "desired.access.applications");
  const policyRecord = requiredRecord(record.policies, "desired.access.policies");
  rejectContextKeys(applicationRecord, "desired.access.applications");
  rejectContextKeys(policyRecord, "desired.access.policies");

  const applications = {
    human: parseApplication(applicationRecord.human, "human"),
    admin: parseApplication(applicationRecord.admin, "admin"),
    machine: parseApplication(applicationRecord.machine, "machine"),
  } satisfies Readonly<Record<CloudflareContext, CloudflareDesiredApplication>>;
  const policies = {
    human: parsePolicy(policyRecord.human, "human"),
    admin: parsePolicy(policyRecord.admin, "admin"),
    machine: parsePolicy(policyRecord.machine, "machine"),
  } satisfies Readonly<Record<CloudflareContext, CloudflareDesiredPolicy>>;
  return { teamDomain, teamName: normalizeTeamName(teamName), applications, policies };
}

function parseApplication(
  value: unknown,
  context: CloudflareContext,
): CloudflareDesiredApplication {
  const scope = `desired.access.applications.${context}`;
  const record = requiredRecord(value, scope);
  rejectUnknownKeys(record, new Set(["id", "name", "hostname", "audience", "type"]), scope);
  const id = optionalIdentifier(record.id, `${scope}.id`);
  const name = requiredBoundedString(record, "name", scope, 1, 200);
  const hostname = validateHostname(
    requiredBoundedString(record, "hostname", scope, 1, 253),
    `${scope}.hostname`,
  );
  const audience = requiredBoundedString(record, "audience", scope, 1, 256);
  if (audience.trim() !== audience || hasControlCharacter(audience)) {
    invalid(`${scope}.audience must be a bounded opaque value`);
  }
  const type = record.type;
  if (type !== undefined && type !== "self_hosted") {
    invalid(`${scope}.type must be self_hosted`);
  }
  return {
    ...(id === undefined ? {} : { id }),
    name,
    hostname,
    audience,
    type: "self_hosted",
  };
}

function parsePolicy(value: unknown, context: CloudflareContext): CloudflareDesiredPolicy {
  const scope = `desired.access.policies.${context}`;
  const record = value === undefined ? {} : requiredRecord(value, scope);
  rejectUnknownKeys(
    record,
    new Set([
      "minimumCount",
      "requiredDecision",
      "decision",
      "requireMfa",
      "exactNonIdentitySelectorCount",
    ]),
    scope,
  );
  const defaultDecision = context === "machine" ? "non_identity" : "allow";
  if (
    record.requiredDecision !== undefined &&
    record.decision !== undefined &&
    record.requiredDecision !== record.decision
  ) {
    invalid(`${scope}.requiredDecision and ${scope}.decision disagree`);
  }
  const configuredDecision = record.requiredDecision ?? record.decision;
  const requiredDecision = configuredDecision === undefined ? defaultDecision : configuredDecision;
  if (requiredDecision !== "allow" && requiredDecision !== "non_identity") {
    invalid(`${scope}.requiredDecision must be allow or non_identity`);
  }
  if (context === "machine" && requiredDecision !== "non_identity") {
    invalid("machine Access policy must use Service Auth (non_identity)");
  }
  if (context !== "machine" && requiredDecision !== "allow") {
    invalid(`${context} Access policy must use allow`);
  }
  const minimumCount = readBoundedInteger(record.minimumCount, 1, 32, `${scope}.minimumCount`, 1);
  const requireMfa =
    record.requireMfa === undefined
      ? context === "admin"
      : readBoolean(record.requireMfa, `${scope}.requireMfa`);
  const exactNonIdentitySelectorCount = readBoundedInteger(
    record.exactNonIdentitySelectorCount,
    context === "machine" ? 1 : 0,
    32,
    `${scope}.exactNonIdentitySelectorCount`,
    context === "machine" ? 1 : 0,
  );
  return { minimumCount, requiredDecision, requireMfa, exactNonIdentitySelectorCount };
}

function rejectContextKeys(record: Record<string, unknown>, scope: string): void {
  rejectUnknownKeys(record, new Set(CLOUDFLARE_CONTEXTS), scope);
  for (const context of CLOUDFLARE_CONTEXTS) {
    if (!(context in record)) invalid(`${scope}.${context} is required`);
  }
}

function requiredRecord(value: unknown, scope: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${scope} must be an object`);
  return value;
}

function requiredBoundedString(
  record: Record<string, unknown>,
  key: string,
  scope: string,
  minimum: number,
  maximum: number,
): string {
  return requiredStringValue(record[key], `${scope}.${key}`, minimum, maximum);
}

function requiredStringValue(value: unknown, scope: string, minimum = 1, maximum = 256): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    invalid(`${scope} must be a bounded string`);
  }
  return value;
}

function optionalIdentifier(value: unknown, scope: string): string | undefined {
  if (value === undefined) return undefined;
  const identifier = requiredStringValue(value, scope, 1, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(identifier)) invalid(`${scope} contains unsupported characters`);
  return identifier;
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  maximum: number,
  scope: string,
  minimum: number,
): number {
  if (value === undefined) return defaultValue;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${scope} must be an integer in range`);
  }
  return value;
}

function readBoolean(value: unknown, scope: string): boolean {
  if (typeof value !== "boolean") invalid(`${scope} must be a boolean`);
  return value;
}

function validateTeamDomain(value: string): string {
  const normalized = validateHostname(value, "desired.access.teamDomain");
  if (!normalized.endsWith(CLOUDFLARE_TEAM_SUFFIX)) {
    invalid("desired.access.teamDomain must be a Cloudflare Access team domain");
  }
  return normalized;
}

function validateHostname(value: string, scope: string): string {
  const normalized = value.toLowerCase();
  if (
    normalized !== value ||
    normalized.length > 253 ||
    normalized.endsWith(".") ||
    normalized.includes("/") ||
    normalized.includes("*")
  ) {
    invalid(`${scope} must be an exact DNS hostname`);
  }
  const labels = normalized.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    invalid(`${scope} must be an exact DNS hostname`);
  }
  return normalized;
}

function normalizeTeamName(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.endsWith(CLOUDFLARE_TEAM_SUFFIX)
    ? normalized.slice(0, -CLOUDFLARE_TEAM_SUFFIX.length)
    : normalized;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  scope: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid(`Unknown desired-state key: ${scope}.${key}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new BridgeError(ERROR_CODES.CLOUDFLARE_DESIRED_STATE_INVALID, message);
}
