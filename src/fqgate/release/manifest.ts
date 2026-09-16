import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import { parseVersion } from "../../shared/semver.js";
import type { FqgatePackage, FqgateRelease } from "./types.js";

export const DEFAULT_ASSET_BASE_URL =
  "https://github.com/zhuyifang/fqgate-releases/releases/download";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      `${context}.${key} must be a non-empty string`,
    );
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      `${context}.${key} must be a non-empty string when present`,
    );
  }
  return value;
}

function buildAssetUrl(version: string, fileName: string, assetBaseUrl: string): string {
  let base: URL;
  try {
    base = new URL(assetBaseUrl);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "Official asset base URL is invalid",
      undefined,
      { cause: error },
    );
  }
  if (
    base.protocol !== "https:" ||
    base.hostname !== "github.com" ||
    base.pathname !== "/zhuyifang/fqgate-releases/releases/download"
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "Official asset base URL is not the FQGate release source",
    );
  }

  const url = new URL(
    base.toString().replace(/\/$/, "") + `/fqgate-v${version}/${encodeURIComponent(fileName)}`,
  );
  return url.toString();
}

function parsePackage(
  value: unknown,
  index: number,
  version: string,
  assetBaseUrl: string,
): FqgatePackage {
  if (!isRecord(value)) {
    throw new BridgeError(ERROR_CODES.MANIFEST_INVALID, `packages[${index}] must be an object`);
  }

  const platform = requiredString(value, "platform", `packages[${index}]`);
  const architecture = requiredString(value, "architecture", `packages[${index}]`);
  const installMode = requiredString(value, "installMode", `packages[${index}]`);
  const fileName = requiredString(value, "fileName", `packages[${index}]`);
  if (
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName === "." ||
    fileName === ".." ||
    !/^[A-Za-z0-9._-]+$/.test(fileName)
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      `packages[${index}].fileName must be a plain file name`,
    );
  }

  const size = value.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      `packages[${index}].size must be a positive safe integer`,
    );
  }

  const sha256 = requiredString(value, "sha256", `packages[${index}]`).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      `packages[${index}].sha256 must be a 64-character SHA-256 hex digest`,
    );
  }

  return {
    platform,
    architecture,
    installMode,
    fileName,
    size,
    sha256,
    assetUrl: buildAssetUrl(version, fileName, assetBaseUrl),
  };
}

export function parseStableManifest(
  value: unknown,
  assetBaseUrl = DEFAULT_ASSET_BASE_URL,
): FqgateRelease {
  if (!isRecord(value)) {
    throw new BridgeError(ERROR_CODES.MANIFEST_INVALID, "Stable manifest must be a JSON object");
  }

  if (
    value.schemaVersion !== 1 ||
    value.component !== "fqgate" ||
    value.channel !== "stable" ||
    value.status !== "published"
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "Stable manifest is not a published FQGate stable release",
    );
  }

  const version = requiredString(value, "version", "manifest");
  if (parseVersion(version) === undefined) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "manifest.version must be a valid semantic version",
    );
  }
  const publishedAt = requiredString(value, "publishedAt", "manifest");
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "manifest.publishedAt must be an ISO-compatible date",
    );
  }

  const minimumSupportedVersion = optionalString(value, "minimumSupportedVersion", "manifest");
  if (
    minimumSupportedVersion !== undefined &&
    parseVersion(minimumSupportedVersion) === undefined
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "manifest.minimumSupportedVersion must be a valid semantic version",
    );
  }

  const releaseNotesValue = value.releaseNotes;
  const releaseNotes = releaseNotesValue === undefined ? [] : releaseNotesValue;
  if (!Array.isArray(releaseNotes) || releaseNotes.some((note) => typeof note !== "string")) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "manifest.releaseNotes must be a string array when present",
    );
  }

  const packagesValue = value.packages;
  if (!Array.isArray(packagesValue) || packagesValue.length === 0) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "manifest.packages must be a non-empty array",
    );
  }
  const packages = packagesValue.map((item, index) =>
    parsePackage(item, index, version, assetBaseUrl),
  );

  return {
    schemaVersion: 1,
    component: "fqgate",
    channel: "stable",
    status: "published",
    version,
    publishedAt,
    ...(minimumSupportedVersion === undefined ? {} : { minimumSupportedVersion }),
    releaseNotes,
    packages,
  };
}

export function parseStableManifestJson(
  json: string,
  assetBaseUrl = DEFAULT_ASSET_BASE_URL,
): FqgateRelease {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "Stable manifest is not valid JSON",
      undefined,
      { cause: error },
    );
  }
  return parseStableManifest(value, assetBaseUrl);
}

export function selectWindowsX64Package(release: FqgateRelease): FqgatePackage {
  const matches = release.packages.filter(
    (item) => item.platform === "windows" && item.architecture === "x86_64",
  );
  if (matches.length === 0) {
    throw new BridgeError(
      ERROR_CODES.PACKAGE_NOT_FOUND,
      "Stable manifest has no Windows x86_64 package",
    );
  }
  if (matches.length > 1) {
    throw new BridgeError(
      ERROR_CODES.PACKAGE_AMBIGUOUS,
      "Stable manifest has multiple Windows x86_64 packages",
    );
  }

  const selected = matches[0];
  if (selected === undefined) {
    throw new BridgeError(ERROR_CODES.PACKAGE_NOT_FOUND, "Windows x86_64 package selection failed");
  }
  if (
    selected.installMode !== "replaceExecutable" ||
    !selected.fileName.toLowerCase().endsWith(".exe")
  ) {
    throw new BridgeError(
      ERROR_CODES.MANIFEST_INVALID,
      "Windows x86_64 package is not a replaceable executable",
    );
  }
  return selected;
}
