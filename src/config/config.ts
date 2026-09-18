import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, win32 } from "node:path";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";
import type { LogLevel } from "../shared/logger.js";
import { parseVersion, parseVersionRange } from "../shared/semver.js";

export const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/zhuyifang/fqgate-releases/main/releases/stable.json";
export const DEFAULT_FQGATE_BASE_URL = "http://127.0.0.1:17281";
export const DEFAULT_CLOUDFLARED_VERSION = "2026.9.0";
export const DEFAULT_CLOUDFLARED_SERVICE_NAME = "FQGateRemoteBridgeCloudflared";
export const CLOUDFLARED_ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion" as const;

export interface CompatibilityConfig {
  readonly supportedRange: string;
  readonly validatedVersions: readonly string[];
  readonly pinnedVersion?: string;
}

export interface DownloadConfig {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

export interface ActivationConfig {
  readonly healthTimeoutMs: number;
  readonly healthPollIntervalMs: number;
  readonly processTimeoutMs: number;
}

export interface RemoteAccessConfig {
  readonly remoteHostname?: string;
  readonly adminHostname?: string;
  readonly adminAccess?: {
    readonly teamDomain: string;
    readonly audience: string;
  };
  readonly accessAssertionHeader: typeof CLOUDFLARED_ACCESS_ASSERTION_HEADER;
}

export interface CloudflaredConfig {
  readonly releaseVersion: string;
  readonly installDirectory: string;
  readonly tokenFile: string;
  readonly serviceName: string;
  readonly origin: "http://127.0.0.1:17282";
}

export interface AppConfig {
  readonly manifestUrl: string;
  readonly installDirectory: string;
  readonly fqgateBaseUrl: string;
  readonly compatibility: CompatibilityConfig;
  readonly download: DownloadConfig;
  readonly activation: ActivationConfig;
  readonly remoteAccess: RemoteAccessConfig;
  readonly cloudflared: CloudflaredConfig;
  readonly logLevel: LogLevel;
}

const DEFAULT_COMPATIBILITY: CompatibilityConfig = {
  supportedRange: ">=1.0.0 <2.0.0",
  validatedVersions: ["1.0.0"],
};

const DEFAULT_DOWNLOAD: DownloadConfig = {
  timeoutMs: 30_000,
  maxRetries: 2,
  retryDelayMs: 500,
};

const DEFAULT_ACTIVATION: ActivationConfig = {
  // FQGate may perform first-run desktop/network initialization before it
  // opens the loopback health endpoint. Keep the deadline bounded, but long
  // enough for a real Windows activation after an approved acknowledgement.
  healthTimeoutMs: 120_000,
  healthPollIntervalMs: 500,
  processTimeoutMs: 10_000,
};

const CLOUDFLARED_ORIGIN = "http://127.0.0.1:17282" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  scope: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        `Unknown configuration key: ${scope}.${key}`,
      );
    }
  }
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  scope: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      `Configuration value must be a non-empty string: ${scope}.${key}`,
    );
  }
  return value;
}

function readOptionalInteger(
  record: Record<string, unknown>,
  key: string,
  scope: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      `Configuration value must be an integer in range for ${scope}.${key}`,
    );
  }
  return value;
}

function validateManifestUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "manifestUrl must be a valid HTTPS URL",
      undefined,
      { cause: error },
    );
  }

  const validPath = url.pathname === "/zhuyifang/fqgate-releases/main/releases/stable.json";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "raw.githubusercontent.com" ||
    !validPath ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "manifestUrl must point to the official raw FQGate stable manifest over HTTPS",
    );
  }
  return url.toString();
}

function validateRemoteHostname(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== value ||
    normalized.length > 253 ||
    normalized === "localhost" ||
    isIP(normalized) !== 0 ||
    normalized.endsWith(".")
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.remoteHostname must be a DNS hostname, not an IP, URL, or localhost value",
    );
  }
  const labels = normalized.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.remoteHostname must be a valid DNS hostname",
    );
  }
  return normalized;
}

function validateCloudflareTeamDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== value ||
    normalized.length <= ".cloudflareaccess.com".length ||
    normalized.length > 253 ||
    !normalized.endsWith(".cloudflareaccess.com")
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminAccess.teamDomain must be a Cloudflare Access team hostname",
    );
  }
  const labels = normalized.split(".");
  if (
    labels.length < 3 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminAccess.teamDomain must be a Cloudflare Access team hostname",
    );
  }
  return normalized;
}

