import { createHash } from "node:crypto";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
import type { HttpTransport } from "./http.js";

const BASE = "https://raw.githubusercontent.com/fqgate/FQGate-releases/main/releases/v2/";
export const V2_MAX_METADATA_BYTES = 65_536;
export const V2_MAX_ARCHIVE_BYTES = 134_217_728;
export const V2_BLOCKERS = [
  "SIGNING_TRUST_ROOT_UNESTABLISHED",
  "SIGNATURE_ALGORITHM_AND_BYTES_CONTRACT_UNCONFIRMED",
  "KEY_ROTATION_AND_REVOCATION_UNCONFIRMED",
  "AUTHENTICATED_PERSISTENT_ANTI_ROLLBACK_UNIMPLEMENTED",
  "DIRECTORY_ACTIVATION_AND_CRASH_ROLLBACK_UNIMPLEMENTED",
  "V2_WINDOWS_RUNTIME_CONTRACT_NOT_QUALIFIED",
] as const;

export interface V2Inspection {
  readonly schemaVersion: 1;
  readonly trust: "UNAUTHENTICATED_OBSERVATION";
  readonly signatureVerified: false;
  readonly installAllowed: false;
  readonly runtimeQualified: false;
  readonly qualification: "BLOCKED";
  readonly blockers: typeof V2_BLOCKERS;
  readonly version: string;
  readonly publishedAt: string;
  readonly sequence: number;
  readonly refreshSequence: number;
  readonly keyIds: readonly string[];
  readonly metadataHashes: Readonly<Record<string, string>>;
  readonly githubReleaseUrl: string;
  readonly windows: {
    readonly fileName: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly assetUrl: string;
    readonly installMode: "replaceApplication";
    readonly requiredEntries: readonly ["FQGate.exe", "fqgate-updater.exe"];
  };
}

export function v2Invalid(): BridgeError {
  // Never echo untrusted strings, URLs, release notes or HTTP bodies.
  return new BridgeError(
    ERROR_CODES.MANIFEST_INVALID,
    "FQGate v2 observation is invalid or inconsistent",
  );
}
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw v2Invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw v2Invalid();
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw v2Invalid();
  return value;
}
function base64url(value: unknown, limit: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > limit ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw v2Invalid();
  const result = Buffer.from(value, "base64url");
  if (result.toString("base64url") !== value) throw v2Invalid();
  return result;
}
function json(bytes: Uint8Array): Record<string, unknown> {
  try {
    if (bytes.length > V2_MAX_METADATA_BYTES) throw v2Invalid();
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    throw v2Invalid();
  }
}
function envelope(bytes: Uint8Array): { keyId: string; payload: Record<string, unknown> } {
  const value = json(bytes);
  if (
    Object.keys(value).sort().join(",") !== "keyId,signature,signed" ||
    typeof value.keyId !== "string" ||
    !/^[a-z0-9-]{1,80}$/.test(value.keyId)
  )
    throw v2Invalid();
  if (base64url(value.signature, 128).length !== 64) throw v2Invalid();
  const payload = json(base64url(value.signed, V2_MAX_METADATA_BYTES));
  if (payload.schemaVersion !== 1 || payload.channel !== "stable") throw v2Invalid();
  return { keyId: value.keyId, payload };
}
async function get(http: HttpTransport, url: string): Promise<Uint8Array> {
  const result = await http.request(url, {
    method: "GET",
    redirect: "error",
    timeoutMs: 15_000,
    maxBytes: V2_MAX_METADATA_BYTES,
  });
  if (result.status !== 200 || result.body.byteLength > V2_MAX_METADATA_BYTES) throw v2Invalid();
  return result.body;
}

