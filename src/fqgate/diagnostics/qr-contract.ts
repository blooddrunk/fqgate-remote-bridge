import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";
export const QR_CENSUS_CONTRACTS = [
  ["/v2/system/version", "get"],
  ["/v2/system/health", "get"],
  ["/v2/source-instances", "get"],
  ["/v2/source-instances/{instance_id}/account", "get"],
  ["/v2/source-instances/{instance_id}/authentication", "get"],
  ["/v2/source-instances/{instance_id}/authentication", "post"],
] as const;
export const V2_QR_FINGERPRINT = "1cc165c2086e6eece42f8a79b2ade2d13ffd7bf33edfec21d771e3c76cd87103";
export const V2_QR_UI_ASSET = {
  offset: 37707250,
  bytes: 20498,
  sha256: "359e0ab1428081d539a82bb3f740c5100dd3060122c42c5e58c927f90f55f3bc",
} as const;
export const V2_QR_LOCAL_API_ASSET = {
  offset: 35975307,
  bytes: 3560,
  sha256: "018d033fbbbcec18beca176edea3aa8fc8cdbb272292bcac4068ee3add4ef55a",
} as const;
/** Verifies static bundled client bytes only. Never executes the PE or saves embedded content. */
export async function verifyInstalledQrClient(executable: string) {
  try {
    const before = await lstat(executable);
    if (!before.isFile() || before.isSymbolicLink() || before.size !== 53590016) throw Error();
    const bytes = await readFile(executable),
      hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    const exe = hash(bytes);
    if (exe !== "d0a104f6d25b98b971999a585080ccbe0c9bc9470ca86a602d937f6d23816847") throw Error();
    for (const asset of [V2_QR_UI_ASSET, V2_QR_LOCAL_API_ASSET]) {
      if (hash(bytes.subarray(asset.offset, asset.offset + asset.bytes)) !== asset.sha256)
        throw Error();
    }
    const after = await lstat(executable);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino
    )
      throw Error();
    return {
      evidenceKind: "EXACT_INSTALLED_STATIC_CLIENT" as const,
      executableSha256: exe,
      sourceClientSha256: V2_QR_UI_ASSET.sha256,
      localApiClientSha256: V2_QR_LOCAL_API_ASSET.sha256,
      liveWireVerified: false as const,
    };
  } catch {
    throw new BridgeError(
      ERROR_CODES.OPENAPI_CONTRACT_MISSING,
      "The exact installed QR client contract could not be verified",
    );
  }
}