function validateAdminAudience(value: string): string {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 256 ||
    hasInvalidAudienceCharacter(value)
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminAccess.audience must be a bounded opaque audience value",
    );
  }
  return value;
}

function validateCloudflaredVersion(value: string): string {
  if (!/^\d{4}\.\d+\.\d+$/.test(value)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "cloudflared.releaseVersion must use the official YYYY.M.patch release format",
    );
  }
  return value;
}

function hasInvalidAudienceCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f || /\s/u.test(character);
  });
}

function normalizeConfiguredPath(value: string, platform: NodeJS.Platform, scope: string): string {
  const normalized =
    platform === "win32"
      ? win32.isAbsolute(value)
        ? win32.normalize(value)
        : win32.resolve(value)
      : isAbsolute(value)
        ? resolve(value)
        : resolve(value);
  if (normalized.length === 0) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, `${scope} must be a valid path`);
  }
  return normalized;
}

function assertOutsideRepository(value: string, platform: NodeJS.Platform, scope: string): void {
  const repositoryRoot =
    platform === "win32" ? win32.resolve(process.cwd()) : resolve(process.cwd());
  const relativePath =
    platform === "win32" ? win32.relative(repositoryRoot, value) : relative(repositoryRoot, value);
  const isOutside =
    platform === "win32"
      ? win32.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("..\\")
      : relativePath === ".." || relativePath.startsWith("../");
  if (relativePath === "" || !isOutside) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      `${scope} must be outside the repository and must not be checked in`,
    );
  }
}

function defaultCloudflaredInstallDirectory(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") {
    return win32.join(
      environment.ProgramFiles ?? "C:\\Program Files",
      "FQGateRemoteBridge",
      "cloudflared",
    );
  }
  return join(
    environment.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "fqgate-remote-bridge",
    "cloudflared",
  );
}

function defaultCloudflaredTokenFile(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") {
    return win32.join(
      environment.ProgramData ?? "C:\\ProgramData",
      "FQGateRemoteBridge",
      "secrets",
      "tunnel-token",
    );
  }
  return join(
    environment.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "fqgate-remote-bridge",
    "secrets",
    "tunnel-token",
  );
}

export function validateLoopbackBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "fqgateBaseUrl must be a valid loopback URL",
      undefined,
      { cause: error },
    );
  }

  const loopbackHosts = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "fqgateBaseUrl must remain an http(s) loopback URL without credentials or a remote host",
    );
  }
  return url.origin;
}

export function defaultInstallDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA ?? win32.join(homedir(), "AppData", "Local");
    return win32.join(localAppData, "FQGateRemoteBridge");
  }

  const dataHome = environment.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(dataHome, "fqgate-remote-bridge");
}