/** No trusted release object or qualification evidence can be produced here. */
export async function inspectV2(http: HttpTransport): Promise<V2Inspection> {
  const freshnessBytes = await get(http, `${BASE}freshness.json`);
  const freshness = envelope(freshnessBytes);
  const refreshSequence = integer(freshness.payload.refreshSequence);
  const stablePath = freshness.payload.stablePath;
  if (typeof stablePath !== "string" || !/^[1-9][0-9]{0,14}\/stable\.json$/.test(stablePath))
    throw v2Invalid();
  const stableBytes = await get(http, `${BASE}${stablePath}`);
  if (sha256(stableBytes) !== digest(freshness.payload.stableSha256)) throw v2Invalid();
  const stable = envelope(stableBytes);
  const sequence = integer(stable.payload.sequence);
  if (stablePath !== `${sequence}/stable.json`) throw v2Invalid();
  const version = stable.payload.version;
  if (typeof version !== "string" || !/^2\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/.test(version))
    throw v2Invalid();
  if (stable.payload.releasePath !== `${version}/release.json`) throw v2Invalid();
  const releaseBytes = await get(http, `${BASE}${version}/release.json`);
  if (sha256(releaseBytes) !== digest(stable.payload.releaseSha256)) throw v2Invalid();
  const release = envelope(releaseBytes);
  if (release.payload.version !== version || release.payload.sequence !== sequence)
    throw v2Invalid();
  const published = integer(release.payload.publishedAt);
  if (published > 253402300799) throw v2Invalid();
  const publishedAt = new Date(published * 1000).toISOString();
  const artifacts = release.payload.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0 || artifacts.length > 16)
    throw v2Invalid();
  const matches = artifacts
    .map(record)
    .filter((a) => a.platform === "windows" && a.arch === "x86_64");
  if (matches.length !== 1) throw v2Invalid();
  const artifact = matches[0]!;
  const fileName = `FQGate-${version}-windows-x64.zip`;
  const assetUrl = `https://github.com/fqgate/FQGate-releases/releases/download/fqgate-v${version}/${fileName}`;
  const bytes = integer(artifact.bytes);
  const hash = digest(artifact.sha256);
  const payload = record(artifact.updatePayload);
  if (
    bytes > V2_MAX_ARCHIVE_BYTES ||
    artifact.fileName !== fileName ||
    artifact.installMode !== "replaceApplication" ||
    record(artifact.downloadUrls).github !== assetUrl ||
    payload.schemaVersion !== 1 ||
    payload.format !== "zip" ||
    JSON.stringify(payload.requiredEntries) !== '["FQGate.exe","fqgate-updater.exe"]'
  )
    throw v2Invalid();
  // Gitee is descriptive only. It is never fetched or registered as a trusted source.
  const apiBytes = await get(
    http,
    `https://api.github.com/repos/fqgate/FQGate-releases/releases/tags/fqgate-v${version}`,
  );
  const api = json(apiBytes);
  const githubReleaseUrl = `https://github.com/fqgate/FQGate-releases/releases/tag/fqgate-v${version}`;
  if (
    api.tag_name !== `fqgate-v${version}` ||
    api.draft !== false ||
    api.prerelease !== false ||
    api.html_url !== githubReleaseUrl ||
    !Array.isArray(api.assets) ||
    api.assets.length > 64
  )
    throw v2Invalid();
  const assets = api.assets.map(record).filter((a) => a.name === fileName);
  if (
    assets.length !== 1 ||
    assets[0]!.size !== bytes ||
    assets[0]!.digest !== `sha256:${hash}` ||
    assets[0]!.browser_download_url !== assetUrl
  )
    throw v2Invalid();
  return {
    schemaVersion: 1,
    trust: "UNAUTHENTICATED_OBSERVATION",
    signatureVerified: false,
    installAllowed: false,
    runtimeQualified: false,
    qualification: "BLOCKED",
    blockers: V2_BLOCKERS,
    version,
    publishedAt,
    sequence,
    refreshSequence,
    keyIds: [freshness.keyId, stable.keyId, release.keyId],
    metadataHashes: {
      freshness: sha256(freshnessBytes),
      stable: sha256(stableBytes),
      release: sha256(releaseBytes),
      githubRelease: sha256(apiBytes),
    },
    githubReleaseUrl,
    windows: {
      fileName,
      bytes,
      sha256: hash,
      assetUrl,
      installMode: "replaceApplication",
      requiredEntries: ["FQGate.exe", "fqgate-updater.exe"],
    },
  };
}