export function parseConfig(
  input: unknown = {},
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): AppConfig {
  if (!isRecord(input)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "Configuration must be a JSON object");
  }

  rejectUnknownKeys(
    input,
    new Set([
      "manifestUrl",
      "installDirectory",
      "fqgateBaseUrl",
      "compatibility",
      "download",
      "activation",
      "remoteAccess",
      "cloudflared",
      "logLevel",
    ]),
    "config",
  );

  const manifestUrl = validateManifestUrl(
    readOptionalString(input, "manifestUrl", "config") ?? DEFAULT_MANIFEST_URL,
  );
  const configuredDirectory = readOptionalString(input, "installDirectory", "config");
  const installDirectory =
    configuredDirectory === undefined
      ? defaultInstallDirectory(environment, platform)
      : platform === "win32"
        ? win32.isAbsolute(configuredDirectory)
          ? configuredDirectory
          : win32.resolve(configuredDirectory)
        : isAbsolute(configuredDirectory)
          ? configuredDirectory
          : resolve(configuredDirectory);
  const fqgateBaseUrl = validateLoopbackBaseUrl(
    readOptionalString(input, "fqgateBaseUrl", "config") ?? DEFAULT_FQGATE_BASE_URL,
  );

  const compatibilityInput = input.compatibility;
  if (compatibilityInput !== undefined && !isRecord(compatibilityInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "compatibility must be a JSON object");
  }
  const compatibilityRecord = compatibilityInput ?? {};
  rejectUnknownKeys(
    compatibilityRecord,
    new Set(["supportedRange", "validatedVersions", "pinnedVersion"]),
    "compatibility",
  );
  const supportedRange =
    readOptionalString(compatibilityRecord, "supportedRange", "compatibility") ??
    DEFAULT_COMPATIBILITY.supportedRange;
  const validatedInput = compatibilityRecord.validatedVersions;
  const validatedVersions =
    validatedInput === undefined ? [...DEFAULT_COMPATIBILITY.validatedVersions] : validatedInput;
  if (
    !Array.isArray(validatedVersions) ||
    validatedVersions.length === 0 ||
    validatedVersions.some((version) => typeof version !== "string" || version.trim().length === 0)
  ) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "compatibility.validatedVersions must be a non-empty string array",
    );
  }
  const pinnedVersion = readOptionalString(compatibilityRecord, "pinnedVersion", "compatibility");
  if (parseVersionRange(supportedRange) === undefined) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "compatibility.supportedRange is not a supported semantic version range",
    );
  }
  if (validatedVersions.some((version) => parseVersion(version) === undefined)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "compatibility.validatedVersions contains an invalid semantic version",
    );
  }
  if (pinnedVersion !== undefined && parseVersion(pinnedVersion) === undefined) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "compatibility.pinnedVersion is not a valid semantic version",
    );
  }

  const downloadInput = input.download;
  if (downloadInput !== undefined && !isRecord(downloadInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "download must be a JSON object");
  }
  const downloadRecord = downloadInput ?? {};
  rejectUnknownKeys(
    downloadRecord,
    new Set(["timeoutMs", "maxRetries", "retryDelayMs"]),
    "download",
  );
  const download: DownloadConfig = {
    timeoutMs:
      readOptionalInteger(downloadRecord, "timeoutMs", "download", 1_000, 10 * 60_000) ??
      DEFAULT_DOWNLOAD.timeoutMs,
    maxRetries:
      readOptionalInteger(downloadRecord, "maxRetries", "download", 0, 5) ??
      DEFAULT_DOWNLOAD.maxRetries,
    retryDelayMs:
      readOptionalInteger(downloadRecord, "retryDelayMs", "download", 0, 60_000) ??
      DEFAULT_DOWNLOAD.retryDelayMs,
  };

  const activationInput = input.activation;
  if (activationInput !== undefined && !isRecord(activationInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "activation must be a JSON object");
  }
  const activationRecord = activationInput ?? {};
  rejectUnknownKeys(
    activationRecord,
    new Set(["healthTimeoutMs", "healthPollIntervalMs", "processTimeoutMs"]),
    "activation",
  );
  const activation: ActivationConfig = {
    healthTimeoutMs:
      readOptionalInteger(activationRecord, "healthTimeoutMs", "activation", 1_000, 10 * 60_000) ??
      DEFAULT_ACTIVATION.healthTimeoutMs,
    healthPollIntervalMs:
      readOptionalInteger(activationRecord, "healthPollIntervalMs", "activation", 50, 60_000) ??
      DEFAULT_ACTIVATION.healthPollIntervalMs,
    processTimeoutMs:
      readOptionalInteger(activationRecord, "processTimeoutMs", "activation", 100, 10 * 60_000) ??
      DEFAULT_ACTIVATION.processTimeoutMs,
  };

  const remoteAccessInput = input.remoteAccess;
  if (remoteAccessInput !== undefined && !isRecord(remoteAccessInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "remoteAccess must be a JSON object");
  }
  const remoteAccessRecord = remoteAccessInput ?? {};
  rejectUnknownKeys(
    remoteAccessRecord,
    new Set(["remoteHostname", "adminHostname", "adminAccess"]),
    "remoteAccess",
  );
  const remoteHostnameInput = readOptionalString(
    remoteAccessRecord,
    "remoteHostname",
    "remoteAccess",
  );
  const adminHostnameInput = readOptionalString(
    remoteAccessRecord,
    "adminHostname",
    "remoteAccess",
  );
  const remoteHostname =
    remoteHostnameInput === undefined ? undefined : validateRemoteHostname(remoteHostnameInput);
  const adminHostname =
    adminHostnameInput === undefined ? undefined : validateRemoteHostname(adminHostnameInput);
  if (remoteHostname !== undefined && remoteHostname === adminHostname) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.remoteHostname and remoteAccess.adminHostname must be distinct",
    );
  }

  const adminAccessInput = remoteAccessRecord.adminAccess;
  if (adminAccessInput !== undefined && !isRecord(adminAccessInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "remoteAccess.adminAccess must be an object");
  }
  if ((adminHostname === undefined) !== (adminAccessInput === undefined)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "remoteAccess.adminHostname and remoteAccess.adminAccess must be configured together",
    );
  }
  let adminAccess: RemoteAccessConfig["adminAccess"];
  if (adminAccessInput !== undefined) {
    rejectUnknownKeys(adminAccessInput, new Set(["teamDomain", "audience"]), "adminAccess");
    const teamDomain = readOptionalString(adminAccessInput, "teamDomain", "adminAccess");
    const audience = readOptionalString(adminAccessInput, "audience", "adminAccess");
    if (teamDomain === undefined || audience === undefined) {
      throw new BridgeError(
        ERROR_CODES.CONFIG_INVALID,
        "remoteAccess.adminAccess requires teamDomain and audience",
      );
    }
    adminAccess = {
      teamDomain: validateCloudflareTeamDomain(teamDomain),
      audience: validateAdminAudience(audience),
    };
  }
  const remoteAccess: RemoteAccessConfig = {
    accessAssertionHeader: CLOUDFLARED_ACCESS_ASSERTION_HEADER,
    ...(remoteHostname === undefined ? {} : { remoteHostname }),
    ...(adminHostname === undefined ? {} : { adminHostname }),
    ...(adminAccess === undefined ? {} : { adminAccess }),
  };

  const cloudflaredInput = input.cloudflared;
  if (cloudflaredInput !== undefined && !isRecord(cloudflaredInput)) {
    throw new BridgeError(ERROR_CODES.CONFIG_INVALID, "cloudflared must be a JSON object");
  }
  const cloudflaredRecord = cloudflaredInput ?? {};
  rejectUnknownKeys(
    cloudflaredRecord,
    new Set(["releaseVersion", "installDirectory", "tokenFile", "serviceName"]),
    "cloudflared",
  );
  const cloudflaredReleaseVersion = validateCloudflaredVersion(
    readOptionalString(cloudflaredRecord, "releaseVersion", "cloudflared") ??
      DEFAULT_CLOUDFLARED_VERSION,
  );
  const cloudflaredInstallDirectory = normalizeConfiguredPath(
    readOptionalString(cloudflaredRecord, "installDirectory", "cloudflared") ??
      defaultCloudflaredInstallDirectory(environment, platform),
    platform,
    "cloudflared.installDirectory",
  );
  const configuredTokenFile = readOptionalString(cloudflaredRecord, "tokenFile", "cloudflared");
  const cloudflaredTokenFile = normalizeConfiguredPath(
    configuredTokenFile ?? defaultCloudflaredTokenFile(environment, platform),
    platform,
    "cloudflared.tokenFile",
  );
  assertOutsideRepository(cloudflaredTokenFile, platform, "cloudflared.tokenFile");
  const cloudflaredServiceName =
    readOptionalString(cloudflaredRecord, "serviceName", "cloudflared") ??
    DEFAULT_CLOUDFLARED_SERVICE_NAME;
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(cloudflaredServiceName)) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "cloudflared.serviceName contains unsupported Windows service name characters",
    );
  }
  const cloudflared: CloudflaredConfig = {
    releaseVersion: cloudflaredReleaseVersion,
    installDirectory: cloudflaredInstallDirectory,
    tokenFile: cloudflaredTokenFile,
    serviceName: cloudflaredServiceName,
    origin: CLOUDFLARED_ORIGIN,
  };

  const logLevelInput = input.logLevel;
  const logLevel = logLevelInput === undefined ? "info" : logLevelInput;
  if (logLevel !== "debug" && logLevel !== "info" && logLevel !== "warn" && logLevel !== "error") {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "logLevel must be one of debug, info, warn, error",
    );
  }

  return {
    manifestUrl,
    installDirectory,
    fqgateBaseUrl,
    compatibility: {
      supportedRange,
      validatedVersions: [...validatedVersions],
      ...(pinnedVersion === undefined ? {} : { pinnedVersion }),
    },
    download,
    activation,
    remoteAccess,
    cloudflared,
    logLevel,
  };
}

export async function loadConfig(
  filePath: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<AppConfig> {
  if (filePath === undefined) {
    return parseConfig({}, environment, platform);
  }

  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      `Unable to read configuration file: ${filePath}`,
      undefined,
      { cause: error },
    );
  }

  try {
    return parseConfig(JSON.parse(contents) as unknown, environment, platform);
  } catch (error) {
    if (error instanceof BridgeError) {
      throw error;
    }
    throw new BridgeError(
      ERROR_CODES.CONFIG_INVALID,
      "Configuration file is not valid JSON",
      undefined,
      { cause: error },
    );
  }
}
